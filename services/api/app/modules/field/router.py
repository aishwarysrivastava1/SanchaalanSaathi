"""Volunteer API: assignments, open tasks, profile, location and SOS.
"""
from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, select, update

from app.core.deps import DbSession, VolunteerUser
from app.core.errors import BadRequest, Conflict, NotFound
from app.core.events import realtime_bus
from app.core.ratelimit import limiter
from app.domain import locations
from app.models import (
    Assignment,
    Notification,
    Task,
    TaskEnrollmentRequest,
    User,
    VolunteerProfile,
    utcnow,
)
from app.schemas import (
    CompleteAssignmentRequest,
    EnrollRequest,
    LocationUpdate,
    ProfileUpdate,
    SOSRequest,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/volunteer", tags=["field"])

ACTIVE = ("assigned", "accepted")

# A phone pinging GPS every few seconds is normal; a client stuck in a retry
# loop is not. 60/min per user is generous for the former, a wall for the latter.
location_limit = limiter("location", limit=60, window_seconds=60, by="user")
sos_limit = limiter("sos", limit=5, window_seconds=300, by="user")


@router.get("/dashboard")
async def dashboard(session: DbSession, user: VolunteerUser) -> dict:
    uid, nid = user.user_id, user.ngo_id

    active, completed = (
        await session.execute(
            select(
                func.count(Assignment.id).filter(Assignment.status.in_(ACTIVE)),
                func.count(Assignment.id).filter(Assignment.status == "completed"),
            ).where(Assignment.volunteer_id == uid, Assignment.ngo_id == nid)
        )
    ).one()

    unread = await session.scalar(
        select(func.count(Notification.id)).where(
            Notification.user_id == uid, Notification.is_read.is_(False)
        )
    )

    # Single join, replacing the old per-assignment Task.objects.get().
    upcoming_rows = (
        await session.execute(
            select(Task.id, Task.title, Task.deadline, Assignment.status)
            .join(Assignment, Assignment.task_id == Task.id)
            .where(
                Assignment.volunteer_id == uid,
                Assignment.ngo_id == nid,
                Assignment.status.in_(ACTIVE),
                Task.deadline.is_not(None),
            )
            .order_by(Task.deadline.asc())
            .limit(5)
        )
    ).all()

    return {
        "active_assignments": active,
        "completed_tasks": completed,
        "unread_notifications": unread or 0,
        "upcoming_deadlines": [
            {
                "task_id": tid,
                "title": title,
                "deadline": deadline,
                "assignment_status": a_status,
            }
            for tid, title, deadline, a_status in upcoming_rows
        ],
    }


@router.get("/tasks")
async def my_tasks(session: DbSession, user: VolunteerUser) -> list[dict]:
    rows = (
        await session.execute(
            select(Assignment, Task)
            .join(Task, Task.id == Assignment.task_id)
            .where(Assignment.volunteer_id == user.user_id, Assignment.ngo_id == user.ngo_id)
            .order_by(Assignment.assigned_at.desc())
        )
    ).all()
    return [
        {
            "assignment_id": a.id,
            "task_id": t.id,
            "title": t.title,
            "description": t.description,
            "required_skills": t.required_skills,
            "priority": t.priority,
            "task_status": t.status,
            "assignment_status": a.status,
            "deadline": t.deadline,
            "lat": t.lat,
            "lng": t.lng,
            "assigned_at": a.assigned_at,
            "accepted_at": a.accepted_at,
            "completed_at": a.completed_at,
        }
        for a, t in rows
    ]


@router.get("/open-tasks")
async def open_tasks(session: DbSession, user: VolunteerUser) -> list[dict]:
    taken = select(Assignment.task_id).where(
        Assignment.volunteer_id == user.user_id,
        Assignment.ngo_id == user.ngo_id,
        Assignment.status != "rejected",
    )
    rows = (
        await session.scalars(
            select(Task)
            .where(
                Task.ngo_id == user.ngo_id,
                Task.status == "open",
                Task.id.not_in(taken),
            )
            .order_by(Task.urgency_score.desc())
        )
    ).all()
    return [
        {
            "id": t.id,
            "title": t.title,
            "description": t.description,
            "required_skills": t.required_skills,
            "priority": t.priority,
            "deadline": t.deadline,
            "lat": t.lat,
            "lng": t.lng,
            "urgency_score": t.urgency_score,
        }
        for t in rows
    ]


@router.get("/assignments")
async def my_assignments(session: DbSession, user: VolunteerUser) -> list[dict]:
    rows = (
        await session.scalars(
            select(Assignment)
            .where(Assignment.volunteer_id == user.user_id, Assignment.ngo_id == user.ngo_id)
            .order_by(Assignment.assigned_at.desc())
        )
    ).all()
    return [
        {
            "id": a.id,
            "task_id": a.task_id,
            "status": a.status,
            "assigned_at": a.assigned_at,
            "match_score": a.match_score,
        }
        for a in rows
    ]


async def _assignment_action(
    session: DbSession,
    assignment_id: str,
    user: VolunteerUser,
    action: str,
    hours_spent: float | None = None,
) -> dict:
    assignment = await session.scalar(
        select(Assignment).where(
            Assignment.id == assignment_id,
            Assignment.volunteer_id == user.user_id,
            Assignment.ngo_id == user.ngo_id,
        )
    )
    if assignment is None:
        raise NotFound("Assignment")

    now = utcnow()
    if action == "accept":
        if assignment.status != "assigned":
            raise Conflict(f"Assignment is already {assignment.status}")
        assignment.status = "accepted"
        assignment.accepted_at = now

    elif action == "reject":
        if assignment.status not in ("assigned", "accepted"):
            raise Conflict(f"Assignment is already {assignment.status}")
        assignment.status = "rejected"

    elif action == "complete":
        if assignment.status != "accepted":
            raise BadRequest("Assignment must be accepted before completing")
        assignment.status = "completed"
        assignment.completed_at = now
        if hours_spent is not None:
            assignment.hours_spent = hours_spent

        # Close the parent task only once nobody else is still working it.
        remaining = await session.scalar(
            select(func.count(Assignment.id)).where(
                Assignment.task_id == assignment.task_id,
                Assignment.status.in_(ACTIVE),
                Assignment.id != assignment.id,
            )
        )
        if not remaining:
            task = await session.get(Task, assignment.task_id)
            if task is not None:
                task.status = "completed"

        try:
            from app.integrations.neo4j import neo4j_service

            await neo4j_service.record_completion(user.user_id, assignment.completion_rating)
        except Exception as exc:
            logger.warning("Graph completion counter failed for %s: %s", user.user_id, exc)

    await realtime_bus.publish(
        user.ngo_id,
        "assignment_updated",
        {
            "assignment_id": assignment.id,
            "task_id": assignment.task_id,
            "volunteer_id": user.user_id,
            "status": assignment.status,
        },
    )
    return {"assignment_id": assignment.id, "status": assignment.status}


@router.post("/assignments/{assignment_id}/accept")
async def accept_assignment(
    assignment_id: str, session: DbSession, user: VolunteerUser
) -> dict:
    return await _assignment_action(session, assignment_id, user, "accept")


@router.post("/assignments/{assignment_id}/reject")
async def reject_assignment(
    assignment_id: str, session: DbSession, user: VolunteerUser
) -> dict:
    return await _assignment_action(session, assignment_id, user, "reject")


@router.post("/assignments/{assignment_id}/complete")
async def complete_assignment(
    assignment_id: str,
    session: DbSession,
    user: VolunteerUser,
    data: CompleteAssignmentRequest | None = None,
) -> dict:
    return await _assignment_action(
        session, assignment_id, user, "complete", data.hours_spent if data else None
    )


@router.post("/tasks/{task_id}/enroll", status_code=status.HTTP_201_CREATED)
async def enroll(
    task_id: str, data: EnrollRequest, session: DbSession, user: VolunteerUser
) -> dict:
    task = await session.scalar(
        select(Task).where(
            Task.id == task_id, Task.ngo_id == user.ngo_id, Task.status == "open"
        )
    )
    if task is None:
        raise NotFound("Open task")

    existing = await session.scalar(
        select(TaskEnrollmentRequest.id).where(
            TaskEnrollmentRequest.task_id == task_id,
            TaskEnrollmentRequest.volunteer_id == user.user_id,
            TaskEnrollmentRequest.ngo_id == user.ngo_id,
        )
    )
    if existing:
        raise Conflict("You have already requested to join this task")

    enrollment = TaskEnrollmentRequest(
        task_id=task_id,
        volunteer_id=user.user_id,
        ngo_id=user.ngo_id,
        reason=data.reason,
        why_useful=data.why_useful,
        status="pending",
    )
    session.add(enrollment)
    await session.flush()
    await realtime_bus.publish(
        user.ngo_id,
        "enrollment_requested",
        {"enrollment_id": enrollment.id, "task_id": task_id, "task_title": task.title},
    )
    return {"enrollment_id": enrollment.id, "status": enrollment.status}


@router.get("/enrollment-requests")
async def my_enrollments(session: DbSession, user: VolunteerUser) -> list[dict]:
    rows = (
        await session.execute(
            select(TaskEnrollmentRequest, Task.title)
            .outerjoin(Task, Task.id == TaskEnrollmentRequest.task_id)
            .where(
                TaskEnrollmentRequest.volunteer_id == user.user_id,
                TaskEnrollmentRequest.ngo_id == user.ngo_id,
            )
            .order_by(TaskEnrollmentRequest.created_at.desc())
        )
    ).all()
    return [
        {
            "id": e.id,
            "task_id": e.task_id,
            "task_title": title,
            "reason": e.reason,
            "why_useful": e.why_useful,
            "status": e.status,
            "created_at": e.created_at,
        }
        for e, title in rows
    ]


@router.get("/recommendations")
async def recommendations(
    session: DbSession, user: VolunteerUser, limit: Annotated[int, Query(ge=1, le=20)] = 5
) -> list[dict]:
    profile = await session.scalar(
        select(VolunteerProfile).where(
            VolunteerProfile.user_id == user.user_id,
            VolunteerProfile.ngo_id == user.ngo_id,
        )
    )
    vol_skills = {
        s.lower().strip() for s in (profile.skills or []) if s and s.strip()
    } if profile else set()

    taken = select(Assignment.task_id).where(
        Assignment.volunteer_id == user.user_id, Assignment.status != "rejected"
    )
    tasks = (
        await session.scalars(
            select(Task).where(
                Task.ngo_id == user.ngo_id,
                Task.status == "open",
                # Recommending a task you are already on was a long-standing
                # annoyance in the Django version.
                Task.id.not_in(taken),
            )
        )
    ).all()

    scored = []
    for task in tasks:
        required = task.required_skills or []
        matched = [s for s in required if s.lower().strip() in vol_skills]
        scored.append(
            {
                "task_id": task.id,
                "title": task.title,
                "description": task.description,
                "required_skills": required,
                "deadline": task.deadline,
                "priority": task.priority,
                "match_score": round(len(matched) / max(len(required), 1), 3),
                "matched_skills": matched,
            }
        )
    scored.sort(key=lambda r: (r["match_score"], r["priority"] == "high"), reverse=True)
    return scored[:limit]


@router.get("/profile")
async def get_profile(session: DbSession, user: VolunteerUser) -> dict:
    profile = await session.scalar(
        select(VolunteerProfile).where(
            VolunteerProfile.user_id == user.user_id,
            VolunteerProfile.ngo_id == user.ngo_id,
        )
    )
    if profile is None:
        raise NotFound("Profile")

    total, completed = (
        await session.execute(
            select(
                func.count(Assignment.id),
                func.count(Assignment.id).filter(Assignment.status == "completed"),
            ).where(
                Assignment.volunteer_id == user.user_id, Assignment.ngo_id == user.ngo_id
            )
        )
    ).one()

    return {
        "id": profile.id,
        "user_id": profile.user_id,
        "ngo_id": profile.ngo_id,
        "email": user.email,
        "skills": profile.skills,
        "availability": profile.availability,
        "status": profile.status,
        "full_name": profile.full_name,
        "phone": profile.phone,
        "city": profile.city,
        "bio": profile.bio,
        "education_level": profile.education_level,
        "years_experience": profile.years_experience,
        "languages": profile.languages,
        "causes_supported": profile.causes_supported,
        "certifications": profile.certifications,
        "preferred_roles": profile.preferred_roles,
        "share_location": profile.share_location,
        "profile_completeness_score": profile.profile_completeness_score,
        "completed_tasks": completed,
        "total_assigned": total,
        "acceptance_rate": completed / total if total else 0.0,
    }


@router.put("/profile")
async def update_profile(
    data: ProfileUpdate, session: DbSession, user: VolunteerUser
) -> dict:
    profile = await session.scalar(
        select(VolunteerProfile).where(
            VolunteerProfile.user_id == user.user_id,
            VolunteerProfile.ngo_id == user.ngo_id,
        )
    )
    if profile is None:
        raise NotFound("Profile")

    payload = data.model_dump(exclude_unset=True)
    for field, value in payload.items():
        setattr(profile, field, value)
    profile.last_active_at = utcnow()

    # Keep the completeness meter honest instead of leaving it frozen at
    # whatever it was on the day the account was created.
    tracked = (
        "full_name", "phone", "city", "bio", "skills", "languages",
        "causes_supported", "education_level", "years_experience", "preferred_roles",
    )
    filled = sum(1 for name in tracked if getattr(profile, name, None))
    profile.profile_completeness_score = round(filled / len(tracked), 2)

    await _mirror_volunteer(user, profile)
    return {
        "message": "Profile updated",
        "profile_completeness_score": profile.profile_completeness_score,
    }


async def _mirror_volunteer(user, profile: VolunteerProfile) -> None:
    """Keep the graph copy in step. Skill-coverage analytics reads HAS_SKILL
    edges, which only exist because of this."""
    try:
        from app.integrations.neo4j import neo4j_service

        await neo4j_service.upsert_volunteer(
            volunteer_id=user.user_id,
            ngo_id=user.ngo_id,
            name=profile.full_name or user.email.split("@")[0],
            skills=list(profile.skills or []),
        )
    except Exception as exc:
        logger.warning("Graph volunteer mirror failed for %s: %s", user.user_id, exc)


@router.post("/location", dependencies=[Depends(location_limit)])
async def update_location(
    data: LocationUpdate, session: DbSession, user: VolunteerUser
) -> dict:
    await locations.set_location(
        session,
        volunteer_id=user.user_id,
        ngo_id=user.ngo_id,
        lat=data.lat,
        lng=data.lng,
        share_location=data.share_location,
    )
    if data.share_location:
        await realtime_bus.publish(
            user.ngo_id,
            "volunteer_location",
            {"volunteer_id": user.user_id, "lat": data.lat, "lng": data.lng},
        )
    return {"message": "Location updated", "share_location": data.share_location}


@router.delete("/location")
async def stop_sharing_location(session: DbSession, user: VolunteerUser) -> dict:
    await locations.set_location(
        session,
        volunteer_id=user.user_id,
        ngo_id=user.ngo_id,
        lat=None,
        lng=None,
        share_location=False,
    )
    await realtime_bus.publish(
        user.ngo_id, "volunteer_location_cleared", {"volunteer_id": user.user_id}
    )
    return {"share_location": False}


@router.post("/sos", dependencies=[Depends(sos_limit)])
async def sos(data: SOSRequest, session: DbSession, user: VolunteerUser) -> dict:
    message = (data.message or "Volunteer triggered SOS").strip()
    lat, lng = data.lat, data.lng

    if lat is None or lng is None:
        profile = await session.scalar(
            select(VolunteerProfile).where(
                VolunteerProfile.user_id == user.user_id,
                VolunteerProfile.ngo_id == user.ngo_id,
            )
        )
        if profile is not None:
            lat = lat if lat is not None else profile.lat
            lng = lng if lng is not None else profile.lng

    admin_ids = (
        await session.scalars(
            select(User.id).where(User.ngo_id == user.ngo_id, User.role == "ngo_admin")
        )
    ).all()
    for admin_id in admin_ids:
        session.add(
            Notification(
                user_id=admin_id,
                message=f"SOS from {user.email}: {message}",
                type="urgent",
            )
        )

    await realtime_bus.publish(
        user.ngo_id,
        "sos_alert",
        {
            "volunteer_id": user.user_id,
            "email": user.email,
            "message": message,
            "lat": lat,
            "lng": lng,
            "created_at": utcnow().isoformat(),
        },
    )
    logger.warning("SOS raised by volunteer %s in NGO %s", user.user_id, user.ngo_id)
    return {"status": "sent", "notified": len(admin_ids)}


@router.get("/notifications")
async def list_notifications(
    session: DbSession, user: VolunteerUser, limit: Annotated[int, Query(ge=1, le=200)] = 50
) -> list[dict]:
    rows = (
        await session.scalars(
            select(Notification)
            .where(Notification.user_id == user.user_id)
            .order_by(Notification.created_at.desc())
            .limit(limit)
        )
    ).all()
    return [
        {
            "id": n.id,
            "message": n.message,
            "type": n.type,
            "is_read": n.is_read,
            "created_at": n.created_at,
        }
        for n in rows
    ]


@router.patch("/notifications")
async def mark_all_read(session: DbSession, user: VolunteerUser) -> dict:
    result = await session.execute(
        update(Notification)
        .where(Notification.user_id == user.user_id, Notification.is_read.is_(False))
        .values(is_read=True)
    )
    return {"marked": result.rowcount or 0}


@router.post("/notifications/{notif_id}/read")
async def mark_read(notif_id: str, session: DbSession, user: VolunteerUser) -> dict:
    notification = await session.scalar(
        select(Notification).where(
            Notification.id == notif_id, Notification.user_id == user.user_id
        )
    )
    if notification is None:
        raise NotFound("Notification")
    notification.is_read = True
    return {"id": notification.id, "is_read": True}
