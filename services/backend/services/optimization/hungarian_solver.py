from __future__ import annotations

import math

import numpy as np
from scipy.optimize import linear_sum_assignment

from .cost_function import INFEASIBLE_COST


def solve(cost_matrix: list[list[float]]) -> list[tuple[int, int]]:
    if not cost_matrix or not cost_matrix[0]:
        return []

    matrix = np.array(cost_matrix, dtype=float)
    matrix[~np.isfinite(matrix)] = INFEASIBLE_COST
    matrix = np.clip(matrix, 0.0, INFEASIBLE_COST)
    row_ind, col_ind = linear_sum_assignment(matrix)
    return list(zip(row_ind.tolist(), col_ind.tolist()))