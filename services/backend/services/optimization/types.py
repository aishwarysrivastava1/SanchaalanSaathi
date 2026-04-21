from __future__ import annotations

from dataclasses import dataclass, field


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
    components: dict[str, float] = field(default_factory=dict)


@dataclass(slots=True)
class MatrixBuildResult:
    cost_matrix: list[list[float]]
    distance_matrix: list[list[float]]
    score_matrix: list[list[OptimizationScore]]
    volunteer_order: list[int]
    task_order: list[int]


@dataclass(frozen=True, slots=True)
class AssignmentMatch:
    volunteer_id: str
    task_id: str
    match_score: float
    cost: float
    distance_km: float
    solver: str