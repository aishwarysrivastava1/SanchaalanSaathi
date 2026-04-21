from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from services.optimization.reoptimization_engine import optimize_task_assignments as _optimize_task_assignments


async def optimize_task_assignments(
    ngo_id: str,
    db: AsyncSession,
    *,
    max_assignments: int | None = None,
) -> list[dict]:
    return await _optimize_task_assignments(
        ngo_id=ngo_id,
        db=db,
        max_assignments=max_assignments,
    )
