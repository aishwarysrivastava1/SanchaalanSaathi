import datetime as dt
from datetime import datetime
import os
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func

from db.base import get_db
from db.models import User, VolunteerProfile, Task, Assignment, Notification, TaskEnrollmentRequest
from api.schemas import VolunteerProfileResponse
from middleware.consent import require_ai_training_consent
from middleware.rbac import CurrentUser, require_volunteer
from services.assignment_dispatcher import dispatch_optimized_assignments
from services.geo_routing_service import haversine_km
from services.live_location_cache import live_location_cache
from services.neo4j_service import neo4j_service
from services.realtime_events import realtime_bus

router = APIRouter()
ENABLE_DYNAMIC_REASSIGNMENT = os.getenv("ENABLE_DYNAMIC_REASSIGNMENT", "true").lower() == "true"
REASSIGNMENT_MOVE_THRESHOLD_KM = float(os.getenv("REASSIGNMENT_MOVE_THRESHOLD_KM", "0.2"))


# ── Pydantic models ──────────────────────────────────────────────────────────

class ProfileUpdateReq(BaseModel):
    skills:        Optional[List[str]] = None
    availability:  Optional[dict]      = None
    full_name:     Optional[str]       = Field(None, max_length=200)
    phone:         Optional[str]       = Field(None, max_length=30)
    city:          Optional[str]       = Field(None, max_length=100)
    bio:           Optional[str]       = None
    date_of_birth: Optional[str]       = None  # YYYY-MM-DD
    emergency_contact_name: Optional[str] = Field(None, max_length=200)
    emergency_contact_phone: Optional[str] = Field(None, max_length=30)
    education_level: Optional[str] = Field(None, max_length=80)
    years_experience: Optional[int] = Field(None, ge=0, le=80)
    preferred_roles: Optional[List[str]] = None
    certifications: Optional[List[str]] = None
    languages: Optional[List[str]] = None
    causes_supported: Optional[List[str]] = None
    motivation_statement: Optional[str] = Field(None, max_length=2000)
    availability_notes: Optional[str] = Field(None, max_length=1200)


class EnrollReq(BaseModel):
    reason:     str = Field(..., min_length=10, max_length=2000)
    why_useful: str = Field(..., min_length=10, max_length=2000)


class LocationUpdateReq(BaseModel):
    lat:            float = Field(..., ge=-90,  le=90)
    lng:            float = Field(..., ge=-180, le=180)
    share_location: bool  = True


class SOSReq(BaseModel):
    message: Optional[str] = Field(None, max_length=500)
    lat: Optional[float] = Field(None, ge=-90, le=90)
    lng: Optional[float] = Field(None, ge=-180, le=180)


# ── Dashboard ────────────────────────────────────────────────────────────────

@router.get("/dashboard")
async def vol_dashboard(
    user: CurrentUser = Depends(require_volunteer),
    db: AsyncSession = Depends(get_db),
):
    assigned = (await db.execute(
        select(func.count()).select_from(Assignment).where(
            Assignment.volunteer_id == user.user_id,
            Assignment.ngo_id == user.ngo_id,
            Assignment.status.in_(["assigned", "accepted"]),
        )
    )).scalar() or 0

    completed = (await db.execute(
        select(func.count()).select_from(Assignment).where(
            Assignment.volunteer_id == user.user_id,
            Assignment.ngo_id == user.ngo_id,
            Assignment.status == "completed",
        )
    )).scalar() or 0

    unread_notifs = (await db.execute(
        select(func.count()).select_from(Notification).where(
            Notification.user_id == user.user_id, Notification.is_read == False  # noqa: E712
        )
    )).scalar() or 0

    # Upcoming deadlines (open assignments)
    upcoming_rows = (await db.execute(
        select(Task, Assignment)
        .join(Assignment, Assignment.task_id == Task.id)
        .where(
            Assignment.volunteer_id == user.user_id,
            Assignment.ngo_id == user.ngo_id,
            Assignment.status.in_(["assigned", "accepted"]),
            Task.deadline != None,  # noqa: E711
        )
        .order_by(Task.deadline.asc())
        .limit(5)
    )).fetchall()

    deadlines = [
        {"task_id": t.id, "title": t.title, "deadline": t.deadline, "assignment_status": a.status}
        for t, a in upcoming_rows
    ]

    # Assignments list for dashboard display
    assignment_rows = (await db.execute(
        select(Task, Assignment)
        .join(Assignment, Assignment.task_id == Task.id)
        .where(
            Assignment.volunteer_id == user.user_id,
            Assignment.ngo_id == user.ngo_id,
        )
        .order_by(Assignment.assigned_at.desc())
        .limit(10)
    )).fetchall()

    assignments = [
        {
            "id":               a.id,
            "task_title":       t.title,
            "task_description": t.description,
            "required_skills":  t.required_skills,
            "status":           a.status,
            "deadline":         t.deadline,
            "assigned_at":      a.assigned_at,
        }
        for t, a in assignment_rows
    ]

    return {
        "assigned_tasks":        assigned,
        "completed_tasks":       completed,
        "unread_notifications":  unread_notifs,
        "upcoming_deadlines":    deadlines,
        "assignments":           assignments,
    }


# ── Profile ──────────────────────────────────────────────────────────────────

@router.get("/profile", response_model=VolunteerProfileResponse)
async def get_profile(
    user: CurrentUser = Depends(require_volunteer),
    db: AsyncSession = Depends(get_db),
):
    u = await db.get(User, user.user_id)
    p = (await db.execute(
        select(VolunteerProfile).where(VolunteerProfile.user_id == user.user_id)
    )).scalar_one_or_none()

    # Performance stats
    total_assigned = (await db.execute(
        select(func.count()).select_from(Assignment).where(
            Assignment.volunteer_id == user.user_id,
            Assignment.ngo_id == user.ngo_id,
            Assignment.status != "assigned",
        )
    )).scalar() or 0

    completed_count = (await db.execute(
        select(func.count()).select_from(Assignment).where(
            Assignment.volunteer_id == user.user_id,
            Assignment.ngo_id == user.ngo_id,
            Assignment.status == "completed",
        )
    )).scalar() or 0

    acceptance_rate  = round(completed_count / max(total_assigned, 1), 4)
    performance_score = round(acceptance_rate * 100, 1)

    return {
        "user_id":          user.user_id,
        "email":            u.email if u else user.email,
        "ngo_id":           user.ngo_id,
        "skills":           p.skills          if p else [],
        "availability":     p.availability    if p else {},
        "status":           p.status          if p else "active",
        "share_location":   p.share_location  if p else False,
        "full_name":        p.full_name        if p else None,
        "phone":            p.phone            if p else None,
        "city":             p.city             if p else None,
        "bio":              p.bio              if p else None,
        "date_of_birth":    p.date_of_birth.isoformat() if p and p.date_of_birth else None,
        "emergency_contact_name": p.emergency_contact_name if p else None,
        "emergency_contact_phone": p.emergency_contact_phone if p else None,
        "education_level": p.education_level if p else None,
        "years_experience": p.years_experience if p else None,
        "preferred_roles": p.preferred_roles if p else [],
        "certifications": p.certifications if p else [],
        "languages": p.languages if p else [],
        "causes_supported": p.causes_supported if p else [],
        "motivation_statement": p.motivation_statement if p else None,
        "availability_notes": p.availability_notes if p else None,
        "profile_completeness_score": p.profile_completeness_score if p else 0,
        "completed_tasks":  completed_count,
        "total_assigned":   total_assigned,
        "acceptance_rate":  acceptance_rate,
        "performance_score": performance_score,
    }


@router.put("/profile")
async def update_profile(
    req: ProfileUpdateReq,
    user: CurrentUser = Depends(require_volunteer),
    db: AsyncSession = Depends(get_db),
):
    p = (await db.execute(
        select(VolunteerProfile).where(VolunteerProfile.user_id == user.user_id)
    )).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Profile not found")

    if req.skills is not None:        p.skills = req.skills
    if req.availability is not None:  p.availability = req.availability
    if req.full_name is not None:     p.full_name = req.full_name
    if req.phone is not None:         p.phone = req.phone
    if req.city is not None:          p.city = req.city
    if req.bio is not None:           p.bio = req.bio
    if req.emergency_contact_name is not None: p.emergency_contact_name = req.emergency_contact_name
    if req.emergency_contact_phone is not None: p.emergency_contact_phone = req.emergency_contact_phone
    if req.education_level is not None: p.education_level = req.education_level
    if req.years_experience is not None: p.years_experience = req.years_experience
    if req.preferred_roles is not None: p.preferred_roles = req.preferred_roles
    if req.certifications is not None: p.certifications = req.certifications
    if req.languages is not None: p.languages = req.languages
    if req.causes_supported is not None: p.causes_supported = req.causes_supported
    if req.motivation_statement is not None: p.motivation_statement = req.motivation_statement
    if req.availability_notes is not None: p.availability_notes = req.availability_notes
    if req.date_of_birth is not None:
        try:
            p.date_of_birth = dt.date.fromisoformat(req.date_of_birth)
        except ValueError:
            raise HTTPException(status_code=400, detail="date_of_birth must be YYYY-MM-DD")

    profile_fields = [
        p.full_name,
        p.phone,
        p.city,
        p.bio,
        p.date_of_birth,
        p.emergency_contact_name,
        p.emergency_contact_phone,
        p.education_level,
        p.motivation_statement,
    ]
    list_fields = [p.skills, p.preferred_roles, p.languages, p.causes_supported]
    filled_scalar = sum(1 for v in profile_fields if v)
    filled_lists = sum(1 for v in list_fields if v and len(v) > 0)
    p.profile_completeness_score = round(((filled_scalar + filled_lists) / 13) * 100, 1)
    p.last_active_at = dt.datetime.utcnow()

    u = await db.get(User, user.user_id)
    if u and p.profile_completeness_score >= 60 and not u.profile_completed_at:
        u.profile_completed_at = dt.datetime.utcnow()
    return {"message": "Profile updated"}


# ── Tasks & Assignments ──────────────────────────────────────────────────────

@router.get("/tasks")
async def get_my_tasks(
    user: CurrentUser = Depends(require_volunteer),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(Task, Assignment)
        .join(Assignment, Assignment.task_id == Task.id)
        .where(
            Assignment.volunteer_id == user.user_id,
            Assignment.ngo_id == user.ngo_id,
        )
        .order_by(Assignment.assigned_at.desc())
    )).fetchall()

    return [
        {
            "task_id":           t.id,
            "title":             t.title,
            "description":       t.description,
            "required_skills":   t.required_skills,
            "task_status":       t.status,
            "deadline":          t.deadline,
            "assignment_id":     a.id,
            "assignment_status": a.status,
            "assigned_at":       a.assigned_at,
        }
        for t, a in rows
    ]


@router.get("/assignments")
async def get_my_assignments(
    user: CurrentUser = Depends(require_volunteer),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(Assignment).where(
            Assignment.volunteer_id == user.user_id,
            Assignment.ngo_id == user.ngo_id,
        )
        .order_by(Assignment.assigned_at.desc())
    )).scalars().all()
    return [
        {"id": a.id, "task_id": a.task_id, "status": a.status, "assigned_at": a.assigned_at}
        for a in rows
    ]


@router.post("/assignments/{assignment_id}/accept")
async def accept_assignment(
    assignment_id: str,
    user: CurrentUser = Depends(require_volunteer),
    db: AsyncSession = Depends(get_db),
):
    a = (await db.execute(
        select(Assignment).where(
            Assignment.id == assignment_id,
            Assignment.volunteer_id == user.user_id,
            Assignment.ngo_id == user.ngo_id,
        )
    )).scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if a.status != "assigned":
        raise HTTPException(status_code=400, detail=f"Cannot accept — current status: {a.status}")

    a.status = "accepted"
    a.accepted_at = dt.datetime.utcnow()

    # Notify NGO admin
    task = await db.get(Task, a.task_id)
    admin = (await db.execute(
        select(User).where(User.ngo_id == user.ngo_id, User.role == "ngo_admin")
    )).scalar_one_or_none()
    if admin and task:
        db.add(Notification(
            user_id=admin.id,
            message=f"Volunteer accepted task: {task.title}",
            type="status_update",
        ))
    return {"status": "accepted"}


@router.post("/assignments/{assignment_id}/reject")
async def reject_assignment(
    assignment_id: str,
    user: CurrentUser = Depends(require_volunteer),
    db: AsyncSession = Depends(get_db),
):
    a = (await db.execute(
        select(Assignment).where(
            Assignment.id == assignment_id,
            Assignment.volunteer_id == user.user_id,
            Assignment.ngo_id == user.ngo_id,
        )
    )).scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if a.status not in ("assigned", "accepted"):
        raise HTTPException(status_code=400, detail=f"Cannot reject — current status: {a.status}")

    a.status = "rejected"

    # Reopen task only if it belongs to our NGO
    task = (await db.execute(
        select(Task).where(Task.id == a.task_id, Task.ngo_id == user.ngo_id)
    )).scalar_one_or_none()
    if task:
        task.status = "open"

    admin = (await db.execute(
        select(User).where(User.ngo_id == user.ngo_id, User.role == "ngo_admin")
    )).scalar_one_or_none()
    if admin and task:
        db.add(Notification(
            user_id=admin.id,
            message=f"Volunteer rejected task: {task.title}",
            type="status_update",
        ))
    return {"status": "rejected"}


# ── Complete Assignment ───────────────────────────────────────────────────────

@router.post("/assignments/{assignment_id}/complete")
async def complete_assignment(
    assignment_id: str,
    user: CurrentUser = Depends(require_volunteer),
    db: AsyncSession = Depends(get_db),
):
    a = (await db.execute(
        select(Assignment).where(
            Assignment.id == assignment_id,
            Assignment.volunteer_id == user.user_id,
            Assignment.ngo_id == user.ngo_id,
        )
    )).scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if a.status != "accepted":
        raise HTTPException(status_code=400, detail=f"Cannot complete — current status: {a.status}")

    a.status = "completed"
    a.completed_at = dt.datetime.utcnow()

    task = await db.get(Task, a.task_id)
    task_completed = False

    if task:
        active_remaining = (await db.execute(
            select(func.count()).select_from(Assignment).where(
                Assignment.task_id == a.task_id,
                Assignment.status.in_(["assigned", "accepted"]),
            )
        )).scalar() or 0
        if active_remaining == 0:
            task.status = "completed"
            task_completed = True

        admin = (await db.execute(
            select(User).where(User.ngo_id == user.ngo_id, User.role == "ngo_admin")
        )).scalar_one_or_none()
        if admin:
            db.add(Notification(
                user_id=admin.id,
                message=f"Volunteer {user.email} completed: {task.title}",
                type="status_update",
            ))

    return {"status": "completed", "task_completed": task_completed}


# ── Recommendations ───────────────────────────────────────────────────────────

@router.get("/recommendations")
async def get_recommendations(
    user: CurrentUser = Depends(require_ai_training_consent),
    db: AsyncSession = Depends(get_db),
):
    profile = (await db.execute(
        select(VolunteerProfile).where(VolunteerProfile.user_id == user.user_id)
    )).scalar_one_or_none()

    vol_skills = {s.lower() for s in (profile.skills or [])} if profile else set()

    open_tasks = (await db.execute(
        select(Task).where(Task.ngo_id == user.ngo_id, Task.status == "open")
    )).scalars().all()

    results = []
    for t in open_tasks:
        required = t.required_skills or []
        matched = [s for s in required if s.lower() in vol_skills]
        score = len(matched) / max(len(required), 1)
        results.append({
            "task_id":         t.id,
            "title":           t.title,
            "description":     t.description,
            "required_skills": required,
            "deadline":        t.deadline,
            "priority":        t.priority,
            "match_score":     round(score, 3),
            "matched_skills":  matched,
        })

    results.sort(key=lambda x: x["match_score"], reverse=True)
    return results[:5]


# ── Notifications ─────────────────────────────────────────────────────────────

@router.get("/notifications")
async def get_notifications(
    user: CurrentUser = Depends(require_volunteer),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(Notification)
        .where(Notification.user_id == user.user_id)
        .order_by(Notification.is_read.asc(), Notification.created_at.desc())
        .limit(50)
    )).scalars().all()
    return [
        {"id": n.id, "message": n.message, "type": n.type, "is_read": n.is_read, "created_at": n.created_at}
        for n in rows
    ]


@router.put("/location")
async def update_location(
    req: LocationUpdateReq,
    user: CurrentUser = Depends(require_volunteer),
    db: AsyncSession = Depends(get_db),
):
    vp = (await db.execute(
        select(VolunteerProfile).where(VolunteerProfile.user_id == user.user_id)
    )).scalar_one_or_none()
    if not vp:
        raise HTTPException(status_code=404, detail="Volunteer profile not found")
    old_lat, old_lng = vp.lat, vp.lng
    vp.lat = req.lat
    vp.lng = req.lng
    vp.share_location = req.share_location

    await live_location_cache.set_location(
        volunteer_id=user.user_id,
        ngo_id=user.ngo_id,
        lat=req.lat,
        lng=req.lng,
        share_location=req.share_location,
    )
    await neo4j_service.upsert_volunteer_location(
        volunteer_id=user.user_id,
        ngo_id=user.ngo_id,
        lat=req.lat,
        lng=req.lng,
        share_location=req.share_location,
    )
    await realtime_bus.publish(
        user.ngo_id,
        "location_update",
        {
            "volunteer_id": user.user_id,
            "lat": req.lat,
            "lng": req.lng,
            "share_location": req.share_location,
        },
    )

    moved_km = 0.0
    if old_lat is not None and old_lng is not None:
        moved_km = haversine_km(old_lat, old_lng, req.lat, req.lng)
    if ENABLE_DYNAMIC_REASSIGNMENT and req.share_location and moved_km >= REASSIGNMENT_MOVE_THRESHOLD_KM:
        await dispatch_optimized_assignments(ngo_id=user.ngo_id, db=db, max_assignments=2)
    return {"share_location": vp.share_location, "lat": vp.lat, "lng": vp.lng}


@router.delete("/location")
async def clear_location(
    user: CurrentUser = Depends(require_volunteer),
    db: AsyncSession = Depends(get_db),
):
    vp = (await db.execute(
        select(VolunteerProfile).where(VolunteerProfile.user_id == user.user_id)
    )).scalar_one_or_none()
    if not vp:
        raise HTTPException(status_code=404, detail="Volunteer profile not found")
    vp.lat = None
    vp.lng = None
    vp.share_location = False

    await live_location_cache.set_location(
        volunteer_id=user.user_id,
        ngo_id=user.ngo_id,
        lat=None,
        lng=None,
        share_location=False,
    )
    await neo4j_service.upsert_volunteer_location(
        volunteer_id=user.user_id,
        ngo_id=user.ngo_id,
        lat=None,
        lng=None,
        share_location=False,
    )
    await realtime_bus.publish(
        user.ngo_id,
        "location_update",
        {
            "volunteer_id": user.user_id,
            "lat": None,
            "lng": None,
            "share_location": False,
        },
    )
    return {"share_location": False}


@router.post("/sos")
async def send_sos(
    req: SOSReq,
    user: CurrentUser = Depends(require_volunteer),
    db: AsyncSession = Depends(get_db),
):
    profile = (await db.execute(
        select(VolunteerProfile).where(VolunteerProfile.user_id == user.user_id)
    )).scalar_one_or_none()
    lat = req.lat if req.lat is not None else (profile.lat if profile else None)
    lng = req.lng if req.lng is not None else (profile.lng if profile else None)
    message = (req.message or "Volunteer triggered SOS").strip()

    admins = (await db.execute(
        select(User).where(User.ngo_id == user.ngo_id, User.role == "ngo_admin")
    )).scalars().all()
    for admin in admins:
        db.add(Notification(
            user_id=admin.id,
            message=f"SOS from {user.email}: {message}",
            type="urgent",
        ))

    await realtime_bus.publish(
        user.ngo_id,
        "sos_alert",
        {
            "volunteer_id": user.user_id,
            "email": user.email,
            "message": message,
            "lat": lat,
            "lng": lng,
            "created_at": dt.datetime.utcnow().isoformat() + "Z",
        },
    )
    return {"status": "sent", "notified": len(admins)}


@router.get("/open-tasks")
async def get_open_tasks(
    user: CurrentUser = Depends(require_volunteer),
    db: AsyncSession = Depends(get_db),
):
    profile = (await db.execute(
        select(VolunteerProfile).where(VolunteerProfile.user_id == user.user_id)
    )).scalar_one_or_none()
    vol_skills = {s.lower() for s in (profile.skills or [])} if profile else set()

    tasks = (await db.execute(
        select(Task).where(Task.ngo_id == user.ngo_id, Task.status == "open")
        .order_by(Task.created_at.desc())
    )).scalars().all()

    # Get this volunteer's existing requests
    req_rows = (await db.execute(
        select(TaskEnrollmentRequest).where(
            TaskEnrollmentRequest.volunteer_id == user.user_id,
            TaskEnrollmentRequest.ngo_id == user.ngo_id,
        )
    )).scalars().all()
    req_map = {r.task_id: r.status for r in req_rows}

    result = []
    for t in tasks:
        required = t.required_skills or []
        matched = [s for s in required if s.lower() in vol_skills]
        score = round(len(matched) / max(len(required), 1), 3)
        result.append({
            "id":              t.id,
            "title":           t.title,
            "description":     t.description,
            "required_skills": required,
            "priority":        t.priority,
            "deadline":        t.deadline,
            "created_at":      t.created_at,
            "match_score":     score,
            "matched_skills":  matched,
            "request_status":  req_map.get(t.id),
        })
    return result


@router.post("/tasks/{task_id}/enroll")
async def enroll_task(
    task_id: str,
    req: EnrollReq,
    user: CurrentUser = Depends(require_volunteer),
    db: AsyncSession = Depends(get_db),
):
    task = (await db.execute(
        select(Task).where(Task.id == task_id, Task.ngo_id == user.ngo_id, Task.status == "open")
    )).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found or not open")

    existing = (await db.execute(
        select(TaskEnrollmentRequest).where(
            TaskEnrollmentRequest.task_id == task_id,
            TaskEnrollmentRequest.volunteer_id == user.user_id,
            TaskEnrollmentRequest.status == "pending",
        )
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="You already have a pending request for this task")

    enroll = TaskEnrollmentRequest(
        task_id=task_id,
        volunteer_id=user.user_id,
        ngo_id=user.ngo_id,
        reason=req.reason,
        why_useful=req.why_useful,
    )
    db.add(enroll)

    admin = (await db.execute(
        select(User).where(User.ngo_id == user.ngo_id, User.role == "ngo_admin")
    )).scalar_one_or_none()
    if admin:
        db.add(Notification(
            user_id=admin.id,
            message=f"Volunteer {user.email} requested to join task: {task.title}",
            type="general",
        ))
    await db.flush()
    return {"message": "Enrollment request submitted", "id": enroll.id}


@router.get("/enrollment-requests")
async def get_my_enrollment_requests(
    user: CurrentUser = Depends(require_volunteer),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(TaskEnrollmentRequest, Task)
        .join(Task, Task.id == TaskEnrollmentRequest.task_id)
        .where(TaskEnrollmentRequest.volunteer_id == user.user_id)
        .order_by(TaskEnrollmentRequest.created_at.desc())
    )).fetchall()
    return [
        {
            "id":         r.id,
            "task_id":    r.task_id,
            "task_title": t.title,
            "reason":     r.reason,
            "why_useful": r.why_useful,
            "status":     r.status,
            "created_at": r.created_at,
        }
        for r, t in rows
    ]


@router.post("/notifications/{notif_id}/read")
async def mark_read(
    notif_id: str,
    user: CurrentUser = Depends(require_volunteer),
    db: AsyncSession = Depends(get_db),
):
    n = (await db.execute(
        select(Notification).where(Notification.id == notif_id, Notification.user_id == user.user_id)
    )).scalar_one_or_none()
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    n.is_read = True
    return {"message": "Marked as read"}
