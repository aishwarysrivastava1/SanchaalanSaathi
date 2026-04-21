import os
import logging
from neo4j import AsyncGraphDatabase

logger = logging.getLogger(__name__)

_LOG_LEVELS = {
    "DEBUG": logging.DEBUG,
    "INFO": logging.INFO,
    "WARNING": logging.WARNING,
    "ERROR": logging.ERROR,
    "CRITICAL": logging.CRITICAL,
}
_NOTIFICATION_LEVEL = os.getenv("NEO4J_NOTIFICATIONS_LOG_LEVEL", "WARNING").upper()
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
            uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
            user = os.getenv("NEO4J_USER", "neo4j")
            password = os.getenv("NEO4J_PASSWORD", "testpassword")
            self._driver = AsyncGraphDatabase.driver(uri, auth=(user, password))
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

neo4j_service = Neo4jService()
