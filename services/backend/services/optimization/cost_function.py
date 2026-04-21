from __future__ import annotations

import math

from .types import OptimizationScore, OptimizationWeights, TaskSnapshot, VolunteerSnapshot

INFEASIBLE_COST = 1_000_000.0


def normalize_priority(priority: str | None) -> float:
    return {"low": 0.3, "medium": 0.6, "high": 1.0}.get((priority or "medium").lower(), 0.6)


def urgency_score(task: TaskSnapshot) -> float:
    if task.urgency_score is not None:
        return max(0.0, min(float(task.urgency_score) / 100.0, 1.0))
    return normalize_priority(task.priority)


def availability_score(availability: dict[str, object]) -> float:
    if not availability:
        return 0.5
    active_days = sum(1 for value in availability.values() if bool(value))
    return min(active_days / 7.0, 1.0)


def skill_match_score(required_skills: tuple[str, ...], actual_skills: tuple[str, ...]) -> float:
    required = {skill.strip().lower() for skill in required_skills if skill and skill.strip()}
    if not required:
        return 1.0
    actual = {skill.strip().lower() for skill in actual_skills if skill and skill.strip()}
    return len(required & actual) / max(len(required), 1)


def distance_score(distance_km: float) -> float:
    if math.isinf(distance_km):
        return 0.0
    return max(0.0, 1.0 - min(distance_km, 50.0) / 50.0)


def workload_score(workload: int) -> float:
    return max(0.0, 1.0 - min(workload, 5) / 5.0)


def reliability_score(performance_score: float | None) -> float:
    return max(0.0, min((performance_score or 0.0) / 100.0, 1.0))


def pair_is_feasible(volunteer: VolunteerSnapshot, task: TaskSnapshot) -> bool:
    return skill_match_score(task.required_skills, volunteer.skills) > 0.0


def compute_pair_score(
    volunteer: VolunteerSnapshot,
    task: TaskSnapshot,
    distance_km: float,
    weights: OptimizationWeights = OptimizationWeights(),
) -> OptimizationScore:
    skill = skill_match_score(task.required_skills, volunteer.skills)
    availability = availability_score(volunteer.availability)
    urgency = urgency_score(task)
    workload = workload_score(volunteer.workload)
    reliability = reliability_score(volunteer.performance_score)
    distance = distance_score(distance_km)

    feasible = skill > 0.0
    utility = (
        weights.distance * distance
        + weights.skill * skill
        + weights.availability * availability
        + weights.urgency * urgency
        + weights.workload * workload
        + weights.reliability * reliability
    )
    if not feasible:
        utility = 0.0

    cost = 1.0 - utility if feasible else INFEASIBLE_COST
    return OptimizationScore(
        utility=utility,
        cost=cost,
        distance_km=distance_km,
        feasible=feasible,
        components={
            "distance": distance,
            "skill": skill,
            "availability": availability,
            "urgency": urgency,
            "workload": workload,
            "reliability": reliability,
        },
    )