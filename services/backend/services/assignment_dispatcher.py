from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import Assignment, Notification, Task, User
from services.assignment_optimizer import optimize_task_assignments
from services.neo4j_service import neo4j_service
from services.realtime_events import realtime_bus


async def dispatch_optimized_assignments(
    *,
    ngo_id: str,
    db: AsyncSession,
    max_assignments: int | None = None,
) -> list[dict]:
    matches = await optimize_task_assignments(
        ngo_id=ngo_id,
        db=db,
        max_assignments=max_assignments,
    )
    if not matches:
        return []

    created: list[dict] = []
    for m in matches:
        task = await db.get(Task, m["task_id"])
        volunteer = await db.get(User, m["volunteer_id"])
        if not task or task.ngo_id != ngo_id or task.status != "open":
            continue
        if not volunteer or volunteer.ngo_id != ngo_id or volunteer.role != "volunteer":
            continue

        existing_active = (await db.execute(
            select(Assignment).where(
                Assignment.task_id == task.id,
                Assignment.status.in_(["assigned", "accepted"]),
            )
        )).scalar_one_or_none()
        if existing_active:
            continue

        assignment = Assignment(
            task_id=task.id,
            volunteer_id=volunteer.id,
            ngo_id=ngo_id,
            match_score=m["match_score"],
        )
        db.add(assignment)
        task.status = "in_progress"

        db.add(Notification(
            user_id=volunteer.id,
            message=f"You have been assigned: {task.title}",
            type="task_assigned",
        ))
        await db.flush()

        await neo4j_service.upsert_assignment_edge(
            volunteer_id=volunteer.id,
            task_id=task.id,
            assignment_id=assignment.id,
        )
        await realtime_bus.publish(
            ngo_id,
            "assignment_updated",
            {
                "assignment_id": assignment.id,
                "task_id": task.id,
                "volunteer_id": volunteer.id,
                "status": assignment.status,
                "match_score": m["match_score"],
            },
        )
        created.append(
            {
                "assignment_id": assignment.id,
                "task_id": task.id,
                "volunteer_id": volunteer.id,
                "match_score": m["match_score"],
            }
        )

    return created
