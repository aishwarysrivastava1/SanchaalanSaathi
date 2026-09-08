"""Volunteer/task matching and bulk assignment dispatch.

Scoring lives in `app.domain.optimization`; this module loads candidates,
runs the solver and persists the result.
"""
from __future__ import annotations

import logging

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.optimization import (
    INFEASIBLE_COST,
    AssignmentMatch,
    OptimizationWeights,
    RouteOptimizationPlan,
    TaskSnapshot,
    VolunteerSnapshot,
    build_cost_matrix,
    greedy_solve,
    hungarian_solve,
    should_use_hungarian,
)
from app.models import Assignment, Notification, Task, User, VolunteerProfile

logger = logging.getLogger(__name__)

ACTIVE_STATUSES = ("assigned", "accepted")


async def _workloads(session: AsyncSession, ngo_id: str) -> dict[str, int]:
    rows = await session.execute(
        select(Assignment.volunteer_id, func.count(Assignment.id))
        .where(Assignment.ngo_id == ngo_id, Assignment.status.in_(ACTIVE_STATUSES))
        .group_by(Assignment.volunteer_id)
    )
    return dict(rows.all())


async def _performance_scores(
    session: AsyncSession, ngo_id: str, volunteer_ids: list[str]
) -> dict[str, float]:
    """0-100 reliability score from completed history.

    (avg_rating/5)*60 + avg_match*30 + min(completed,10) -- the same formula the
    Django engine used, so scores stay comparable across the cutover.
    """
    if not volunteer_ids:
        return {}
    rows = await session.execute(
        select(
            Assignment.volunteer_id,
            func.avg(Assignment.completion_rating),
            func.avg(Assignment.match_score),
            func.count(Assignment.id),
        )
        .where(
            Assignment.ngo_id == ngo_id,
            Assignment.volunteer_id.in_(volunteer_ids),
            Assignment.status == "completed",
        )
        .group_by(Assignment.volunteer_id)
    )
    scores: dict[str, float] = {}
    for vid, avg_rating, avg_match, completed in rows.all():
        scores[vid] = min(
            100.0,
            (float(avg_rating or 3.0) / 5.0) * 60.0
            + float(avg_match or 0.7) * 30.0
            + min(int(completed or 0), 10) * 1.0,
        )
    return scores


async def rank_volunteers(session: AsyncSession, task_id: str, ngo_id: str) -> list[dict]:
    """Rank every active volunteer for one task. Powers POST /tasks/{id}/ai-match."""
    task = await session.scalar(select(Task).where(Task.id == task_id, Task.ngo_id == ngo_id))
    if task is None:
        return []

    profiles = (
        await session.scalars(
            select(VolunteerProfile).where(
                VolunteerProfile.ngo_id == ngo_id, VolunteerProfile.status == "active"
            )
        )
    ).all()
    if not profiles:
        return []

    user_ids = [p.user_id for p in profiles]
    users = {
        u.id: u for u in (await session.scalars(select(User).where(User.id.in_(user_ids)))).all()
    }
    workload = await _workloads(session, ngo_id)

    required = {s.lower().strip() for s in (task.required_skills or []) if s and s.strip()}
    ranked: list[dict] = []

    for profile in profiles:
        user = users.get(profile.user_id)
        if user is None:
            continue
        vol_skills = {s.lower().strip() for s in (profile.skills or []) if s and s.strip()}
        matched = required & vol_skills

        skill_score = (len(matched) / len(required)) if required else 1.0
        availability = profile.availability or {}
        days_available = sum(1 for v in availability.values() if v)
        avail_score = min(days_available / 7, 1.0)
        load = workload.get(user.id, 0)
        load_score = max(0.0, 1.0 - (load / 5))

        ranked.append(
            {
                "volunteer_id": user.id,
                "email": user.email,
                "name": profile.full_name or user.email.split("@")[0],
                "score": round(skill_score * 0.5 + avail_score * 0.3 + load_score * 0.2, 3),
                "matched_skills": sorted(matched),
                "missing_skills": sorted(required - vol_skills),
                "workload": load,
                "available_days": days_available,
            }
        )

    ranked.sort(key=lambda r: r["score"], reverse=True)
    return ranked


async def load_candidates(
    session: AsyncSession, ngo_id: str
) -> tuple[list[TaskSnapshot], list[VolunteerSnapshot]]:
    tasks = (
        await session.scalars(
            select(Task)
            .where(Task.ngo_id == ngo_id, Task.status == "open")
            .order_by(Task.urgency_score.desc())
        )
    ).all()
    profiles = (
        await session.scalars(
            select(VolunteerProfile).where(
                VolunteerProfile.ngo_id == ngo_id, VolunteerProfile.status == "active"
            )
        )
    ).all()
    if not tasks or not profiles:
        return [], []

    user_ids = [p.user_id for p in profiles]
    known_users = {
        u.id for u in (await session.scalars(select(User).where(User.id.in_(user_ids)))).all()
    }
    workload = await _workloads(session, ngo_id)
    performance = await _performance_scores(session, ngo_id, sorted(known_users))

    task_snaps = [
        TaskSnapshot(
            task_id=t.id,
            lat=t.lat,
            lng=t.lng,
            required_skills=tuple(t.required_skills or []),
            priority=t.priority,
            urgency_score=float(t.urgency_score) if t.urgency_score is not None else None,
            created_at=t.created_at,
        )
        for t in tasks
    ]
    volunteer_snaps = [
        VolunteerSnapshot(
            volunteer_id=p.user_id,
            lat=p.lat,
            lng=p.lng,
            skills=tuple(p.skills or []),
            availability=dict(p.availability or {}),
            performance_score=performance.get(p.user_id),
            workload=workload.get(p.user_id, 0),
        )
        for p in profiles
        if p.user_id in known_users
    ]
    return task_snaps, volunteer_snaps


async def optimize_task_assignments(
    session: AsyncSession,
    ngo_id: str,
    *,
    max_assignments: int | None = None,
    weights: OptimizationWeights | None = None,
    route_plan: RouteOptimizationPlan | None = None,
) -> tuple[list[AssignmentMatch], str]:
    from app.integrations.geo_routing import geo_routing_service

    weights = weights or OptimizationWeights()
    route_plan = route_plan or RouteOptimizationPlan()

    tasks, volunteers = await load_candidates(session, ngo_id)
    if not tasks or not volunteers:
        return [], "none"

    matrix = await build_cost_matrix(
        volunteers, tasks, route_service=geo_routing_service, weights=weights, plan=route_plan
    )
    if not matrix.cost_matrix:
        return [], "none"

    use_hungarian = should_use_hungarian(len(volunteers), len(tasks), route_plan)
    solver = "hungarian" if use_hungarian else "greedy"
    try:
        pairs = hungarian_solve(matrix.cost_matrix) if use_hungarian else greedy_solve(matrix.cost_matrix)
    except Exception as exc:
        logger.warning("%s solver failed (%s) - falling back to greedy", solver, exc)
        solver = "greedy"
        pairs = greedy_solve(matrix.cost_matrix)

    matches: list[AssignmentMatch] = []
    for row, col in pairs:
        score = matrix.score_matrix[row][col]
        if score.cost >= INFEASIBLE_COST:
            continue
        matches.append(
            AssignmentMatch(
                volunteer_id=volunteers[matrix.volunteer_order[row]].volunteer_id,
                task_id=tasks[matrix.task_order[col]].task_id,
                match_score=round(score.utility * 100.0, 2),
                distance_km=round(score.distance_km, 3),
                solver=solver,
            )
        )

    matches.sort(key=lambda m: m.match_score, reverse=True)
    if max_assignments:
        matches = matches[:max_assignments]
    return matches, solver


async def dispatch_optimized_assignments(
    session: AsyncSession, ngo_id: str, *, max_assignments: int | None = None
) -> list[dict]:
    """Run the optimiser and persist the winning assignments."""
    from app.core.events import realtime_bus
    from app.core.observability import assignment_runs
    from app.integrations.neo4j import neo4j_service

    matches, solver = await optimize_task_assignments(
        session, ngo_id, max_assignments=max_assignments
    )
    if not matches:
        return []
    assignment_runs.labels(solver).inc()

    # One query covering every candidate task, replacing the old per-task EXISTS
    # round trip inside the loop.
    already_taken = set(
        (
            await session.scalars(
                select(Assignment.task_id).where(
                    Assignment.task_id.in_([m.task_id for m in matches]),
                    Assignment.status.in_(ACTIVE_STATUSES),
                )
            )
        ).all()
    )

    created: list[dict] = []
    for match in matches:
        if match.task_id in already_taken:
            continue

        assignment = Assignment(
            task_id=match.task_id,
            volunteer_id=match.volunteer_id,
            ngo_id=ngo_id,
            status="assigned",
            match_score=match.match_score,
        )
        session.add(assignment)
        session.add(
            Notification(
                user_id=match.volunteer_id,
                message="You have been assigned a new task",
                type="task_assigned",
            )
        )
        await session.flush()

        task = await session.get(Task, match.task_id)
        if task is not None:
            task.status = "in_progress"

        created.append(
            {
                "assignment_id": assignment.id,
                "task_id": match.task_id,
                "volunteer_id": match.volunteer_id,
                "match_score": match.match_score,
                "distance_km": match.distance_km,
                "solver": match.solver,
            }
        )

    # External side effects run only after the DB work is staged. A Neo4j or
    # WebSocket failure must never roll back an assignment.
    for row in created:
        try:
            await neo4j_service.upsert_assignment_edge(
                volunteer_id=row["volunteer_id"],
                task_id=row["task_id"],
                assignment_id=row["assignment_id"],
            )
        except Exception as exc:
            logger.warning("Neo4j assignment edge failed for %s: %s", row["assignment_id"], exc)
        await realtime_bus.publish(ngo_id, "assignment_updated", {**row, "status": "assigned"})

    return created
