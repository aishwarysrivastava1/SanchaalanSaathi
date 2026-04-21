from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import Assignment, Task, User, VolunteerProfile
from services.geo_routing_service import geo_routing_service

from .cost_function import INFEASIBLE_COST, OptimizationWeights
from .cost_matrix_builder import build_cost_matrix
from .greedy_solver import solve as greedy_solve
from .hungarian_solver import solve as hungarian_solve
from .route_optimizer import RouteOptimizationPlan, should_use_hungarian
from .types import AssignmentMatch, TaskSnapshot, VolunteerSnapshot


@dataclass(frozen=True, slots=True)
class OptimizationResult:
    matches: list[AssignmentMatch]
    solver_used: str


async def _load_workloads(db: AsyncSession, ngo_id: str) -> dict[str, int]:
    result = await db.execute(
        select(Assignment.volunteer_id, func.count().label("cnt"))
        .where(
            Assignment.ngo_id == ngo_id,
            Assignment.status.in_(["assigned", "accepted"]),
        )
        .group_by(Assignment.volunteer_id)
    )
    return {row.volunteer_id: int(row.cnt) for row in result}


async def _load_candidates(db: AsyncSession, ngo_id: str) -> tuple[list[TaskSnapshot], list[VolunteerSnapshot]]:
    task_rows = (
        await db.execute(
            select(Task)
            .where(Task.ngo_id == ngo_id, Task.status == "open")
            .order_by(Task.priority.desc(), Task.created_at.asc())
        )
    ).scalars().all()

    volunteer_rows = (
        await db.execute(
            select(User, VolunteerProfile)
            .join(VolunteerProfile, VolunteerProfile.user_id == User.id)
            .where(
                User.ngo_id == ngo_id,
                User.role == "volunteer",
                VolunteerProfile.status == "active",
                VolunteerProfile.share_location == True,  # noqa: E712
            )
        )
    ).all()

    workloads = await _load_workloads(db, ngo_id)

    tasks = [
        TaskSnapshot(
            task_id=task.id,
            lat=task.lat,
            lng=task.lng,
            required_skills=tuple(task.required_skills or []),
            priority=task.priority,
            urgency_score=float(task.urgency_score) if task.urgency_score is not None else None,
            created_at=task.created_at,
        )
        for task in task_rows
    ]
    volunteers = [
        VolunteerSnapshot(
            volunteer_id=user.id,
            lat=profile.lat,
            lng=profile.lng,
            skills=tuple(profile.skills or []),
            availability=dict(profile.availability or {}),
            performance_score=float(profile.performance_score) if profile.performance_score is not None else None,
            workload=workloads.get(user.id, 0),
        )
        for user, profile in volunteer_rows
    ]
    return tasks, volunteers


async def optimize_task_assignments(
    ngo_id: str,
    db: AsyncSession,
    *,
    max_assignments: int | None = None,
    weights: OptimizationWeights = OptimizationWeights(),
    route_plan: RouteOptimizationPlan = RouteOptimizationPlan(),
) -> list[dict]:
    tasks, volunteers = await _load_candidates(db, ngo_id)
    if not tasks or not volunteers:
        return []

    matrix = await build_cost_matrix(
        volunteers,
        tasks,
        route_service=geo_routing_service,
        weights=weights,
        plan=route_plan,
    )
    if not matrix.cost_matrix:
        return []

    solver_used = "hungarian" if should_use_hungarian(len(volunteers), len(tasks), route_plan) else "greedy"
    try:
        pairs = hungarian_solve(matrix.cost_matrix) if solver_used == "hungarian" else greedy_solve(matrix.cost_matrix)
    except Exception:
        solver_used = "greedy"
        pairs = greedy_solve(matrix.cost_matrix)

    matches: list[AssignmentMatch] = []
    for row_index, col_index in pairs:
        score = matrix.score_matrix[row_index][col_index]
        if score.cost >= INFEASIBLE_COST:
            continue
        volunteer = volunteers[matrix.volunteer_order[row_index]]
        task = tasks[matrix.task_order[col_index]]
        matches.append(
            AssignmentMatch(
                volunteer_id=volunteer.volunteer_id,
                task_id=task.task_id,
                match_score=round(score.utility * 100.0, 2),
                cost=score.cost,
                distance_km=round(score.distance_km, 3),
                solver=solver_used,
            )
        )

    matches.sort(key=lambda item: item.match_score, reverse=True)
    if max_assignments is not None and max_assignments > 0:
        matches = matches[:max_assignments]

    return [
        {
            "volunteer_id": match.volunteer_id,
            "task_id": match.task_id,
            "match_score": match.match_score,
        }
        for match in matches
    ]