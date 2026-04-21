import datetime as dt
from datetime import datetime, timedelta
import os
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, delete

from db.base import get_db
from db.models import User, VolunteerProfile, Task, Assignment, Resource, Allocation, Notification, NGO, Event, EventAttendance, TaskEnrollmentRequest
from middleware.rbac import CurrentUser, require_ngo_admin, assert_same_ngo
from services.assignment_dispatcher import dispatch_optimized_assignments
from services.ai_matching import rank_volunteers
from services.geo_routing_service import geo_routing_service
from services.neo4j_service import neo4j_service
from services.realtime_events import realtime_bus

router = APIRouter()
ENABLE_DYNAMIC_REASSIGNMENT = os.getenv("ENABLE_DYNAMIC_REASSIGNMENT", "true").lower() == "true"


# ── Pydantic models ──────────────────────────────────────────────────────────

class TaskCreateReq(BaseModel):
    title:           str = Field(..., min_length=2, max_length=300)
    description:     str = Field("", max_length=2000)
    required_skills: List[str] = Field(default_factory=list)
    priority:        str = Field("medium", pattern="^(low|medium|high)$")
    deadline:        Optional[datetime] = None
    lat:             Optional[float] = Field(None, ge=-90, le=90)
    lng:             Optional[float] = Field(None, ge=-180, le=180)


class TaskUpdateReq(BaseModel):
    title:           Optional[str] = Field(None, max_length=300)
    description:     Optional[str] = Field(None, max_length=2000)
    required_skills: Optional[List[str]] = None
    priority:        Optional[str] = Field(None, pattern="^(low|medium|high)$")
    status:          Optional[str] = Field(None, pattern="^(open|in_progress|completed|cancelled)$")
    deadline:        Optional[datetime] = None
    lat:             Optional[float] = Field(None, ge=-90, le=90)
    lng:             Optional[float] = Field(None, ge=-180, le=180)


class AssignReq(BaseModel):
    volunteer_id: str


class ResourceCreateReq(BaseModel):
    type:     str = Field(..., min_length=2, max_length=100)
    quantity: int = Field(..., ge=0)
    metadata: dict = Field(default_factory=dict)
    lat:      Optional[float] = Field(None, ge=-90, le=90)
    lng:      Optional[float] = Field(None, ge=-180, le=180)


class ResourceUpdateReq(BaseModel):
    type:                Optional[str]  = None
    quantity:            Optional[int]  = None
    availability_status: Optional[str]  = Field(None, pattern="^(available|in_use|depleted)$")
    metadata:            Optional[dict] = None
    lat:                 Optional[float] = Field(None, ge=-90, le=90)
    lng:                 Optional[float] = Field(None, ge=-180, le=180)


class AllocateReq(BaseModel):
    task_id: str


class AssignTasksReq(BaseModel):
    max_assignments: Optional[int] = Field(None, ge=1, le=100)


class RoutePreviewReq(BaseModel):
    volunteer_id: str
    task_id: str


# ── Dashboard ────────────────────────────────────────────────────────────────

@router.get("/dashboard")
async def ngo_dashboard(
    user: CurrentUser = Depends(require_ngo_admin),
    db: AsyncSession = Depends(get_db),
):
    nid = user.ngo_id

    total_vols = (await db.execute(
        select(func.count()).select_from(User).where(User.ngo_id == nid, User.role == "volunteer")
    )).scalar() or 0

    active_tasks = (await db.execute(
        select(func.count()).select_from(Task).where(Task.ngo_id == nid, Task.status == "in_progress")
    )).scalar() or 0

    open_tasks = (await db.execute(
        select(func.count()).select_from(Task).where(Task.ngo_id == nid, Task.status == "open")
    )).scalar() or 0

    completed_tasks = (await db.execute(
        select(func.count()).select_from(Task).where(Task.ngo_id == nid, Task.status == "completed")
    )).scalar() or 0

    resources = (await db.execute(
        select(func.count()).select_from(Resource).where(Resource.ngo_id == nid)
    )).scalar() or 0

    pending_assignments = (await db.execute(
        select(func.count()).select_from(Assignment).where(
            Assignment.ngo_id == nid, Assignment.status == "assigned"
        )
    )).scalar() or 0

    # Recent tasks
    recent = (await db.execute(
        select(Task).where(Task.ngo_id == nid).order_by(Task.created_at.desc()).limit(5)
    )).scalars().all()

    # Invite code
    ngo = (await db.execute(select(NGO).where(NGO.id == nid))).scalar_one_or_none()

    return {
        "total_volunteers":    total_vols,
        "active_tasks":        active_tasks,
        "open_tasks":          open_tasks,
        "completed_tasks":     completed_tasks,
        "resource_count":      resources,
        "pending_assignments": pending_assignments,
        "invite_code":         ngo.invite_code if ngo else None,
        "recent_tasks": [
            {"id": t.id, "title": t.title, "status": t.status, "deadline": t.deadline, "priority": t.priority}
            for t in recent
        ],
    }


# ── Volunteers ───────────────────────────────────────────────────────────────

@router.get("/volunteers")
async def list_volunteers(
    skill:  Optional[str] = Query(None),
    status: Optional[str] = Query(None, pattern="^(active|inactive)$"),
    user: CurrentUser = Depends(require_ngo_admin),
    db: AsyncSession = Depends(get_db),
):
    q = (
        select(User, VolunteerProfile)
        .join(VolunteerProfile, VolunteerProfile.user_id == User.id)
        .where(User.ngo_id == user.ngo_id, User.role == "volunteer")
    )
    if status:
        q = q.where(VolunteerProfile.status == status)

    rows = (await db.execute(q)).fetchall()
    result = []
    for u, p in rows:
        if skill and skill.lower() not in [s.lower() for s in (p.skills or [])]:
            continue
        result.append({
            "id":           u.id,
            "user_id":      u.id,
            "email":        u.email,
            "full_name":    p.full_name,
            "skills":       p.skills,
            "availability": p.availability,
            "status":       p.status,
            "created_at":   u.created_at,
        })
    return result


@router.post("/volunteers/{volunteer_id}/deactivate")
async def deactivate_volunteer(
    volunteer_id: str,
    user: CurrentUser = Depends(require_ngo_admin),
    db: AsyncSession = Depends(get_db),
):
    vol_user = (await db.execute(
        select(User).where(User.id == volunteer_id, User.ngo_id == user.ngo_id)
    )).scalar_one_or_none()
    if not vol_user:
        raise HTTPException(status_code=404, detail="Volunteer not found in your NGO")

    await db.execute(
        update(VolunteerProfile)
        .where(VolunteerProfile.user_id == volunteer_id)
        .values(status="inactive")
    )
    return {"message": "Volunteer deactivated"}


# ── Tasks ────────────────────────────────────────────────────────────────────

@router.get("/tasks")
async def list_tasks(
    status:          Optional[str]  = Query(None),
    deadline_before: Optional[datetime] = Query(None),
    user: CurrentUser = Depends(require_ngo_admin),
    db: AsyncSession = Depends(get_db),
):
    q = select(Task).where(Task.ngo_id == user.ngo_id)
    if status:
        q = q.where(Task.status == status)
    if deadline_before:
        q = q.where(Task.deadline <= deadline_before)
    q = q.order_by(Task.created_at.desc())
    tasks = (await db.execute(q)).scalars().all()
    return [
        {
            "id": t.id, "title": t.title, "description": t.description,
            "required_skills": t.required_skills, "priority": t.priority,
            "status": t.status, "deadline": t.deadline, "created_at": t.created_at,
            "lat": t.lat, "lng": t.lng,
        }
        for t in tasks
    ]


@router.post("/tasks", status_code=201)
async def create_task(
    req: TaskCreateReq,
    user: CurrentUser = Depends(require_ngo_admin),
    db: AsyncSession = Depends(get_db),
):
    task = Task(
        ngo_id=user.ngo_id,
        title=req.title,
        description=req.description,
        required_skills=req.required_skills,
        priority=req.priority,
        deadline=req.deadline,
        lat=req.lat,
        lng=req.lng,
    )
    db.add(task)
    await db.flush()

    await neo4j_service.upsert_task_node(
        task_id=task.id,
        ngo_id=user.ngo_id,
        title=task.title,
        required_skills=task.required_skills or [],
        urgency=float(task.urgency_score or 50),
        status=task.status,
        lat=task.lat,
        lng=task.lng,
    )
    await realtime_bus.publish(
        user.ngo_id,
        "task_created",
        {
            "task_id": task.id,
            "title": task.title,
            "status": task.status,
            "priority": task.priority,
            "lat": task.lat,
            "lng": task.lng,
        },
    )

    if ENABLE_DYNAMIC_REASSIGNMENT and task.priority == "high":
        await dispatch_optimized_assignments(ngo_id=user.ngo_id, db=db, max_assignments=3)
    return {"id": task.id, "title": task.title, "status": task.status, "priority": task.priority}


@router.put("/tasks/{task_id}")
async def update_task(
    task_id: str,
    req: TaskUpdateReq,
    user: CurrentUser = Depends(require_ngo_admin),
    db: AsyncSession = Depends(get_db),
):
    task = (await db.execute(
        select(Task).where(Task.id == task_id, Task.ngo_id == user.ngo_id)
    )).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if req.title is not None:           task.title = req.title
    if req.description is not None:     task.description = req.description
    if req.required_skills is not None: task.required_skills = req.required_skills
    if req.priority is not None:        task.priority = req.priority
    if req.status is not None:          task.status = req.status
    if req.deadline is not None:        task.deadline = req.deadline
    if req.lat is not None:             task.lat = req.lat
    if req.lng is not None:             task.lng = req.lng

    await neo4j_service.upsert_task_node(
        task_id=task.id,
        ngo_id=user.ngo_id,
        title=task.title,
        required_skills=task.required_skills or [],
        urgency=float(task.urgency_score or 50),
        status=task.status,
        lat=task.lat,
        lng=task.lng,
    )
    await realtime_bus.publish(
        user.ngo_id,
        "assignment_updated",
        {
            "task_id": task.id,
            "status": task.status,
            "priority": task.priority,
            "lat": task.lat,
            "lng": task.lng,
        },
    )
    return {"id": task.id, "status": task.status, "priority": task.priority}


@router.delete("/tasks/{task_id}")
async def delete_task(
    task_id: str,
    user: CurrentUser = Depends(require_ngo_admin),
    db: AsyncSession = Depends(get_db),
):
    task = (await db.execute(
        select(Task).where(Task.id == task_id, Task.ngo_id == user.ngo_id)
    )).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    task.status = "cancelled"
    return {"message": "Task cancelled"}


@router.post("/tasks/{task_id}/assign")
async def assign_task(
    task_id: str,
    req: AssignReq,
    user: CurrentUser = Depends(require_ngo_admin),
    db: AsyncSession = Depends(get_db),
):
    task = (await db.execute(
        select(Task).where(Task.id == task_id, Task.ngo_id == user.ngo_id)
    )).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    vol = (await db.execute(
        select(User).where(User.id == req.volunteer_id, User.ngo_id == user.ngo_id, User.role == "volunteer")
    )).scalar_one_or_none()
    if not vol:
        raise HTTPException(status_code=404, detail="Volunteer not found in your NGO")

    assignment = Assignment(
        task_id=task_id,
        volunteer_id=req.volunteer_id,
        ngo_id=user.ngo_id,
    )
    db.add(assignment)

    task.status = "in_progress"

    notif = Notification(
        user_id=req.volunteer_id,
        message=f"You have been assigned: {task.title}",
        type="task_assigned",
    )
    db.add(notif)
    await db.flush()

    await neo4j_service.upsert_assignment_edge(
        volunteer_id=req.volunteer_id,
        task_id=task_id,
        assignment_id=assignment.id,
    )
    await realtime_bus.publish(
        user.ngo_id,
        "assignment_updated",
        {
            "assignment_id": assignment.id,
            "task_id": task_id,
            "volunteer_id": req.volunteer_id,
            "status": assignment.status,
        },
    )
    return {"assignment_id": assignment.id, "status": "assigned"}


class PingReq(BaseModel):
    message: Optional[str] = None


@router.post("/tasks/{task_id}/ping")
async def ping_task_volunteers(
    task_id: str,
    req: PingReq,
    user: CurrentUser = Depends(require_ngo_admin),
    db: AsyncSession = Depends(get_db),
):
    task = (await db.execute(
        select(Task).where(Task.id == task_id, Task.ngo_id == user.ngo_id)
    )).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    assignments = (await db.execute(
        select(Assignment).where(
            Assignment.task_id == task_id,
            Assignment.ngo_id == user.ngo_id,
            Assignment.status.in_(["assigned", "accepted"]),
        )
    )).scalars().all()

    msg = req.message or f"NGO update on task: {task.title}"
    for a in assignments:
        db.add(Notification(user_id=a.volunteer_id, message=msg, type="general"))
    return {"count": len(assignments)}


@router.get("/enrollment-requests")
async def list_enrollment_requests(
    status: Optional[str] = None,
    user: CurrentUser = Depends(require_ngo_admin),
    db: AsyncSession = Depends(get_db),
):
    q = (
        select(TaskEnrollmentRequest, Task, User)
        .join(Task, Task.id == TaskEnrollmentRequest.task_id)
        .join(User, User.id == TaskEnrollmentRequest.volunteer_id)
        .where(TaskEnrollmentRequest.ngo_id == user.ngo_id)
    )
    if status:
        q = q.where(TaskEnrollmentRequest.status == status)
    rows = (await db.execute(q.order_by(TaskEnrollmentRequest.created_at.desc()))).fetchall()
    return [
        {
            "id":              r.id,
            "task_id":         r.task_id,
            "task_title":      t.title,
            "volunteer_id":    r.volunteer_id,
            "volunteer_email": u.email,
            "reason":          r.reason,
            "why_useful":      r.why_useful,
            "status":          r.status,
            "created_at":      r.created_at,
        }
        for r, t, u in rows
    ]


@router.post("/enrollment-requests/{req_id}/approve")
async def approve_enrollment(
    req_id: str,
    user: CurrentUser = Depends(require_ngo_admin),
    db: AsyncSession = Depends(get_db),
):
    er = (await db.execute(
        select(TaskEnrollmentRequest).where(
            TaskEnrollmentRequest.id == req_id,
            TaskEnrollmentRequest.ngo_id == user.ngo_id,
        )
    )).scalar_one_or_none()
    if not er:
        raise HTTPException(status_code=404, detail="Request not found")
    if er.status != "pending":
        raise HTTPException(status_code=400, detail=f"Request already {er.status}")

    er.status = "approved"
    assignment = Assignment(
        task_id=er.task_id,
        volunteer_id=er.volunteer_id,
        ngo_id=er.ngo_id,
        status="assigned",
    )
    db.add(assignment)
    task = await db.get(Task, er.task_id)
    db.add(Notification(
        user_id=er.volunteer_id,
        message=f"Your request to join '{task.title if task else er.task_id}' was approved!",
        type="task_assigned",
    ))
    await db.flush()
    return {"message": "Approved", "assignment_id": assignment.id}


@router.post("/enrollment-requests/{req_id}/reject")
async def reject_enrollment(
    req_id: str,
    user: CurrentUser = Depends(require_ngo_admin),
    db: AsyncSession = Depends(get_db),
):
    er = (await db.execute(
        select(TaskEnrollmentRequest).where(
            TaskEnrollmentRequest.id == req_id,
            TaskEnrollmentRequest.ngo_id == user.ngo_id,
        )
    )).scalar_one_or_none()
    if not er:
        raise HTTPException(status_code=404, detail="Request not found")
    if er.status != "pending":
        raise HTTPException(status_code=400, detail=f"Request already {er.status}")

    er.status = "rejected"
    task = await db.get(Task, er.task_id)
    db.add(Notification(
        user_id=er.volunteer_id,
        message=f"Your request to join '{task.title if task else er.task_id}' was not approved.",
        type="general",
    ))
    return {"message": "Rejected"}


@router.post("/tasks/{task_id}/complete")
async def complete_task(
    task_id: str,
    user: CurrentUser = Depends(require_ngo_admin),
    db: AsyncSession = Depends(get_db),
):
    task = (await db.execute(
        select(Task).where(Task.id == task_id, Task.ngo_id == user.ngo_id)
    )).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    task.status = "completed"

    active_assignments = (await db.execute(
        select(Assignment).where(
            Assignment.task_id == task_id,
            Assignment.status.in_(["assigned", "accepted"]),
        )
    )).scalars().all()

    for a in active_assignments:
        a.status = "completed"
        db.add(Notification(
            user_id=a.volunteer_id,
            message=f"Task '{task.title}' has been marked complete",
            type="status_update",
        ))

    await db.flush()
    await realtime_bus.publish(
        user.ngo_id,
        "assignment_updated",
        {
            "task_id": task_id,
            "status": "completed",
            "completed_assignments": len(active_assignments),
        },
    )
    return {"message": "Task completed"}


@router.post("/tasks/{task_id}/ai-match")
async def ai_match_task(
    task_id: str,
    user: CurrentUser = Depends(require_ngo_admin),
    db: AsyncSession = Depends(get_db),
):
    task = (await db.execute(
        select(Task).where(Task.id == task_id, Task.ngo_id == user.ngo_id)
    )).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    ranked = await rank_volunteers(task_id, user.ngo_id, db)
    return {"task_id": task_id, "ranked_volunteers": ranked}


@router.post("/assign-tasks")
async def assign_tasks_optimized(
    req: AssignTasksReq,
    user: CurrentUser = Depends(require_ngo_admin),
    db: AsyncSession = Depends(get_db),
):
    created = await dispatch_optimized_assignments(
        ngo_id=user.ngo_id,
        db=db,
        max_assignments=req.max_assignments,
    )

    return {"assignments": created, "count": len(created)}


@router.post("/routes/preview")
async def route_preview(
    req: RoutePreviewReq,
    user: CurrentUser = Depends(require_ngo_admin),
    db: AsyncSession = Depends(get_db),
):
    volunteer = (await db.execute(
        select(User).where(User.id == req.volunteer_id, User.ngo_id == user.ngo_id, User.role == "volunteer")
    )).scalar_one_or_none()
    if not volunteer:
        raise HTTPException(status_code=404, detail="Volunteer not found")

    profile = (await db.execute(
        select(VolunteerProfile).where(VolunteerProfile.user_id == req.volunteer_id)
    )).scalar_one_or_none()
    if not profile or profile.lat is None or profile.lng is None:
        raise HTTPException(status_code=400, detail="Volunteer location unavailable")

    task = (await db.execute(
        select(Task).where(Task.id == req.task_id, Task.ngo_id == user.ngo_id)
    )).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.lat is None or task.lng is None:
        raise HTTPException(status_code=400, detail="Task location unavailable")

    route = await geo_routing_service.get_route(
        start=(profile.lat, profile.lng),
        end=(task.lat, task.lng),
    )
    return {
        "task_id": task.id,
        "volunteer_id": volunteer.id,
        **route,
    }


# ── Resources ────────────────────────────────────────────────────────────────

@router.get("/resources")
async def list_resources(
    user: CurrentUser = Depends(require_ngo_admin),
    db: AsyncSession = Depends(get_db),
):
    resources = (await db.execute(
        select(Resource).where(Resource.ngo_id == user.ngo_id)
    )).scalars().all()
    return [
        {
            "id": r.id, "type": r.type, "quantity": r.quantity,
            "availability_status": r.availability_status, "metadata": r.metadata_,
            "lat": r.lat, "lng": r.lng,
        }
        for r in resources
    ]


@router.post("/resources", status_code=201)
async def create_resource(
    req: ResourceCreateReq,
    user: CurrentUser = Depends(require_ngo_admin),
    db: AsyncSession = Depends(get_db),
):
    resource = Resource(ngo_id=user.ngo_id, type=req.type, quantity=req.quantity, metadata_=req.metadata, lat=req.lat, lng=req.lng)
    db.add(resource)
    await db.flush()
    return {"id": resource.id, "type": resource.type}


@router.put("/resources/{resource_id}")
async def update_resource(
    resource_id: str,
    req: ResourceUpdateReq,
    user: CurrentUser = Depends(require_ngo_admin),
    db: AsyncSession = Depends(get_db),
):
    res = (await db.execute(
        select(Resource).where(Resource.id == resource_id, Resource.ngo_id == user.ngo_id)
    )).scalar_one_or_none()
    if not res:
        raise HTTPException(status_code=404, detail="Resource not found")

    if req.type is not None:                res.type = req.type
    if req.quantity is not None:            res.quantity = req.quantity
    if req.availability_status is not None: res.availability_status = req.availability_status
    if req.metadata is not None:            res.metadata_ = req.metadata
    if req.lat is not None:                 res.lat = req.lat
    if req.lng is not None:                 res.lng = req.lng
    return {"id": res.id, "availability_status": res.availability_status}


@router.post("/resources/{resource_id}/allocate")
async def allocate_resource(
    resource_id: str,
    req: AllocateReq,
    user: CurrentUser = Depends(require_ngo_admin),
    db: AsyncSession = Depends(get_db),
):
    res = (await db.execute(
        select(Resource).where(Resource.id == resource_id, Resource.ngo_id == user.ngo_id)
    )).scalar_one_or_none()
    if not res:
        raise HTTPException(status_code=404, detail="Resource not found")
    if res.availability_status != "available":
        raise HTTPException(status_code=400, detail="Resource not available")

    task = (await db.execute(
        select(Task).where(Task.id == req.task_id, Task.ngo_id == user.ngo_id)
    )).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    allocation = Allocation(resource_id=resource_id, task_id=req.task_id, ngo_id=user.ngo_id, allocation_status="active")
    db.add(allocation)
    res.availability_status = "in_use"
    await db.flush()
    return {"allocation_id": allocation.id}


# ── Assignments ──────────────────────────────────────────────────────────────

@router.get("/assignments")
async def list_assignments(
    status: Optional[str] = Query(None),
    user: CurrentUser = Depends(require_ngo_admin),
    db: AsyncSession = Depends(get_db),
):
    q = select(Assignment).where(Assignment.ngo_id == user.ngo_id)
    if status:
        q = q.where(Assignment.status == status)
    q = q.order_by(Assignment.assigned_at.desc())
    rows = (await db.execute(q)).scalars().all()
    return [
        {"id": a.id, "task_id": a.task_id, "volunteer_id": a.volunteer_id,
         "status": a.status, "assigned_at": a.assigned_at}
        for a in rows
    ]


# ── Analytics ────────────────────────────────────────────────────────────────

@router.get("/analytics")
async def analytics(
    user: CurrentUser = Depends(require_ngo_admin),
    db: AsyncSession = Depends(get_db),
):
    nid = user.ngo_id

    total_tasks     = (await db.execute(select(func.count()).select_from(Task).where(Task.ngo_id == nid))).scalar() or 1
    completed_tasks = (await db.execute(select(func.count()).select_from(Task).where(Task.ngo_id == nid, Task.status == "completed"))).scalar() or 0
    task_completion_rate = round(completed_tasks / total_tasks, 4)

    vol_rows = (await db.execute(
        select(VolunteerProfile).where(VolunteerProfile.ngo_id == nid)
    )).scalars().all()
    total_vols = len(vol_rows)

    # Volunteer utilization: volunteers with at least one active assignment
    active_vol_ids = (await db.execute(
        select(Assignment.volunteer_id).distinct().where(
            Assignment.ngo_id == nid,
            Assignment.status.in_(["assigned", "accepted"]),
        )
    )).scalars().all()
    volunteer_utilization = round(len(active_vol_ids) / max(total_vols, 1), 4)

    # Assignment counts
    total_assignments = (await db.execute(
        select(func.count()).select_from(Assignment).where(Assignment.ngo_id == nid)
    )).scalar() or 0
    completed_assignments = (await db.execute(
        select(func.count()).select_from(Assignment).where(Assignment.ngo_id == nid, Assignment.status == "completed")
    )).scalar() or 0

    all_skills: dict[str, int] = {}
    for p in vol_rows:
        for s in (p.skills or []):
            all_skills[s] = all_skills.get(s, 0) + 1

    task_rows = (await db.execute(
        select(Task).where(Task.ngo_id == nid, Task.status.in_(["open", "in_progress"]))
    )).scalars().all()
    required: dict[str, int] = {}
    for t in task_rows:
        for s in (t.required_skills or []):
            required[s] = required.get(s, 0) + 1

    gaps = [{"skill": s, "demand": cnt, "supply": all_skills.get(s, 0)} for s, cnt in required.items()]
    gaps.sort(key=lambda x: x["demand"] - x["supply"], reverse=True)

    timed_rows = (await db.execute(
        select(Assignment.assigned_at, Assignment.accepted_at)
        .where(Assignment.ngo_id == nid, Assignment.accepted_at.isnot(None))
    )).all()
    valid_timed = [r for r in timed_rows if r.accepted_at and r.assigned_at]
    avg_time = round(
        sum((r.accepted_at - r.assigned_at).total_seconds() / 3600 for r in valid_timed) / len(valid_timed), 1
    ) if valid_timed else 0

    return {
        "task_completion_rate":   task_completion_rate,
        "completed_tasks":        completed_tasks,
        "total_tasks":            total_tasks,
        "volunteer_utilization":  volunteer_utilization,
        "total_assignments":      total_assignments,
        "completed_assignments":  completed_assignments,
        "avg_assignment_time_hours": avg_time,
        "skill_coverage":         all_skills,
        "skill_gaps":             [g["skill"] for g in gaps if g["supply"] == 0][:10],
        "skill_coverage_gaps":    gaps[:10],
        "top_skills":             sorted(all_skills.items(), key=lambda x: x[1], reverse=True)[:10],
        "volunteer_count":        total_vols,
    }


@router.get("/alerts")
async def get_alerts(
    user: CurrentUser = Depends(require_ngo_admin),
    db: AsyncSession = Depends(get_db),
):
    nid = user.ngo_id
    alerts = []
    now = datetime.utcnow()
    deadline_cutoff = now + timedelta(days=3)

    # Alert 1: Open tasks with deadline within 3 days
    urgent_tasks = (await db.execute(
        select(Task).where(
            Task.ngo_id == nid,
            Task.status == "open",
            Task.deadline != None,  # noqa: E711
            Task.deadline <= deadline_cutoff,
        ).order_by(Task.deadline.asc()).limit(5)
    )).scalars().all()
    for t in urgent_tasks:
        alerts.append({
            "type": "deadline",
            "severity": "high",
            "message": f"Task '{t.title}' has no volunteer assigned and deadline is {t.deadline.strftime('%b %d')}",
            "task_id": t.id,
        })

    # Alert 2: Depleted resources still allocated
    depleted_allocs = (await db.execute(
        select(Resource).where(
            Resource.ngo_id == nid,
            Resource.quantity == 0,
            Resource.availability_status == "in_use",
        )
    )).scalars().all()
    for r in depleted_allocs:
        alerts.append({
            "type": "resource",
            "severity": "medium",
            "message": f"Resource '{r.type}' is depleted but still marked as in-use",
            "resource_id": r.id,
        })

    # Alert 3: Volunteer shortage — open tasks > active volunteers
    open_task_count = (await db.execute(
        select(func.count()).select_from(Task).where(Task.ngo_id == nid, Task.status == "open")
    )).scalar() or 0
    active_vol_count = (await db.execute(
        select(func.count()).select_from(VolunteerProfile).where(
            VolunteerProfile.ngo_id == nid, VolunteerProfile.status == "active"
        )
    )).scalar() or 0
    if open_task_count > active_vol_count and active_vol_count >= 0:
        alerts.append({
            "type": "shortage",
            "severity": "medium",
            "message": f"{open_task_count} open tasks but only {active_vol_count} active volunteers — consider sharing invite code",
        })

    return {"alerts": alerts}


# ── NGO Notifications ────────────────────────────────────────────────────────

@router.get("/notifications")
async def get_ngo_notifications(
    user: CurrentUser = Depends(require_ngo_admin),
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


@router.post("/notifications/{notif_id}/read")
async def mark_ngo_notif_read(
    notif_id: str,
    user: CurrentUser = Depends(require_ngo_admin),
    db: AsyncSession = Depends(get_db),
):
    n = (await db.execute(
        select(Notification).where(Notification.id == notif_id, Notification.user_id == user.user_id)
    )).scalar_one_or_none()
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    n.is_read = True
    return {"id": n.id, "is_read": True}


@router.post("/notifications/read-all")
async def mark_all_ngo_notifs_read(
    user: CurrentUser = Depends(require_ngo_admin),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(Notification).where(Notification.user_id == user.user_id, Notification.is_read.is_(False))
    )).scalars().all()
    for n in rows:
        n.is_read = True
    return {"marked": len(rows)}


# ── Events ───────────────────────────────────────────────────────────────────

class EventCreateReq(BaseModel):
    title:          str = Field(..., min_length=2, max_length=200)
    description:    Optional[str] = Field(None, max_length=2000)
    event_type:     str = Field("drive", pattern="^(drive|campaign|camp|training)$")
    date:           datetime
    location:       str = Field(..., min_length=2, max_length=300)
    max_volunteers: int = Field(0, ge=0)
    status:         str = Field("upcoming", pattern="^(upcoming|active|completed)$")


class AttendanceReq(BaseModel):
    status: str = Field(..., pattern="^(invited|present|absent)$")


@router.get("/events")
async def list_events(
    user: CurrentUser = Depends(require_ngo_admin),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(Event).where(Event.ngo_id == user.ngo_id).order_by(Event.date.desc())
    )).scalars().all()

    result = []
    for e in rows:
        count = (await db.execute(
            select(func.count()).select_from(EventAttendance).where(EventAttendance.event_id == e.id)
        )).scalar() or 0
        result.append({
            "id": e.id, "title": e.title, "description": e.description,
            "event_type": e.event_type, "date": e.date.isoformat(),
            "location": e.location, "max_volunteers": e.max_volunteers,
            "status": e.status, "attendee_count": count,
        })
    return result


@router.post("/events")
async def create_event(
    body: EventCreateReq,
    user: CurrentUser = Depends(require_ngo_admin),
    db: AsyncSession = Depends(get_db),
):
    ev = Event(
        ngo_id=user.ngo_id,
        title=body.title.strip(),
        description=body.description,
        event_type=body.event_type,
        date=body.date,
        location=body.location.strip(),
        max_volunteers=body.max_volunteers,
        status=body.status,
    )
    db.add(ev)
    await db.flush()
    await db.refresh(ev)
    return {"id": ev.id, "title": ev.title, "status": ev.status}


@router.delete("/events/{event_id}")
async def delete_event(
    event_id: str,
    user: CurrentUser = Depends(require_ngo_admin),
    db: AsyncSession = Depends(get_db),
):
    ev = (await db.execute(
        select(Event).where(Event.id == event_id, Event.ngo_id == user.ngo_id)
    )).scalar_one_or_none()
    if not ev:
        raise HTTPException(404, "Event not found")
    await db.execute(delete(EventAttendance).where(EventAttendance.event_id == event_id))
    await db.delete(ev)
    await db.flush()
    return {"message": "Deleted"}


@router.get("/events/{event_id}/attendance")
async def get_attendance(
    event_id: str,
    user: CurrentUser = Depends(require_ngo_admin),
    db: AsyncSession = Depends(get_db),
):
    ev = (await db.execute(
        select(Event).where(Event.id == event_id, Event.ngo_id == user.ngo_id)
    )).scalar_one_or_none()
    if not ev:
        raise HTTPException(404, "Event not found")

    vols = (await db.execute(
        select(User).where(User.ngo_id == user.ngo_id, User.role == "volunteer")
    )).scalars().all()

    attend_map: dict[str, str] = {}
    records = (await db.execute(
        select(EventAttendance).where(EventAttendance.event_id == event_id)
    )).scalars().all()
    for r in records:
        attend_map[r.volunteer_id] = r.status

    return [
        {"volunteer_id": v.id, "email": v.email, "status": attend_map.get(v.id, "invited")}
        for v in vols
    ]


@router.post("/events/{event_id}/attendance/{vol_id}")
async def mark_attendance(
    event_id: str,
    vol_id: str,
    body: AttendanceReq,
    user: CurrentUser = Depends(require_ngo_admin),
    db: AsyncSession = Depends(get_db),
):
    ev = (await db.execute(
        select(Event).where(Event.id == event_id, Event.ngo_id == user.ngo_id)
    )).scalar_one_or_none()
    if not ev:
        raise HTTPException(404, "Event not found")

    vol = (await db.execute(
        select(User).where(User.id == vol_id, User.ngo_id == user.ngo_id, User.role == "volunteer")
    )).scalar_one_or_none()
    if not vol:
        raise HTTPException(404, "Volunteer not found")

    existing = (await db.execute(
        select(EventAttendance).where(
            EventAttendance.event_id == event_id,
            EventAttendance.volunteer_id == vol_id,
        )
    )).scalar_one_or_none()

    if existing:
        existing.status = body.status
    else:
        db.add(EventAttendance(event_id=event_id, volunteer_id=vol_id, status=body.status))

    await db.flush()
    return {"volunteer_id": vol_id, "status": body.status}


# ── Volunteer live locations ──────────────────────────────────────────────────

@router.get("/volunteer-locations")
async def volunteer_locations(
    user: CurrentUser = Depends(require_ngo_admin),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(VolunteerProfile, User.email)
        .join(User, User.id == VolunteerProfile.user_id)
        .where(
            VolunteerProfile.ngo_id == user.ngo_id,
            VolunteerProfile.share_location == True,
            VolunteerProfile.lat.isnot(None),
            VolunteerProfile.lng.isnot(None),
        )
    )).all()
    return [
        {
            "id":             vp.id,
            "user_id":        vp.user_id,
            "email":          email,
            "lat":            vp.lat,
            "lng":            vp.lng,
            "skills":         vp.skills,
            "availability":   vp.availability,
            "status":         vp.status,
        }
        for vp, email in rows
    ]


@router.get("/volunteers/{volunteer_id}/profile")
async def get_volunteer_profile(
    volunteer_id: str,
    user: CurrentUser = Depends(require_ngo_admin),
    db: AsyncSession = Depends(get_db),
):
    row = (await db.execute(
        select(VolunteerProfile, User.email)
        .join(User, User.id == VolunteerProfile.user_id)
        .where(
            VolunteerProfile.user_id == volunteer_id,
            VolunteerProfile.ngo_id == user.ngo_id,
        )
    )).first()
    if not row:
        raise HTTPException(404, "Volunteer not found")
    vp, email = row
    completed = (await db.execute(
        select(func.count()).select_from(Assignment).where(
            Assignment.volunteer_id == volunteer_id,
            Assignment.ngo_id == user.ngo_id,
            Assignment.status == "completed",
        )
    )).scalar() or 0
    return {
        "user_id":         vp.user_id,
        "email":           email,
        "skills":          vp.skills,
        "availability":    vp.availability,
        "status":          vp.status,
        "lat":             vp.lat,
        "lng":             vp.lng,
        "completed_tasks": completed,
    }
