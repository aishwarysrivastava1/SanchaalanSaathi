import logging

from neo4j import AsyncGraphDatabase

from app.core.config import settings

logger = logging.getLogger(__name__)

_LOG_LEVELS = {
    "DEBUG": logging.DEBUG,
    "INFO": logging.INFO,
    "WARNING": logging.WARNING,
    "ERROR": logging.ERROR,
    "CRITICAL": logging.CRITICAL,
}
_NOTIFICATION_LEVEL = "WARNING"
logging.getLogger("neo4j.notifications").setLevel(
    _LOG_LEVELS.get(_NOTIFICATION_LEVEL, logging.WARNING)
)

SCHEMA_QUERIES = [
    "CREATE CONSTRAINT need_id IF NOT EXISTS FOR (n:Need) REQUIRE n.id IS UNIQUE",
    "CREATE CONSTRAINT location_id IF NOT EXISTS FOR (l:Location) REQUIRE l.id IS UNIQUE",
    "CREATE CONSTRAINT volunteer_id IF NOT EXISTS FOR (v:Volunteer) REQUIRE v.id IS UNIQUE",
    "CREATE CONSTRAINT skill_name IF NOT EXISTS FOR (s:Skill) REQUIRE s.name IS UNIQUE",
    "CREATE CONSTRAINT task_id IF NOT EXISTS FOR (t:Task) REQUIRE t.id IS UNIQUE",
    "CREATE POINT INDEX location_point IF NOT EXISTS FOR (l:Location) ON (l.point)",
]

class Neo4jService:
    def __init__(self):
        self._driver = None
        
    def get_driver(self):
        if not self._driver:
            if not settings.neo4j_password:
                logger.warning("NEO4J_PASSWORD is not set - graph features will fail to authenticate")
            self._driver = AsyncGraphDatabase.driver(
                settings.neo4j_uri or "bolt://localhost:7687",
                auth=(settings.neo4j_user, settings.neo4j_password),
                max_connection_pool_size=10,
                connection_acquisition_timeout=15,
            )
        return self._driver

    async def close_driver(self):
        if self._driver:
            await self._driver.close()
            self._driver = None

    async def run_query(self, cypher: str, params: dict = None) -> list[dict]:
        params = params or {}
        try:
            driver = self.get_driver()
            async with driver.session() as session:
                result = await session.run(cypher, **params)
                records = await result.data()
                return records
        except Exception as e:
            logger.error(f"Neo4j query failed: {e} | Query: {cypher}")
            return []

    async def initialize_schema(self):
        logger.info("Initializing Neo4j schema constraints and indexes...")
        for query in SCHEMA_QUERIES:
            await self.run_query(query)

    async def upsert_volunteer_location(
        self,
        volunteer_id: str,
        ngo_id: str | None,
        lat: float | None,
        lng: float | None,
        share_location: bool,
    ) -> None:
        await self.run_query(
            """
            MERGE (v:Volunteer {id: $volunteer_id})
            SET v.ngo_id = $ngo_id,
                v.lat = $lat,
                v.lng = $lng,
                v.share_location = $share_location,
                v.availabilityStatus = CASE WHEN $share_location THEN coalesce(v.availabilityStatus, 'ACTIVE') ELSE 'OFFLINE' END,
                v.updated_at = datetime()
            """,
            {
                "volunteer_id": volunteer_id,
                "ngo_id": ngo_id,
                "lat": lat,
                "lng": lng,
                "share_location": share_location,
            },
        )

    async def upsert_task_node(
        self,
        task_id: str,
        ngo_id: str | None,
        title: str,
        required_skills: list[str],
        urgency: float,
        status: str,
        lat: float | None,
        lng: float | None,
    ) -> None:
        await self.run_query(
            """
            MERGE (t:Task {id: $task_id})
            SET t.ngo_id = $ngo_id,
                t.title = $title,
                t.requiredSkills = $required_skills,
                t.urgency = $urgency,
                t.status = $status,
                t.lat = $lat,
                t.lng = $lng,
                t.updated_at = datetime()
            """,
            {
                "task_id": task_id,
                "ngo_id": ngo_id,
                "title": title,
                "required_skills": required_skills,
                "urgency": urgency,
                "status": status,
                "lat": lat,
                "lng": lng,
            },
        )

    async def upsert_assignment_edge(
        self,
        volunteer_id: str,
        task_id: str,
        assignment_id: str,
    ) -> None:
        await self.run_query(
            """
            MERGE (v:Volunteer {id: $volunteer_id})
            MERGE (t:Task {id: $task_id})
            MERGE (v)-[a:ASSIGNED_TO {assignment_id: $assignment_id}]->(t)
            SET a.updated_at = datetime()
            """,
            {
                "volunteer_id": volunteer_id,
                "task_id": task_id,
                "assignment_id": assignment_id,
            },
        )

    async def upsert_volunteer(
        self,
        volunteer_id: str,
        ngo_id: str | None,
        name: str | None,
        skills: list[str],
    ) -> None:
        """Mirror a volunteer and their skills into the graph.

        Without the HAS_SKILL edges written here, the skill-coverage analytics
        always reported a supply of zero.
        """
        await self.run_query(
            """
            MERGE (v:Volunteer {id: $volunteer_id})
            SET v.ngo_id = $ngo_id,
                v.name = coalesce($name, v.name),
                v.availabilityStatus = coalesce(v.availabilityStatus, 'ACTIVE'),
                v.updated_at = datetime()
            WITH v
            OPTIONAL MATCH (v)-[old:HAS_SKILL]->(:Skill)
            DELETE old
            WITH v
            UNWIND $skills AS skill_name
            MERGE (s:Skill {name: skill_name})
            MERGE (v)-[:HAS_SKILL]->(s)
            """,
            {
                "volunteer_id": volunteer_id,
                "ngo_id": ngo_id,
                "name": name,
                # UNWIND over an empty list is a no-op, which is what we want
                # for a volunteer who has not listed any skills yet.
                "skills": [s for s in skills if s and s.strip()],
            },
        )

    async def record_completion(self, volunteer_id: str, rating: float | None = None) -> None:
        """Bump the counters the volunteer-activity analytics reads."""
        await self.run_query(
            """
            MERGE (v:Volunteer {id: $volunteer_id})
            SET v.totalTasksCompleted = coalesce(v.totalTasksCompleted, 0) + 1,
                v.totalXP = coalesce(v.totalXP, 0) + 50,
                v.reputationScore = CASE
                    WHEN $rating IS NULL THEN coalesce(v.reputationScore, 50)
                    ELSE (coalesce(v.reputationScore, 50) * 0.8) + ($rating * 20 * 0.2)
                END,
                v.updated_at = datetime()
            """,
            {"volunteer_id": volunteer_id, "rating": rating},
        )


neo4j_service = Neo4jService()
