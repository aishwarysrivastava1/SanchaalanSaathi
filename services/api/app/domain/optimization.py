"""Assignment optimisation: scoring, solvers and the cost matrix.

Pure functions over snapshots. The only I/O is the injected route service, so
this can be tested without a database or a network.

Previously eight files in an `optimization/` package that only ever imported
each other; one module is easier to follow end to end.
"""
from __future__ import annotations

import hashlib
import json
import logging
import math
from dataclasses import dataclass, field
from itertools import batched

import numpy as np
from scipy.optimize import linear_sum_assignment

logger = logging.getLogger(__name__)

INFEASIBLE_COST = 1_000_000.0
DISTANCE_CEILING_KM = 50.0
MAX_WORKLOAD = 5
UNKNOWN_DISTANCE = {"distance_km": 9999.0, "duration_s": 999999.0}

_CACHE_TTL_SECONDS = 900
_CACHE_MAX_ENTRIES = 256
_distance_cache: dict[str, dict] = {}


# ── Inputs and outputs ────────────────────────────────────────────────────────

@dataclass(frozen=True, slots=True)
class VolunteerSnapshot:
    volunteer_id: str
    lat: float | None
    lng: float | None
    skills: tuple[str, ...] = ()
    availability: dict[str, object] = field(default_factory=dict)
    performance_score: float | None = None
    workload: int = 0


@dataclass(frozen=True, slots=True)
class TaskSnapshot:
    task_id: str
    lat: float | None
    lng: float | None
    required_skills: tuple[str, ...] = ()
    priority: str = "medium"
    urgency_score: float | None = None
    created_at: object | None = None


@dataclass(frozen=True, slots=True)
class OptimizationWeights:
    distance: float = 0.35
    skill: float = 0.25
    availability: float = 0.10
    urgency: float = 0.10
    workload: float = 0.10
    reliability: float = 0.10


@dataclass(frozen=True, slots=True)
class OptimizationScore:
    utility: float
    cost: float
    distance_km: float
    feasible: bool


@dataclass(slots=True)
class MatrixBuildResult:
    cost_matrix: list[list[float]]
    score_matrix: list[list[OptimizationScore]]
    volunteer_order: list[int]
    task_order: list[int]


@dataclass(frozen=True, slots=True)
class AssignmentMatch:
    volunteer_id: str
    task_id: str
    match_score: float
    distance_km: float
    solver: str


@dataclass(frozen=True, slots=True)
class RouteOptimizationPlan:
    batch_size: int = 20
    matrix_pair_limit: int = 400
    hungarian_pair_limit: int = 900


# ── Scoring ───────────────────────────────────────────────────────────────────

def normalize_priority(priority: str | None) -> float:
    return {"low": 0.3, "medium": 0.6, "high": 1.0}.get((priority or "medium").lower(), 0.6)


def urgency_score(task: TaskSnapshot) -> float:
    if task.urgency_score is None:
        return normalize_priority(task.priority)
    return max(0.0, min(float(task.urgency_score) / 100.0, 1.0))


def availability_score(availability: dict[str, object]) -> float:
    if not availability:
        return 0.5
    return min(sum(1 for value in availability.values() if value) / 7.0, 1.0)


def skill_match_score(required: tuple[str, ...], actual: tuple[str, ...]) -> float:
    wanted = {s.strip().lower() for s in required if s and s.strip()}
    if not wanted:
        return 1.0
    have = {s.strip().lower() for s in actual if s and s.strip()}
    return len(wanted & have) / len(wanted)


def distance_score(distance_km: float) -> float:
    if math.isinf(distance_km):
        return 0.0
    return max(0.0, 1.0 - min(distance_km, DISTANCE_CEILING_KM) / DISTANCE_CEILING_KM)


def workload_score(workload: int) -> float:
    return max(0.0, 1.0 - min(workload, MAX_WORKLOAD) / MAX_WORKLOAD)


def reliability_score(performance_score: float | None) -> float:
    return max(0.0, min((performance_score or 0.0) / 100.0, 1.0))


def compute_pair_score(
    volunteer: VolunteerSnapshot,
    task: TaskSnapshot,
    distance_km: float,
    weights: OptimizationWeights = OptimizationWeights(),
) -> OptimizationScore:
    """A volunteer with none of the required skills is infeasible, whatever else fits."""
    skill = skill_match_score(task.required_skills, volunteer.skills)
    feasible = skill > 0.0

    utility = 0.0
    if feasible:
        utility = (
            weights.distance * distance_score(distance_km)
            + weights.skill * skill
            + weights.availability * availability_score(volunteer.availability)
            + weights.urgency * urgency_score(task)
            + weights.workload * workload_score(volunteer.workload)
            + weights.reliability * reliability_score(volunteer.performance_score)
        )

    return OptimizationScore(
        utility=utility,
        cost=1.0 - utility if feasible else INFEASIBLE_COST,
        distance_km=distance_km,
        feasible=feasible,
    )


# ── Solvers ───────────────────────────────────────────────────────────────────

def hungarian_solve(cost_matrix: list[list[float]]) -> list[tuple[int, int]]:
    """Globally optimal assignment."""
    if not cost_matrix or not cost_matrix[0]:
        return []
    matrix = np.array(cost_matrix, dtype=float)
    matrix[~np.isfinite(matrix)] = INFEASIBLE_COST
    rows, cols = linear_sum_assignment(np.clip(matrix, 0.0, INFEASIBLE_COST))
    return list(zip(rows.tolist(), cols.tolist()))


def greedy_solve(cost_matrix: list[list[float]]) -> list[tuple[int, int]]:
    """Cheapest pair first. Not optimal, but cheap enough for large matrices."""
    if not cost_matrix or not cost_matrix[0]:
        return []

    rows = set(range(len(cost_matrix)))
    cols = set(range(len(cost_matrix[0])))
    matches: list[tuple[int, int]] = []

    while rows and cols:
        best: tuple[int, int] | None = None
        best_cost = INFEASIBLE_COST
        for row in rows:
            for col in cols:
                cost = cost_matrix[row][col]
                if math.isfinite(cost) and cost < best_cost:
                    best, best_cost = (row, col), cost
        if best is None:
            break
        matches.append(best)
        rows.remove(best[0])
        cols.remove(best[1])

    return matches


def should_use_hungarian(volunteers: int, tasks: int, plan: RouteOptimizationPlan) -> bool:
    return volunteers * tasks <= plan.hungarian_pair_limit


def should_batch_routes(volunteers: int, tasks: int, plan: RouteOptimizationPlan) -> bool:
    return (
        volunteers * tasks > plan.matrix_pair_limit
        or volunteers > plan.batch_size
        or tasks > plan.batch_size
    )


# ── Ordering ──────────────────────────────────────────────────────────────────
# Sorting by location groups nearby rows together, so a batched distance lookup
# covers one compact area instead of criss-crossing the map.

def _geo_key(lat: float | None, lng: float | None) -> tuple[int, float, int, float]:
    return (1 if lat is None else 0, float(lat or 0.0), 1 if lng is None else 0, float(lng or 0.0))


def volunteer_order(volunteers: list[VolunteerSnapshot]) -> list[int]:
    return sorted(
        range(len(volunteers)),
        key=lambda i: (_geo_key(volunteers[i].lat, volunteers[i].lng), volunteers[i].workload),
    )


def task_order(tasks: list[TaskSnapshot]) -> list[int]:
    rank = {"high": 0, "medium": 1, "low": 2}
    return sorted(
        range(len(tasks)),
        key=lambda i: (
            rank.get((tasks[i].priority or "medium").lower(), 1),
            _geo_key(tasks[i].lat, tasks[i].lng),
            -float(tasks[i].urgency_score or 0.0),
        ),
    )


# ── Distance matrix ───────────────────────────────────────────────────────────

def _cache_key(volunteers: list[VolunteerSnapshot], tasks: list[TaskSnapshot]) -> str:
    """Keyed on coordinates only and order-insensitive, so the same geography
    reuses one lookup however the rows happen to be arranged."""
    raw = json.dumps(
        {
            "v": sorted((v.lat, v.lng) for v in volunteers if v.lat and v.lng),
            "t": sorted((t.lat, t.lng) for t in tasks if t.lat and t.lng),
        },
        sort_keys=True,
    )
    return "distmat:" + hashlib.sha256(raw.encode()).hexdigest()[:32]


async def _cache_get(key: str) -> dict | None:
    from app.core.cache import get_redis

    redis = await get_redis()
    if redis is not None:
        try:
            if raw := await redis.get(key):
                return json.loads(raw)
        except Exception as exc:
            logger.warning("Distance cache read failed: %s", exc)
    return _distance_cache.get(key)


async def _cache_set(key: str, value: dict) -> None:
    from app.core.cache import get_redis

    redis = await get_redis()
    if redis is not None:
        try:
            await redis.setex(key, _CACHE_TTL_SECONDS, json.dumps(value))
            return
        except Exception as exc:
            logger.warning("Distance cache write failed: %s", exc)
    if len(_distance_cache) >= _CACHE_MAX_ENTRIES:
        del _distance_cache[next(iter(_distance_cache))]
    _distance_cache[key] = value


async def _distances(
    volunteers: list[VolunteerSnapshot],
    tasks: list[TaskSnapshot],
    route_service,
    plan: RouteOptimizationPlan,
) -> dict[tuple[int, int], dict[str, float]]:
    if not should_batch_routes(len(volunteers), len(tasks), plan):
        return await route_service.get_distance_matrix(
            [(v.lat, v.lng) for v in volunteers], [(t.lat, t.lng) for t in tasks]
        )

    # Routing providers cap how many points one call may carry, so split into tiles.
    lookup: dict[tuple[int, int], dict[str, float]] = {}
    for vol_batch in batched(range(len(volunteers)), plan.batch_size):
        origins = [(volunteers[i].lat, volunteers[i].lng) for i in vol_batch]
        for task_batch in batched(range(len(tasks)), plan.batch_size):
            targets = [(tasks[i].lat, tasks[i].lng) for i in task_batch]
            tile = await route_service.get_distance_matrix(origins, targets)
            for row, vi in enumerate(vol_batch):
                for col, ti in enumerate(task_batch):
                    lookup[(vi, ti)] = tile.get((row, col), UNKNOWN_DISTANCE)
    return lookup


async def build_cost_matrix(
    volunteers: list[VolunteerSnapshot],
    tasks: list[TaskSnapshot],
    *,
    route_service,
    weights: OptimizationWeights = OptimizationWeights(),
    plan: RouteOptimizationPlan = RouteOptimizationPlan(),
) -> MatrixBuildResult:
    if not volunteers or not tasks:
        return MatrixBuildResult([], [], [], [])

    vol_order = volunteer_order(volunteers)
    tsk_order = task_order(tasks)
    ordered_volunteers = [volunteers[i] for i in vol_order]
    ordered_tasks = [tasks[i] for i in tsk_order]

    key = _cache_key(ordered_volunteers, ordered_tasks)
    if cached := await _cache_get(key):
        # Redis round-trips through JSON, so tuple keys come back as "row,col".
        distances = {(int(k.split(",")[0]), int(k.split(",")[1])): v for k, v in cached.items()}
    else:
        distances = await _distances(ordered_volunteers, ordered_tasks, route_service, plan)
        await _cache_set(key, {f"{r},{c}": v for (r, c), v in distances.items()})

    cost_matrix: list[list[float]] = []
    score_matrix: list[list[OptimizationScore]] = []
    for vi, volunteer in enumerate(ordered_volunteers):
        costs, scores = [], []
        for ti, task in enumerate(ordered_tasks):
            km = float(distances.get((vi, ti), UNKNOWN_DISTANCE).get("distance_km") or 9999.0)
            score = compute_pair_score(volunteer, task, km, weights)
            costs.append(score.cost)
            scores.append(score)
        cost_matrix.append(costs)
        score_matrix.append(scores)

    return MatrixBuildResult(cost_matrix, score_matrix, vol_order, tsk_order)
