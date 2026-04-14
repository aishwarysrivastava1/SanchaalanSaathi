from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, List
from services.neo4j_service import neo4j_service
import logging
import uuid

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Request / Response Models ──────────────────────────────────────────────────

class VolunteerCreateReq(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    phone: Optional[str] = Field(None, max_length=20)
    skills: List[str] = Field(default_factory=list)
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    location_name: str = Field(..., min_length=1, max_length=200)


class VolunteerStatusReq(BaseModel):
    volunteer_id: str
    status: str  # ACTIVE | BUSY | OFFLINE

    def validate_status(self):
        allowed = {"ACTIVE", "BUSY", "OFFLINE"}
        if self.status not in allowed:
            raise ValueError(f"Status must be one of {allowed}")


class SkillUpdateReq(BaseModel):
    volunteer_id: str
    skill: str = Field(..., min_length=1, max_length=80)


class AssignTaskReq(BaseModel):
    volunteer_id: str
    task_id: str


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/")
async def list_volunteers(
    status: Optional[str] = None,
    skill: Optional[str] = None,
    limit: int = Query(50, le=200),
):
    """List volunteers with optional status and skill filters."""
    try:
        where_clauses = []
        params: dict = {"limit": limit}

        if status:
            allowed = {"ACTIVE", "BUSY", "OFFLINE"}
            if status not in allowed:
                raise HTTPException(status_code=400, detail="Invalid status filter")
            where_clauses.append("v.availabilityStatus = $status")
            params["status"] = status

        where_str = "WHERE " + " AND ".join(where_clauses) if where_clauses else ""

        if skill:
            cypher = f"""
            MATCH (v:Volunteer)-[:HAS_SKILL]->(s:Skill)
            WHERE s.name = $skill
            OPTIONAL MATCH (v)-[:LOCATED_IN]->(l:Location)
            OPTIONAL MATCH (v)-[:HAS_SKILL]->(allSkills:Skill)
            {where_str}
            RETURN v, collect(DISTINCT allSkills) as skills, l
            LIMIT $limit
            """
            params["skill"] = skill
        else:
            cypher = f"""
            MATCH (v:Volunteer)
            {where_str}
            OPTIONAL MATCH (v)-[:HAS_SKILL]->(s:Skill)
            OPTIONAL MATCH (v)-[:LOCATED_IN]->(l:Location)
            RETURN v, collect(s) as skills, l
            LIMIT $limit
            """

        results = await neo4j_service.run_query(cypher, params)
        return {"volunteers": results, "count": len(results)}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"list_volunteers failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to list volunteers")


@router.get("/{volunteer_id}")
async def get_volunteer(volunteer_id: str):
    """Fetch a single volunteer with full profile data."""
    try:
        cypher = """
        MATCH (v:Volunteer {id: $id})
        OPTIONAL MATCH (v)-[:HAS_SKILL]->(s:Skill)
        OPTIONAL MATCH (v)-[:LOCATED_IN]->(l:Location)
        OPTIONAL MATCH (v)-[:ASSIGNED_TO]->(t:Task)
        RETURN v, collect(DISTINCT s) as skills, l, collect(DISTINCT t) as tasks
        """
        results = await neo4j_service.run_query(cypher, {"id": volunteer_id})
        if not results:
            raise HTTPException(status_code=404, detail="Volunteer not found")
        return results[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_volunteer failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch volunteer")


@router.post("/")
async def create_volunteer(req: VolunteerCreateReq):
    """Register a new volunteer in the knowledge graph."""
    try:
        volunteer_id = str(uuid.uuid4())
        location_id  = str(uuid.uuid4())

        cypher = """
        MERGE (l:Location {name: $location_name})
        ON CREATE SET l.id = $location_id, l.lat = $lat, l.lng = $lng,
                      l.point = point({latitude: $lat, longitude: $lng})
        ON MATCH  SET l.lat = $lat, l.lng = $lng

        CREATE (v:Volunteer {
            id:                   $volunteer_id,
            name:                 $name,
            phone:                $phone,
            availabilityStatus:   'ACTIVE',
            reputationScore:      100,
            totalXP:              0,
            totalTasksCompleted:  0,
            currentActiveTasks:   0
        })
        CREATE (v)-[:LOCATED_IN]->(l)

        WITH v
        UNWIND $skills AS skillName
        MERGE (s:Skill {name: skillName})
        MERGE (v)-[:HAS_SKILL]->(s)

        RETURN v
        """
        params = {
            "volunteer_id": volunteer_id,
            "location_id":  location_id,
            "name":         req.name,
            "phone":        req.phone or "",
            "lat":          req.lat,
            "lng":          req.lng,
            "location_name": req.location_name,
            "skills":       req.skills,
        }
        results = await neo4j_service.run_query(cypher, params)
        if not results:
            raise HTTPException(status_code=500, detail="Failed to create volunteer")
        return {"success": True, "volunteer_id": volunteer_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"create_volunteer failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to create volunteer")


@router.patch("/status")
async def update_volunteer_status(req: VolunteerStatusReq):
    """Update a volunteer's availability status."""
    allowed = {"ACTIVE", "BUSY", "OFFLINE"}
    if req.status not in allowed:
        raise HTTPException(status_code=400, detail=f"Status must be one of {allowed}")
    try:
        cypher = """
        MATCH (v:Volunteer {id: $id})
        SET v.availabilityStatus = $status
        RETURN v.id AS id, v.availabilityStatus AS status
        """
        results = await neo4j_service.run_query(cypher, {"id": req.volunteer_id, "status": req.status})
        if not results:
            raise HTTPException(status_code=404, detail="Volunteer not found")
        return {"success": True, "updated": results[0]}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_volunteer_status failed: {e}")
        raise HTTPException(status_code=500, detail="Status update failed")


@router.post("/skills/add")
async def add_skill(req: SkillUpdateReq):
    """Add a skill to a volunteer's profile."""
    try:
        cypher = """
        MATCH (v:Volunteer {id: $id})
        MERGE (s:Skill {name: $skill})
        MERGE (v)-[:HAS_SKILL]->(s)
        RETURN v.id AS id
        """
        results = await neo4j_service.run_query(cypher, {"id": req.volunteer_id, "skill": req.skill})
        if not results:
            raise HTTPException(status_code=404, detail="Volunteer not found")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"add_skill failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to add skill")


@router.post("/skills/remove")
async def remove_skill(req: SkillUpdateReq):
    """Remove a skill from a volunteer's profile."""
    try:
        cypher = """
        MATCH (v:Volunteer {id: $id})-[r:HAS_SKILL]->(s:Skill {name: $skill})
        DELETE r
        RETURN v.id AS id
        """
        results = await neo4j_service.run_query(cypher, {"id": req.volunteer_id, "skill": req.skill})
        if not results:
            raise HTTPException(status_code=404, detail="Volunteer or skill relationship not found")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"remove_skill failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to remove skill")


@router.get("/{volunteer_id}/stats")
async def get_volunteer_stats(volunteer_id: str):
    """Detailed stats for a volunteer: XP, tasks, skill count, reputation."""
    try:
        cypher = """
        MATCH (v:Volunteer {id: $id})
        OPTIONAL MATCH (v)-[:HAS_SKILL]->(s:Skill)
        OPTIONAL MATCH (v)-[:ASSIGNED_TO]->(t:Task)
        RETURN
            v.totalXP               AS total_xp,
            v.totalTasksCompleted   AS tasks_completed,
            v.reputationScore       AS reputation,
            v.availabilityStatus    AS status,
            count(DISTINCT s)       AS skill_count,
            count(DISTINCT t)       AS active_tasks
        """
        results = await neo4j_service.run_query(cypher, {"id": volunteer_id})
        if not results:
            raise HTTPException(status_code=404, detail="Volunteer not found")
        return results[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_volunteer_stats failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch volunteer stats")
