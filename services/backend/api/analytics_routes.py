from fastapi import APIRouter, HTTPException
from services.neo4j_service import neo4j_service
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/summary")
async def get_summary():
    """High-level platform statistics for the dashboard analytics panel."""
    try:
        cypher = """
        MATCH (n:Need)
        WITH
            count(n)                                          AS total_needs,
            count(CASE WHEN n.status = 'PENDING'  THEN 1 END) AS pending,
            count(CASE WHEN n.status = 'RESOLVED' THEN 1 END) AS resolved,
            avg(n.urgency_score)                              AS avg_urgency,
            sum(n.population_affected)                        AS total_affected
        OPTIONAL MATCH (v:Volunteer)
        WITH total_needs, pending, resolved, avg_urgency, total_affected, count(v) AS total_volunteers
        OPTIONAL MATCH (v2:Volunteer {availabilityStatus: 'ACTIVE'})
        RETURN
            total_needs,
            pending,
            resolved,
            round(avg_urgency * 100) / 100.0  AS avg_urgency,
            total_affected,
            total_volunteers,
            count(v2) AS active_volunteers
        """
        results = await neo4j_service.run_query(cypher)
        if not results:
            return {
                "total_needs": 0, "pending": 0, "resolved": 0,
                "avg_urgency": 0, "total_affected": 0,
                "total_volunteers": 0, "active_volunteers": 0,
            }
        return results[0]
    except Exception as e:
        logger.error(f"Analytics summary failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch analytics summary")


@router.get("/needs-by-type")
async def get_needs_by_type():
    """Need counts grouped by type, ordered by frequency."""
    try:
        cypher = """
        MATCH (n:Need)
        RETURN n.type AS type, count(n) AS count
        ORDER BY count DESC
        LIMIT 10
        """
        results = await neo4j_service.run_query(cypher)
        return {"data": results}
    except Exception as e:
        logger.error(f"needs-by-type failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch needs by type")


@router.get("/urgency-distribution")
async def get_urgency_distribution():
    """Counts of needs in each urgency bucket: Low / Medium / High / Critical."""
    try:
        cypher = """
        MATCH (n:Need)
        RETURN
            count(CASE WHEN n.urgency_score < 0.3  THEN 1 END)                          AS low,
            count(CASE WHEN n.urgency_score >= 0.3 AND n.urgency_score < 0.6 THEN 1 END) AS medium,
            count(CASE WHEN n.urgency_score >= 0.6 AND n.urgency_score < 0.8 THEN 1 END) AS high,
            count(CASE WHEN n.urgency_score >= 0.8 THEN 1 END)                           AS critical
        """
        results = await neo4j_service.run_query(cypher)
        return results[0] if results else {"low": 0, "medium": 0, "high": 0, "critical": 0}
    except Exception as e:
        logger.error(f"urgency-distribution failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch urgency distribution")


@router.get("/skill-coverage")
async def get_skill_coverage():
    """
    Compares required skills (from Needs) vs available skills (from Volunteers).
    Useful for identifying skill gaps in the volunteer pool.
    """
    try:
        demanded_cypher = """
        MATCH (n:Need)-[:REQUIRES_SKILL]->(s:Skill)
        WHERE n.status = 'PENDING'
        RETURN s.name AS skill, count(n) AS demand
        ORDER BY demand DESC
        LIMIT 10
        """
        supplied_cypher = """
        MATCH (v:Volunteer)-[:HAS_SKILL]->(s:Skill)
        WHERE v.availabilityStatus = 'ACTIVE'
        RETURN s.name AS skill, count(v) AS supply
        """
        demanded, supplied = await neo4j_service.run_query(demanded_cypher), await neo4j_service.run_query(supplied_cypher)
        supply_map = {r["skill"]: r["supply"] for r in supplied}

        coverage = [
            {
                "skill":  r["skill"],
                "demand": r["demand"],
                "supply": supply_map.get(r["skill"], 0),
                "gap":    max(0, r["demand"] - supply_map.get(r["skill"], 0)),
            }
            for r in demanded
        ]
        return {"coverage": coverage}
    except Exception as e:
        logger.error(f"skill-coverage failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch skill coverage")


@router.get("/hotzone-ranking")
async def get_hotzone_ranking():
    """Ranks geographic zones by total urgency score of active needs."""
    try:
        cypher = """
        MATCH (n:Need {status: 'PENDING'})-[:LOCATED_IN]->(l:Location)
        RETURN
            l.name                     AS zone,
            count(n)                   AS need_count,
            round(sum(n.urgency_score) * 100) / 100.0 AS total_urgency,
            sum(n.population_affected) AS total_affected
        ORDER BY total_urgency DESC
        LIMIT 10
        """
        results = await neo4j_service.run_query(cypher)
        return {"hotzones": results}
    except Exception as e:
        logger.error(f"hotzone-ranking failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch hotzone ranking")
