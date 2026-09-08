"""NGO admin API: tasks, assignments, resources, events, enrollments,
notifications, dashboard and analytics.

Every handler is scoped by `user.ngo_id` from the verified token, so one NGO
can never read or write another's rows.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Annotated

from fastapi import APIRouter, Query, status
from sqlalchemy import delete, func, select

from app.core.deps import AdminUser, DbSession
from app.core.errors import BadRequest, Conflict, NotFound
from app.core.events import realtime_bus
from app.domain import locations
from app.domain.matching import dispatch_optimized_assignments, rank_volunteers
from app.models import (
    NGO,
    Allocation,
    Assignment,
    Event,
    EventAttendance,
    Notification,
    Resource,
    Task,
    TaskEnrollmentRequest,
    User,
    VolunteerProfile,
    utcnow,
)
from app.schemas import (
    AllocateRequest,
    AssignRequest,
    AttendanceRequest,
    BulkAssignRequest,
    EventCreate,
    PingRequest,
    ResourceCreate,
    ResourceUpdate,
    RoutePreviewRequest,
    TaskCreate,
    TaskUpdate,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ngo", tags=["coordination"])

ACTIVE_ASSIGNMENT = ("assigned", "accepted")


def _task_dict(task: Task) -> dict:
    return {
        "id": task.id,
        "ngo_id": task.ngo_id,
        "title": task.title,
        "description": task.description,
        "required_skills": task.required_skills,
        "priority": task.priority,
        "status": task.status,
        "deadline": task.deadline,
        "lat": task.lat,
        "lng": task.lng,
        "created_at": task.created_at,
        "updated_at": task.updated_at,
        "task_category": task.task_category,
        "estimated_hours": task.estimated_hours,
        "urgency_score": task.urgency_score,
        "impact_tags": task.impact_tags,
    }


async def _get_task(session: DbSession, task_id: str, ngo_id: str) -> Task:
    task = await session.scalar(select(Task).where(Task.id == task_id, Task.ngo_id == ngo_id))
    if task is None:
        raise NotFound("Task")
    return task


# ── Dashboard ─────────────────────────────────────────────────────────────────

@router.get("/dashboard")
async def dashboard(session: DbSession, user: AdminUser) -> dict:
    nid = user.ngo_id
    # One aggregate query instead of the old six separate COUNTs.
    counts = (
        await session.execute(
            select(
                func.count(Task.id).filter(Task.status == "in_progress"),
                func.count(Task.id).filter(Task.status == "open"),
                func.count(Task.id).filter(Task.status == "completed"),
            ).where(Task.ngo_id == nid)
        )
    ).one()

    total_volunteers = await session.scalar(
        select(func.count(User.id)).where(User.ngo_id == nid, User.role == "volunteer")
    )
    resource_count = await session.scalar(
        select(func.count(Resource.id)).where(Resource.ngo_id == nid)
    )
    pending = await session.scalar(
        select(func.count(Assignment.id)).where(
            Assignment.ngo_id == nid, Assignment.status == "assigned"
        )
    )
    invite_code = await session.scalar(select(NGO.invite_code).where(NGO.id == nid))
    recent = (
        await session.scalars(
            select(Task).where(Task.ngo_id == nid).order_by(Task.created_at.desc()).limit(5)
        )
    ).all()

    return {
        "total_volunteers": total_volunteers or 0,
        "active_tasks": counts[0],
        "open_tasks": counts[1],
        "completed_tasks": counts[2],
        "resource_count": resource_count or 0,
        "pending_assignments": pending or 0,
        "invite_code": invite_code,
        "recent_tasks": [
            {
                "id": t.id,
                "title": t.title,
                "status": t.status,
                "deadline": t.deadline,
                "priority": t.priority,
            }
            for t in recent
        ],
    }


# ── Volunteers ────────────────────────────────────────────────────────────────

@router.get("/volunteers")
async def list_volunteers(
    session: DbSession,
    user: AdminUser,
    skill: Annotated[str | None, Query(max_length=100)] = None,
    status_filter: Annotated[str | None, Query(alias="status", max_length=20)] = None,
) -> list[dict]:
    query = select(VolunteerProfile, User.email).join(
        User, User.id == VolunteerProfile.user_id
    ).where(VolunteerProfile.ngo_id == user.ngo_id)
    if status_filter:
        query = query.where(VolunteerProfile.status == status_filter)
    if skill:
        # JSONB containment, so filtering happens in Postgres rather than by
        # pulling every profile into Python as the Django view did.
        query = query.where(VolunteerProfile.skills.contains([skill]))

    rows = (await session.execute(query)).all()
    if not rows:
        return []

    user_ids = [p.user_id for p, _ in rows]
    stats = {
        vid: (total, completed)
        for vid, total, completed in (
            await session.execute(
                select(
                    Assignment.volunteer_id,
                    func.count(Assignment.id),
                    func.count(Assignment.id).filter(Assignment.status == "completed"),
                )
                .where(
                    Assignment.ngo_id == user.ngo_id,
                    Assignment.volunteer_id.in_(user_ids),
                )
                .group_by(Assignment.volunteer_id)
            )
        ).all()
    }

    return [
        {
            "id": profile.id,
            "user_id": profile.user_id,
            "email": email,
            "full_name": profile.full_name,
            "skills": profile.skills,
            "status": profile.status,
            "city": profile.city,
            "availability": profile.availability,
            "profile_completeness_score": profile.profile_completeness_score,
            "completed_tasks": stats.get(profile.user_id, (0, 0))[1],
            "total_assigned": stats.get(profile.user_id, (0, 0))[0],
        }
        for profile, email in rows
    ]


@router.get("/volunteers/{volunteer_id}")
@router.get("/volunteers/{volunteer_id}/profile")
async def volunteer_detail(volunteer_id: str, session: DbSession, user: AdminUser) -> dict:
    row = (
        await session.execute(
            select(VolunteerProfile, User.email)
            .join(User, User.id == VolunteerProfile.user_id)
            .where(
                VolunteerProfile.user_id == volunteer_id,
                VolunteerProfile.ngo_id == user.ngo_id,
            )
        )
    ).one_or_none()
    if row is None:
        raise NotFound("Volunteer")
    profile, email = row

    total, completed = (
        await session.execute(
            select(
                func.count(Assignment.id),
                func.count(Assignment.id).filter(Assignment.status == "completed"),
            ).where(
                Assignment.volunteer_id == volunteer_id, Assignment.ngo_id == user.ngo_id
            )
        )
    ).one()

    return {
        "id": profile.id,
        "user_id": profile.user_id,
        "email": email,
        "ngo_id": profile.ngo_id,
        "full_name": profile.full_name,
        "skills": profile.skills,
        "availability": profile.availability,
        "status": profile.status,
        "share_location": profile.share_location,
        "lat": profile.lat,
        "lng": profile.lng,
        "city": profile.city,
        "bio": profile.bio,
        "education_level": profile.education_level,
        "years_experience": profile.years_experience,
        "languages": profile.languages,
        "causes_supported": profile.causes_supported,
        "certifications": profile.certifications,
        "preferred_roles": profile.preferred_roles,
        "profile_completeness_score": profile.profile_completeness_score,
        "completed_tasks": completed,
        "total_assigned": total,
        "acceptance_rate": completed / total if total else 0.0,
    }


@router.delete("/volunteers/{volunteer_id}")
@router.post("/volunteers/{volunteer_id}/deactivate")
async def deactivate_volunteer(volunteer_id: str, session: DbSession, user: AdminUser) -> dict:
    profile = await session.scalar(
        select(VolunteerProfile).where(
            VolunteerProfile.user_id == volunteer_id,
            VolunteerProfile.ngo_id == user.ngo_id,
        )
    )
    if profile is None:
        raise NotFound("Volunteer")
    profile.status = "inactive"
    return {"message": "Volunteer deactivated"}


@router.get("/volunteer-locations")
async def volunteer_locations(session: DbSession, user: AdminUser) -> list[dict]:
    return await locations.sharing_volunteers(session, user.ngo_id)


# ── Tasks ─────────────────────────────────────────────────────────────────────

@router.get("/tasks")
async def list_tasks(
    session: DbSession,
    user: AdminUser,
    status_filter: Annotated[str | None, Query(alias="status", max_length=20)] = None,
    priority: Annotated[str | None, Query(max_length=20)] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[dict]:
    query = select(Task).where(Task.ngo_id == user.ngo_id)
    if status_filter:
        query = query.where(Task.status == status_filter)
    if priority:
        query = query.where(Task.priority == priority)
    tasks = (
        await session.scalars(
            query.order_by(Task.created_at.desc()).limit(limit).offset(offset)
        )
    ).all()
    return [_task_dict(t) for t in tasks]


@router.post("/tasks", status_code=status.HTTP_201_CREATED)
async def create_task(data: TaskCreate, session: DbSession, user: AdminUser) -> dict:
    task = Task(ngo_id=user.ngo_id, **data.model_dump())
    session.add(task)
    await session.flush()

    # Mirror into the graph, but never let a graph outage fail task creation.
    # The Django version spawned a raw daemon thread per task for this; an
    # awaited call with a timeout and its own error boundary is simpler and safer.
    from app.integrations.neo4j import neo4j_service

    try:
        await asyncio.wait_for(
            neo4j_service.upsert_task_node(
                task_id=task.id,
                ngo_id=user.ngo_id,
                title=task.title,
                required_skills=task.required_skills or [],
                urgency=float(task.urgency_score or 50),
                status=task.status,
                lat=task.lat,
                lng=task.lng,
            ),
            timeout=3.0,
        )
    except Exception as exc:
        logger.warning("Neo4j task mirror failed for %s: %s", task.id, exc)

    await realtime_bus.publish(
        user.ngo_id, "task_created", {"task_id": task.id, "title": task.title}
    )
    return {
        "id": task.id,
        "title": task.title,
        "status": task.status,
        "ngo_id": user.ngo_id,
        "created_at": task.created_at,
    }


@router.get("/tasks/{task_id}")
async def task_detail(task_id: str, session: DbSession, user: AdminUser) -> dict:
    task = await _get_task(session, task_id, user.ngo_id)
    assignments = (
        await session.scalars(
            select(Assignment).where(
                Assignment.task_id == task_id, Assignment.ngo_id == user.ngo_id
            )
        )
    ).all()
    return {
        **_task_dict(task),
        "assignments": [
            {
                "id": a.id,
                "volunteer_id": a.volunteer_id,
                "status": a.status,
                "assigned_at": a.assigned_at,
                "match_score": a.match_score,
            }
            for a in assignments
        ],
    }


@router.put("/tasks/{task_id}")
async def update_task(
    task_id: str, data: TaskUpdate, session: DbSession, user: AdminUser
) -> dict:
    task = await _get_task(session, task_id, user.ngo_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(task, field, value)
    await session.flush()
    await realtime_bus.publish(
        user.ngo_id, "task_updated", {"task_id": task.id, "status": task.status}
    )
    return {
        "id": task.id,
        "title": task.title,
        "status": task.status,
        "updated_at": task.updated_at,
    }


@router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, session: DbSession, user: AdminUser) -> dict:
    task = await _get_task(session, task_id, user.ngo_id)
    # Delete children explicitly: these tables carry no FK constraints, so
    # nothing else cleans them up and they would linger as orphan rows.
    await session.execute(delete(Assignment).where(Assignment.task_id == task_id))
    await session.execute(
        delete(TaskEnrollmentRequest).where(TaskEnrollmentRequest.task_id == task_id)
    )
    await session.execute(delete(Allocation).where(Allocation.task_id == task_id))
    await session.delete(task)
    return {"message": "Task deleted"}


@router.post("/tasks/{task_id}/assign", status_code=status.HTTP_201_CREATED)
async def assign_task(
    task_id: str, data: AssignRequest, session: DbSession, user: AdminUser
) -> dict:
    task = await _get_task(session, task_id, user.ngo_id)
    in_ngo = await session.scalar(
        select(VolunteerProfile.id).where(
            VolunteerProfile.user_id == data.volunteer_id,
            VolunteerProfile.ngo_id == user.ngo_id,
        )
    )
    if not in_ngo:
        raise NotFound("Volunteer in this NGO")

    existing = await session.scalar(
        select(Assignment.id).where(
            Assignment.task_id == task_id,
            Assignment.volunteer_id == data.volunteer_id,
            Assignment.ngo_id == user.ngo_id,
            Assignment.status != "rejected",
        )
    )
    if existing:
        raise Conflict("Already assigned")

    assignment = Assignment(
        task_id=task_id, volunteer_id=data.volunteer_id, ngo_id=user.ngo_id, status="assigned"
    )
    session.add(assignment)
    session.add(
        Notification(
            user_id=data.volunteer_id,
            message=f"You have been assigned to task: {task.title}",
            type="task_assigned",
        )
    )
    if task.status == "open":
        task.status = "in_progress"
    await session.flush()
    await realtime_bus.publish(
        user.ngo_id,
        "assignment_updated",
        {"assignment_id": assignment.id, "task_id": task_id, "status": "assigned"},
    )
    return {"assignment_id": assignment.id, "status": assignment.status}


@router.post("/assign-tasks")
async def bulk_assign(data: BulkAssignRequest, session: DbSession, user: AdminUser) -> dict:
    created = await dispatch_optimized_assignments(
        session, user.ngo_id, max_assignments=data.max_assignments
    )
    return {"assignments": created, "count": len(created)}


@router.post("/tasks/{task_id}/ai-match")
async def ai_match(task_id: str, session: DbSession, user: AdminUser) -> dict:
    await _get_task(session, task_id, user.ngo_id)
    ranked = await rank_volunteers(session, task_id, user.ngo_id)
    return {"task_id": task_id, "ranked_volunteers": ranked}


@router.post("/tasks/{task_id}/ping")
async def ping_task(task_id: str, data: PingRequest, session: DbSession, user: AdminUser) -> dict:
    task = await _get_task(session, task_id, user.ngo_id)
    message = (data.message or f"NGO update on task: {task.title}").strip()
    volunteer_ids = (
        await session.scalars(
            select(Assignment.volunteer_id).where(
                Assignment.task_id == task_id,
                Assignment.ngo_id == user.ngo_id,
                Assignment.status.in_(ACTIVE_ASSIGNMENT),
            )
        )
    ).all()
    for volunteer_id in volunteer_ids:
        session.add(Notification(user_id=volunteer_id, message=message, type="general"))
    return {"count": len(volunteer_ids)}


@router.post("/tasks/{task_id}/complete")
async def complete_task(task_id: str, session: DbSession, user: AdminUser) -> dict:
    task = await _get_task(session, task_id, user.ngo_id)
    task.status = "completed"
    active = (
        await session.scalars(
            select(Assignment).where(
                Assignment.task_id == task_id, Assignment.status.in_(ACTIVE_ASSIGNMENT)
            )
        )
    ).all()
    now = utcnow()
    for assignment in active:
        assignment.status = "completed"
        # The Django version left completed_at NULL here, so admin-side
        # completions never appeared in any time-based analytics.
        assignment.completed_at = now
        session.add(
            Notification(
                user_id=assignment.volunteer_id,
                message=f"Task '{task.title}' has been marked complete",
                type="status_update",
            )
        )
    await realtime_bus.publish(
        user.ngo_id, "task_updated", {"task_id": task_id, "status": "completed"}
    )
    return {"message": "Task completed", "completed_assignments": len(active)}


@router.get("/assignments")
async def list_assignments(
    session: DbSession,
    user: AdminUser,
    status_filter: Annotated[str | None, Query(alias="status", max_length=20)] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
) -> list[dict]:
    query = select(Assignment).where(Assignment.ngo_id == user.ngo_id)
    if status_filter:
        query = query.where(Assignment.status == status_filter)
    rows = (
        await session.scalars(query.order_by(Assignment.assigned_at.desc()).limit(limit))
    ).all()
    return [
        {
            "id": a.id,
            "task_id": a.task_id,
            "volunteer_id": a.volunteer_id,
            "status": a.status,
            "assigned_at": a.assigned_at,
            "match_score": a.match_score,
        }
        for a in rows
    ]


@router.post("/routes/preview")
async def route_preview(
    data: RoutePreviewRequest, session: DbSession, user: AdminUser
) -> dict:
    from app.integrations.geo_routing import geo_routing_service

    profile = await session.scalar(
        select(VolunteerProfile).where(
            VolunteerProfile.user_id == data.volunteer_id,
            VolunteerProfile.ngo_id == user.ngo_id,
        )
    )
    if profile is None:
        raise NotFound("Volunteer")
    if profile.lat is None or profile.lng is None:
        raise BadRequest("Volunteer location unavailable")

    task = await _get_task(session, data.task_id, user.ngo_id)
    if task.lat is None or task.lng is None:
        raise BadRequest("Task location unavailable")

    route = await geo_routing_service.get_route(
        start=(profile.lat, profile.lng), end=(task.lat, task.lng)
    )
    return {"task_id": data.task_id, "volunteer_id": data.volunteer_id, **route}


# ── Resources ─────────────────────────────────────────────────────────────────

@router.get("/resources")
async def list_resources(session: DbSession, user: AdminUser) -> list[dict]:
    rows = (
        await session.scalars(select(Resource).where(Resource.ngo_id == user.ngo_id))
    ).all()
    return [
        {
            "id": r.id,
            "ngo_id": r.ngo_id,
            "type": r.type,
            "quantity": r.quantity,
            "availability_status": r.availability_status,
            "metadata": r.meta,
            "lat": r.lat,
            "lng": r.lng,
        }
        for r in rows
    ]


@router.post("/resources", status_code=status.HTTP_201_CREATED)
async def create_resource(data: ResourceCreate, session: DbSession, user: AdminUser) -> dict:
    resource = Resource(
        ngo_id=user.ngo_id,
        type=data.type,
        quantity=data.quantity,
        meta=data.metadata,
        lat=data.lat,
        lng=data.lng,
    )
    session.add(resource)
    await session.flush()
    return {"id": resource.id, "type": resource.type, "quantity": resource.quantity}


@router.put("/resources/{resource_id}")
async def update_resource(
    resource_id: str, data: ResourceUpdate, session: DbSession, user: AdminUser
) -> dict:
    resource = await session.scalar(
        select(Resource).where(Resource.id == resource_id, Resource.ngo_id == user.ngo_id)
    )
    if resource is None:
        raise NotFound("Resource")
    payload = data.model_dump(exclude_unset=True)
    if "metadata" in payload:
        resource.meta = payload.pop("metadata")
    for field, value in payload.items():
        setattr(resource, field, value)
    return {
        "id": resource.id,
        "type": resource.type,
        "quantity": resource.quantity,
        "availability_status": resource.availability_status,
    }


@router.delete("/resources/{resource_id}")
async def delete_resource(resource_id: str, session: DbSession, user: AdminUser) -> dict:
    resource = await session.scalar(
        select(Resource).where(Resource.id == resource_id, Resource.ngo_id == user.ngo_id)
    )
    if resource is None:
        raise NotFound("Resource")
    await session.execute(delete(Allocation).where(Allocation.resource_id == resource_id))
    await session.delete(resource)
    return {"message": "Resource deleted"}


@router.post("/resources/{resource_id}/allocate", status_code=status.HTTP_201_CREATED)
async def allocate_resource(
    resource_id: str, data: AllocateRequest, session: DbSession, user: AdminUser
) -> dict:
    resource = await session.scalar(
        select(Resource).where(Resource.id == resource_id, Resource.ngo_id == user.ngo_id)
    )
    if resource is None:
        raise NotFound("Resource")
    await _get_task(session, data.task_id, user.ngo_id)

    allocation = Allocation(
        resource_id=resource_id,
        task_id=data.task_id,
        ngo_id=user.ngo_id,
        allocation_status="active",
    )
    session.add(allocation)
    resource.availability_status = "in_use"
    await session.flush()
    return {"allocation_id": allocation.id, "status": allocation.allocation_status}


# ── Events ────────────────────────────────────────────────────────────────────

@router.get("/events")
async def list_events(session: DbSession, user: AdminUser) -> list[dict]:
    rows = (
        await session.scalars(
            select(Event).where(Event.ngo_id == user.ngo_id).order_by(Event.date.desc())
        )
    ).all()
    return [
        {
            "id": e.id,
            "title": e.title,
            "description": e.description,
            "event_type": e.event_type,
            "date": e.date,
            "location": e.location,
            "max_volunteers": e.max_volunteers,
            "status": e.status,
            "created_at": e.created_at,
        }
        for e in rows
    ]


@router.post("/events", status_code=status.HTTP_201_CREATED)
async def create_event(data: EventCreate, session: DbSession, user: AdminUser) -> dict:
    event = Event(ngo_id=user.ngo_id, **data.model_dump())
    session.add(event)
    await session.flush()
    return {"id": event.id, "title": event.title, "date": event.date}


@router.delete("/events/{event_id}")
async def delete_event(event_id: str, session: DbSession, user: AdminUser) -> dict:
    event = await session.scalar(
        select(Event).where(Event.id == event_id, Event.ngo_id == user.ngo_id)
    )
    if event is None:
        raise NotFound("Event")
    await session.execute(delete(EventAttendance).where(EventAttendance.event_id == event_id))
    await session.delete(event)
    return {"message": "Deleted"}


@router.get("/events/{event_id}/attendance")
async def event_attendance(event_id: str, session: DbSession, user: AdminUser) -> list[dict]:
    exists = await session.scalar(
        select(Event.id).where(Event.id == event_id, Event.ngo_id == user.ngo_id)
    )
    if not exists:
        raise NotFound("Event")
    volunteers = (
        await session.execute(
            select(User.id, User.email, User.full_name).where(
                User.ngo_id == user.ngo_id, User.role == "volunteer"
            )
        )
    ).all()
    recorded = dict(
        (
            await session.execute(
                select(EventAttendance.volunteer_id, EventAttendance.status).where(
                    EventAttendance.event_id == event_id
                )
            )
        ).all()
    )
    return [
        {
            "volunteer_id": vid,
            "email": email,
            "full_name": full_name,
            "status": recorded.get(vid, "invited"),
        }
        for vid, email, full_name in volunteers
    ]


@router.post("/events/{event_id}/attendance/{vol_id}")
async def set_attendance(
    event_id: str,
    vol_id: str,
    data: AttendanceRequest,
    session: DbSession,
    user: AdminUser,
) -> dict:
    exists = await session.scalar(
        select(Event.id).where(Event.id == event_id, Event.ngo_id == user.ngo_id)
    )
    if not exists:
        raise NotFound("Event")
    in_ngo = await session.scalar(
        select(User.id).where(
            User.id == vol_id, User.ngo_id == user.ngo_id, User.role == "volunteer"
        )
    )
    if not in_ngo:
        raise NotFound("Volunteer")

    record = await session.scalar(
        select(EventAttendance).where(
            EventAttendance.event_id == event_id, EventAttendance.volunteer_id == vol_id
        )
    )
    if record is None:
        record = EventAttendance(event_id=event_id, volunteer_id=vol_id, status=data.status)
        session.add(record)
    else:
        record.status = data.status
    return {"volunteer_id": vol_id, "status": data.status}


# ── Enrollments ───────────────────────────────────────────────────────────────

@router.get("/enrollment-requests")
async def list_enrollments(
    session: DbSession,
    user: AdminUser,
    status_filter: Annotated[str, Query(alias="status", max_length=20)] = "pending",
) -> list[dict]:
    rows = (
        await session.execute(
            select(TaskEnrollmentRequest, Task.title, User.full_name, User.email)
            .join(Task, Task.id == TaskEnrollmentRequest.task_id)
            .join(User, User.id == TaskEnrollmentRequest.volunteer_id)
            .where(
                TaskEnrollmentRequest.ngo_id == user.ngo_id,
                TaskEnrollmentRequest.status == status_filter,
            )
            .order_by(TaskEnrollmentRequest.created_at.desc())
        )
    ).all()
    return [
        {
            "id": e.id,
            "task_id": e.task_id,
            "task_title": title,
            "volunteer_id": e.volunteer_id,
            "volunteer_name": full_name or email.split("@")[0],
            "reason": e.reason,
            "why_useful": e.why_useful,
            "status": e.status,
            "created_at": e.created_at,
        }
        for e, title, full_name, email in rows
    ]


async def _resolve_enrollment(
    session: DbSession, enrollment_id: str, ngo_id: str, action: str
) -> dict:
    enrollment = await session.scalar(
        select(TaskEnrollmentRequest).where(
            TaskEnrollmentRequest.id == enrollment_id,
            TaskEnrollmentRequest.ngo_id == ngo_id,
        )
    )
    if enrollment is None:
        raise NotFound("Enrollment")
    # The Django version happily re-approved an already-decided request,
    # creating a second notification each time an admin double-clicked.
    if enrollment.status != "pending":
        raise Conflict(f"Enrollment was already {enrollment.status}")

    if action == "reject":
        enrollment.status = "rejected"
        session.add(
            Notification(
                user_id=enrollment.volunteer_id,
                message="Your enrollment request was not approved this time.",
                type="status_update",
            )
        )
        return {"enrollment_id": enrollment_id, "status": "rejected"}

    task = await session.get(Task, enrollment.task_id)
    if task is None:
        raise NotFound("Task")
    enrollment.status = "approved"

    existing = await session.scalar(
        select(Assignment.id).where(
            Assignment.task_id == enrollment.task_id,
            Assignment.volunteer_id == enrollment.volunteer_id,
            Assignment.ngo_id == ngo_id,
        )
    )
    if not existing:
        session.add(
            Assignment(
                task_id=enrollment.task_id,
                volunteer_id=enrollment.volunteer_id,
                ngo_id=ngo_id,
                status="assigned",
            )
        )
    session.add(
        Notification(
            user_id=enrollment.volunteer_id,
            message=f"Your enrollment for '{task.title}' was approved!",
            type="task_assigned",
        )
    )
    return {"enrollment_id": enrollment_id, "status": "approved"}


@router.post("/enrollment-requests/{enrollment_id}/approve")
async def approve_enrollment(enrollment_id: str, session: DbSession, user: AdminUser) -> dict:
    return await _resolve_enrollment(session, enrollment_id, user.ngo_id, "approve")


@router.post("/enrollment-requests/{enrollment_id}/reject")
async def reject_enrollment(enrollment_id: str, session: DbSession, user: AdminUser) -> dict:
    return await _resolve_enrollment(session, enrollment_id, user.ngo_id, "reject")


# ── Notifications ─────────────────────────────────────────────────────────────

@router.get("/notifications")
async def list_notifications(
    session: DbSession, user: AdminUser, limit: Annotated[int, Query(ge=1, le=200)] = 50
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


@router.post("/notifications/read-all")
async def mark_all_read(session: DbSession, user: AdminUser) -> dict:
    from sqlalchemy import update as sql_update

    result = await session.execute(
        sql_update(Notification)
        .where(Notification.user_id == user.user_id, Notification.is_read.is_(False))
        .values(is_read=True)
    )
    return {"marked": result.rowcount or 0}


@router.post("/notifications/{notif_id}/read")
async def mark_read(notif_id: str, session: DbSession, user: AdminUser) -> dict:
    notification = await session.scalar(
        select(Notification).where(
            Notification.id == notif_id, Notification.user_id == user.user_id
        )
    )
    if notification is None:
        raise NotFound("Notification")
    notification.is_read = True
    return {"id": notification.id, "is_read": True}


# ── Analytics & alerts ────────────────────────────────────────────────────────

@router.get("/analytics")
async def analytics(session: DbSession, user: AdminUser) -> dict:
    nid = user.ngo_id
    tasks = (
        await session.execute(
            select(
                func.count(Task.id).filter(Task.status == "open"),
                func.count(Task.id).filter(Task.status == "in_progress"),
                func.count(Task.id).filter(Task.status == "completed"),
                func.count(Task.id).filter(Task.status == "cancelled"),
                func.count(Task.id).filter(Task.priority == "high"),
                func.count(Task.id).filter(Task.priority == "medium"),
                func.count(Task.id).filter(Task.priority == "low"),
            ).where(Task.ngo_id == nid)
        )
    ).one()
    assignments = (
        await session.execute(
            select(
                func.count(Assignment.id).filter(Assignment.status == "assigned"),
                func.count(Assignment.id).filter(Assignment.status == "accepted"),
                func.count(Assignment.id).filter(Assignment.status == "completed"),
                func.count(Assignment.id).filter(Assignment.status == "rejected"),
            ).where(Assignment.ngo_id == nid)
        )
    ).one()
    total_volunteers = await session.scalar(
        select(func.count(User.id)).where(User.ngo_id == nid, User.role == "volunteer")
    )
    total_resources = await session.scalar(
        select(func.count(Resource.id)).where(Resource.ngo_id == nid)
    )
    return {
        "tasks_by_status": {
            "open": tasks[0],
            "in_progress": tasks[1],
            "completed": tasks[2],
            "cancelled": tasks[3],
        },
        "tasks_by_priority": {"high": tasks[4], "medium": tasks[5], "low": tasks[6]},
        "assignments_by_status": {
            "assigned": assignments[0],
            "accepted": assignments[1],
            "completed": assignments[2],
            "rejected": assignments[3],
        },
        "total_volunteers": total_volunteers or 0,
        "total_resources": total_resources or 0,
    }


@router.get("/alerts")
async def alerts(session: DbSession, user: AdminUser) -> dict:
    rows = (
        await session.scalars(
            select(Task)
            .where(
                Task.ngo_id == user.ngo_id,
                Task.priority == "high",
                Task.status.in_(("open", "in_progress")),
            )
            .order_by(Task.urgency_score.desc())
            .limit(5)
        )
    ).all()
    items = [
        {
            "type": "high_priority_task",
            "task_id": t.id,
            "title": t.title,
            "deadline": t.deadline,
            "status": t.status,
        }
        for t in rows
    ]
    return {"alerts": items, "count": len(items)}
