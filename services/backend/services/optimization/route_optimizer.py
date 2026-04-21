from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class RouteOptimizationPlan:
    batch_size: int = 20
    matrix_pair_limit: int = 400
    hungarian_pair_limit: int = 900


def should_batch_routes(volunteer_count: int, task_count: int, plan: RouteOptimizationPlan) -> bool:
    pair_count = volunteer_count * task_count
    return pair_count > plan.matrix_pair_limit or volunteer_count > plan.batch_size or task_count > plan.batch_size


def should_use_hungarian(volunteer_count: int, task_count: int, plan: RouteOptimizationPlan) -> bool:
    return volunteer_count * task_count <= plan.hungarian_pair_limit