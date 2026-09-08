"""Agent-based coordination simulation.

`mesa` is an optional dependency, imported lazily so a deployment without it
still boots and /api/sim/run returns a clear error instead.
"""
import logging
import math
import random

try:
    import mesa

    _Agent, _Model = mesa.Agent, mesa.Model
except ImportError:  # pragma: no cover - optional extra
    mesa = None
    # Stand-in bases so the module still imports; run_simulation_scenario
    # raises before anything tries to instantiate these.
    _Agent = _Model = object
from app.integrations.neo4j import neo4j_service

logger = logging.getLogger(__name__)

def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

# ── Mesa Agent ────────────────────────────────────────────────────────────────
class VolunteerAgent(_Agent):
    def __init__(self, unique_id, model, speed=1.0, skills=None, lat=0.0, lng=0.0):
        super().__init__(unique_id, model)
        self.speed = speed
        self.skills = skills or []
        self.lat = lat
        self.lng = lng
        self.assigned_task = None
        self.tasks_completed = 0
        self.progress = 0.0

    def step(self):
        if not self.assigned_task:
            return

        task = self.assigned_task
        difficulty = task.get("difficulty", 10.0)
        self.progress += self.speed

        if self.progress >= difficulty:
            self.tasks_completed += 1
            self.model.completed_tasks.add(task["id"])
            self.assigned_task = None
            self.progress = 0.0
            # Move to task location
            self.lat = task.get("lat", self.lat)
            self.lng = task.get("lng", self.lng)

# ── Mesa Model ────────────────────────────────────────────────────────────────
class NGOSimulation(_Model):
    def __init__(self, volunteers_data, tasks_data, strategy="skill_first"):
        super().__init__()
        self.schedule = mesa.time.RandomActivation(self)
        self.completed_tasks = set()
        self.time_steps = 0
        self.tasks_data = [t.copy() for t in tasks_data]
        self.strategy = strategy
        self.step_log = []  # metrics log per step
        self.running = True

        for i, v_data in enumerate(volunteers_data):
            rep = v_data.get("reputationScore") or v_data.get("reputation_score") or 50
            speed = max(0.5, rep / 50.0)
            agent = VolunteerAgent(
                unique_id=i, 
                model=self, 
                speed=speed,
                skills=v_data.get("skills", []),
                lat=v_data.get("lat", 19.0530),
                lng=v_data.get("lng", 72.8543),
            )
            self.schedule.add(agent)

        self._assign_tasks()

    def _pending_tasks(self):
        return [t for t in self.tasks_data if t.get("id") not in self.completed_tasks]

    def _assign_tasks(self):
        available = [a for a in self.schedule.agents if not a.assigned_task]
        pending = self._pending_tasks()

        if self.strategy == "skill_first":
            pending = sorted(pending, key=lambda t: -t.get("urgency_score", 0))
            for task in pending:
                if not available:
                    break
                req_skills = set(task.get("required_skills", []))
                # Late binding is safe here: `score` is consumed by max() on the
                # next line, before `task`/`req_skills` are rebound.
                def score(agent):  # noqa: B023
                    skill_match = len(req_skills & set(agent.skills)) if req_skills else 1
                    dist = haversine(agent.lat, agent.lng, task.get("lat", agent.lat), task.get("lng", agent.lng))
                    return skill_match * 10 - dist * 0.1
                best = max(available, key=score)
                best.assigned_task = task
                best.progress = 0.0
                available.remove(best)

        elif self.strategy == "proximity_first":
            pending = sorted(pending, key=lambda t: -t.get("urgency_score", 0))
            for task in pending:
                if not available:
                    break
                t_lat = task.get("lat", 19.0530)
                t_lng = task.get("lng", 72.8543)
                closest = min(available, key=lambda a: haversine(a.lat, a.lng, t_lat, t_lng))
                closest.assigned_task = task
                closest.progress = 0.0
                available.remove(closest)

        else:  # random
            random.shuffle(pending)
            for task, agent in zip(pending, available):
                agent.assigned_task = task
                agent.progress = 0.0

    def step(self):
        self.schedule.step()
        self._assign_tasks()
        self.time_steps += 1

        total = len(self.tasks_data)
        done = len(self.completed_tasks)
        idle = sum(1 for a in self.schedule.agents if not a.assigned_task)
        coverage = round(done / total * 100, 1) if total else 0

        self.step_log.append({
            "step": self.time_steps,
            "tasks_completed": done,
            "coverage_pct": coverage,
            "volunteers_idle": idle,
        })

        if done >= total:
            self.running = False


# ── Helpers ───────────────────────────────────────────────────────────────────
async def _get_sim_snapshot():
    vol_cypher = """MATCH (v:Volunteer) OPTIONAL MATCH (v)-[:HAS_SKILL]->(s:Skill) RETURN v, collect(s.name) as skills LIMIT 50"""
    task_cypher = """MATCH (n:Need {status: 'PENDING'}) OPTIONAL MATCH (n)-[:REQUIRES_SKILL]->(s:Skill) OPTIONAL MATCH (n)-[:LOCATED_IN]->(l:Location) RETURN n, collect(s.name) as required_skills, l LIMIT 50"""
    vols = await neo4j_service.run_query(vol_cypher)
    tasks = await neo4j_service.run_query(task_cypher)

    vol_data = []
    for rec in (vols or []):
        v = rec["v"]
        lat = v.get("lat") or v.get("latitude")
        lng = v.get("lng") or v.get("longitude")
        if lat is None or lng is None:
            continue  # skip volunteers without location — no phantom defaults
        vol_data.append({
            "id": v.get("id"), "name": v.get("name"),
            "reputationScore": v.get("reputationScore") or v.get("reputation_score") or 50,
            "skills": rec.get("skills", []),
            "lat": float(lat), "lng": float(lng),
        })

    task_data = []
    for rec in (tasks or []):
        n = rec["n"]
        location = rec.get("l") or {}
        t_lat = location.get("lat") or n.get("lat")
        t_lng = location.get("lng") or n.get("lng")
        if t_lat is None or t_lng is None:
            continue  # skip tasks without location data
        urgency = float(n.get("urgency_score") or 0.5)
        task_data.append({
            "id": n.get("id"), "description": n.get("description", ""),
            "urgency_score": urgency,
            "required_skills": rec.get("required_skills", []),
            "lat": float(t_lat), "lng": float(t_lng),
            "difficulty": max(5, int((1.0 - urgency) * 20 + 5)),
        })
    return vol_data, task_data


# ── Public API ────────────────────────────────────────────────────────────────
async def run_simulation_scenario(num_steps: int = 50, strategy: str = "skill_first") -> dict:
    if mesa is None:
        raise RuntimeError(
            "Simulation requires the 'mesa' package. Install it or disable this endpoint."
        )
    num_steps = min(num_steps, 200)
    vol_data, task_data = await _get_sim_snapshot()

    if not task_data:
        return {"message": "No pending tasks with location data to simulate",
                "tasks_completed": 0, "total_tasks": 0, "strategy": strategy,
                "steps_simulated": 0, "completion_rate": 0, "step_log": []}
    if not vol_data:
        return {"message": "No volunteers with location data available",
                "tasks_completed": 0, "total_tasks": len(task_data), "strategy": strategy,
                "steps_simulated": 0, "completion_rate": 0, "step_log": []}

    model = NGOSimulation(vol_data, task_data, strategy=strategy)
    for _ in range(num_steps):
        if not model.running:
            break
        model.step()

    total = len(task_data)
    done = len(model.completed_tasks)
    return {
        "strategy": strategy,
        "steps_simulated": model.time_steps,
        "tasks_completed": done,
        "total_tasks": total,
        "completion_rate": round(done / total * 100, 1) if total else 0,
        "final_coverage": round(done / total * 100, 1) if total else 0,
        "estimated_hours": round(model.time_steps * 0.5, 1),
        "step_log": model.step_log,
    }

async def run_comparison_scenario(steps: int = 100) -> dict:
    vol_data, task_data = await _get_sim_snapshot()
    if not task_data or not vol_data:
        empty = {"tasks_completed": 0, "total_tasks": len(task_data), "completion_rate": 0, "final_coverage": 0, "steps_simulated": 0, "step_log": []}
        return {"skill_first": {**empty, "strategy": "skill_first"},
                "proximity_first": {**empty, "strategy": "proximity_first"},
                "random": {**empty, "strategy": "random"},
                "winner": "n/a", "message": "No data to simulate"}

    results = {}
    for strategy in ["skill_first", "proximity_first", "random"]:
        model = NGOSimulation(vol_data, task_data, strategy=strategy)
        for _ in range(steps):
            if not model.running:
                break
            model.step()
        total = len(task_data)
        done = len(model.completed_tasks)
        results[strategy] = {
            "strategy": strategy,
            "steps_simulated": model.time_steps,
            "tasks_completed": done,
            "total_tasks": total,
            "completion_rate": round(done / total * 100, 1) if total else 0,
            "final_coverage": round(done / total * 100, 1) if total else 0,
            "estimated_hours": round(model.time_steps * 0.5, 1),
            "step_log": model.step_log,
        }

    winner = max(results, key=lambda k: results[k]["final_coverage"])
    return {**results, "winner": winner, "delta": round(results[winner]["final_coverage"] - results["random"]["final_coverage"], 1)}
