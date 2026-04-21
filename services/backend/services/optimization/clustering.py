from __future__ import annotations

from .types import TaskSnapshot, VolunteerSnapshot


def _geo_key(lat: float | None, lng: float | None) -> tuple[int, float, int, float]:
    return (
        1 if lat is None else 0,
        float(lat or 0.0),
        1 if lng is None else 0,
        float(lng or 0.0),
    )


def volunteer_order(volunteers: list[VolunteerSnapshot]) -> list[int]:
    return sorted(
        range(len(volunteers)),
        key=lambda index: (_geo_key(volunteers[index].lat, volunteers[index].lng), volunteers[index].workload),
    )


def task_order(tasks: list[TaskSnapshot]) -> list[int]:
    priority_rank = {"high": 0, "medium": 1, "low": 2}
    return sorted(
        range(len(tasks)),
        key=lambda index: (
            priority_rank.get((tasks[index].priority or "medium").lower(), 1),
            _geo_key(tasks[index].lat, tasks[index].lng),
            -float(tasks[index].urgency_score or 0.0),
        ),
    )


def chunk_indices(indices: list[int], chunk_size: int) -> list[list[int]]:
    if chunk_size <= 0:
        return [indices]
    return [indices[start : start + chunk_size] for start in range(0, len(indices), chunk_size)]