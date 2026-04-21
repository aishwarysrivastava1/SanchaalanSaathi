from __future__ import annotations

import math

from .clustering import chunk_indices, task_order, volunteer_order
from .cost_function import OptimizationScore, OptimizationWeights, compute_pair_score
from .route_optimizer import RouteOptimizationPlan, should_batch_routes
from .types import MatrixBuildResult, TaskSnapshot, VolunteerSnapshot


async def build_cost_matrix(
    volunteers: list[VolunteerSnapshot],
    tasks: list[TaskSnapshot],
    *,
    route_service,
    weights: OptimizationWeights = OptimizationWeights(),
    plan: RouteOptimizationPlan = RouteOptimizationPlan(),
) -> MatrixBuildResult:
    if not volunteers or not tasks:
        return MatrixBuildResult([], [], [], [], [])

    ordered_volunteers = volunteer_order(volunteers)
    ordered_tasks = task_order(tasks)
    ordered_volunteer_snapshots = [volunteers[index] for index in ordered_volunteers]
    ordered_task_snapshots = [tasks[index] for index in ordered_tasks]

    distance_lookup: dict[tuple[int, int], dict[str, float]] = {}
    if should_batch_routes(len(ordered_volunteer_snapshots), len(ordered_task_snapshots), plan):
        volunteer_batches = chunk_indices(list(range(len(ordered_volunteer_snapshots))), plan.batch_size)
        task_batches = chunk_indices(list(range(len(ordered_task_snapshots))), plan.batch_size)
        for volunteer_batch in volunteer_batches:
            origins = [
                (ordered_volunteer_snapshots[index].lat, ordered_volunteer_snapshots[index].lng)
                for index in volunteer_batch
            ]
            for task_batch in task_batches:
                destinations = [
                    (ordered_task_snapshots[index].lat, ordered_task_snapshots[index].lng)
                    for index in task_batch
                ]
                batch_matrix = await route_service.get_distance_matrix(origins, destinations)
                for local_row, volunteer_index in enumerate(volunteer_batch):
                    for local_col, task_index in enumerate(task_batch):
                        distance_lookup[(volunteer_index, task_index)] = batch_matrix.get(
                            (local_row, local_col),
                            {"distance_km": 9999.0, "duration_s": 999999.0},
                        )
    else:
        origins = [(snapshot.lat, snapshot.lng) for snapshot in ordered_volunteer_snapshots]
        destinations = [(snapshot.lat, snapshot.lng) for snapshot in ordered_task_snapshots]
        distance_lookup = await route_service.get_distance_matrix(origins, destinations)

    cost_matrix: list[list[float]] = []
    distance_matrix: list[list[float]] = []
    score_matrix: list[list[OptimizationScore]] = []

    for volunteer_index, volunteer in enumerate(ordered_volunteer_snapshots):
        cost_row: list[float] = []
        distance_row: list[float] = []
        score_row: list[OptimizationScore] = []
        for task_index, task in enumerate(ordered_task_snapshots):
            cell = distance_lookup.get((volunteer_index, task_index), {"distance_km": 9999.0})
            score = compute_pair_score(volunteer, task, float(cell.get("distance_km", 9999.0) or 9999.0), weights)
            cost_row.append(score.cost)
            distance_row.append(score.distance_km)
            score_row.append(score)
        cost_matrix.append(cost_row)
        distance_matrix.append(distance_row)
        score_matrix.append(score_row)

    return MatrixBuildResult(
        cost_matrix=cost_matrix,
        distance_matrix=distance_matrix,
        score_matrix=score_matrix,
        volunteer_order=ordered_volunteers,
        task_order=ordered_tasks,
    )