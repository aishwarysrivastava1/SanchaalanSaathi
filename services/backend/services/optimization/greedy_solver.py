from __future__ import annotations

import math

from .cost_function import INFEASIBLE_COST


def solve(cost_matrix: list[list[float]]) -> list[tuple[int, int]]:
    if not cost_matrix or not cost_matrix[0]:
        return []

    remaining_rows = set(range(len(cost_matrix)))
    remaining_cols = set(range(len(cost_matrix[0])))
    matches: list[tuple[int, int]] = []

    while remaining_rows and remaining_cols:
        best_pair: tuple[int, int] | None = None
        best_cost = INFEASIBLE_COST

        for row in remaining_rows:
            for col in remaining_cols:
                cost = cost_matrix[row][col]
                if not math.isfinite(cost) or cost >= INFEASIBLE_COST:
                    continue
                if cost < best_cost:
                    best_cost = cost
                    best_pair = (row, col)

        if best_pair is None:
            break

        matches.append(best_pair)
        remaining_rows.remove(best_pair[0])
        remaining_cols.remove(best_pair[1])

    return matches