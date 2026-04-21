from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

from services.optimization.cost_function import compute_pair_score, skill_match_score
from services.optimization.cost_matrix_builder import build_cost_matrix
from services.optimization.greedy_solver import solve as greedy_solve
from services.optimization.hungarian_solver import solve as hungarian_solve
from services.optimization.reoptimization_engine import optimize_task_assignments
from services.optimization.types import MatrixBuildResult, TaskSnapshot, VolunteerSnapshot


class FakeRouteService:
    async def get_distance_matrix(self, origins, destinations):
        matrix = {}
        for i, origin in enumerate(origins):
            for j, destination in enumerate(destinations):
                if origin[0] is None or origin[1] is None or destination[0] is None or destination[1] is None:
                    matrix[(i, j)] = {"distance_km": 9999.0, "duration_s": 999999.0}
                else:
                    matrix[(i, j)] = {
                        "distance_km": float(abs(origin[0] - destination[0]) + abs(origin[1] - destination[1])),
                        "duration_s": 0.0,
                    }
        return matrix


class OptimizationCoreTests(unittest.IsolatedAsyncioTestCase):
    async def test_solver_prefers_lowest_cost_pairs(self):
        cost_matrix = [[0.9, 0.1], [0.2, 0.8]]
        self.assertEqual(hungarian_solve(cost_matrix), [(0, 1), (1, 0)])
        self.assertEqual(greedy_solve(cost_matrix), [(0, 1), (1, 0)])

    async def test_pair_scoring_respects_skills(self):
        volunteer = VolunteerSnapshot(volunteer_id="v1", lat=0.0, lng=0.0, skills=("first aid",), workload=1)
        task = TaskSnapshot(task_id="t1", lat=0.0, lng=0.0, required_skills=("first aid",), priority="high")
        score = compute_pair_score(volunteer, task, 1.0)
        self.assertTrue(score.feasible)
        self.assertGreater(score.utility, 0.0)
        self.assertEqual(skill_match_score(task.required_skills, volunteer.skills), 1.0)

    async def test_cost_matrix_builder_batches_and_merges(self):
        volunteers = [
            VolunteerSnapshot(volunteer_id="v1", lat=0.0, lng=0.0, skills=("a",)),
            VolunteerSnapshot(volunteer_id="v2", lat=1.0, lng=1.0, skills=("b",)),
        ]
        tasks = [
            TaskSnapshot(task_id="t1", lat=0.0, lng=0.0, required_skills=(), priority="medium"),
            TaskSnapshot(task_id="t2", lat=2.0, lng=2.0, required_skills=(), priority="low"),
        ]
        result = await build_cost_matrix(volunteers, tasks, route_service=FakeRouteService())
        self.assertEqual(len(result.cost_matrix), 2)
        self.assertEqual(len(result.cost_matrix[0]), 2)
        self.assertEqual(result.volunteer_order, [0, 1])
        self.assertEqual(result.task_order, [0, 1])

    async def test_public_optimizer_limits_results_and_keeps_order(self):
        tasks = [
            TaskSnapshot(task_id="t1", lat=0.0, lng=0.0, required_skills=(), priority="high"),
            TaskSnapshot(task_id="t2", lat=1.0, lng=1.0, required_skills=(), priority="medium"),
        ]
        volunteers = [
            VolunteerSnapshot(volunteer_id="v1", lat=0.0, lng=0.0, skills=("a",)),
            VolunteerSnapshot(volunteer_id="v2", lat=1.0, lng=1.0, skills=("b",)),
        ]
        matrix = MatrixBuildResult(
            cost_matrix=[[0.1, 0.7], [0.6, 0.2]],
            distance_matrix=[[1.0, 2.0], [3.0, 4.0]],
            score_matrix=[
                [compute_pair_score(volunteers[0], tasks[0], 1.0), compute_pair_score(volunteers[0], tasks[1], 2.0)],
                [compute_pair_score(volunteers[1], tasks[0], 3.0), compute_pair_score(volunteers[1], tasks[1], 4.0)],
            ],
            volunteer_order=[0, 1],
            task_order=[0, 1],
        )

        with patch("services.optimization.reoptimization_engine._load_candidates", AsyncMock(return_value=(tasks, volunteers))), patch(
            "services.optimization.reoptimization_engine.build_cost_matrix", AsyncMock(return_value=matrix)
        ), patch("services.optimization.reoptimization_engine.should_use_hungarian", return_value=True), patch(
            "services.optimization.reoptimization_engine.hungarian_solve", return_value=[(0, 0), (1, 1)]
        ):
            result = await optimize_task_assignments("ngo-1", db=AsyncMock(), max_assignments=1)

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["volunteer_id"], "v1")
        self.assertEqual(result[0]["task_id"], "t1")

    async def test_public_optimizer_returns_empty_when_no_candidates(self):
        with patch("services.optimization.reoptimization_engine._load_candidates", AsyncMock(return_value=([], []))):
            result = await optimize_task_assignments("ngo-1", db=AsyncMock())
        self.assertEqual(result, [])


if __name__ == "__main__":
    unittest.main()