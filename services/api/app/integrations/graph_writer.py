"""Persist Gemini-extracted entities into Neo4j and mirror them to Firestore."""
from __future__ import annotations

import logging
import uuid

from app.integrations.firebase import firebase_service
from app.integrations.neo4j import neo4j_service

logger = logging.getLogger(__name__)

EDGE_QUERIES = {
    ("LOCATED_IN", "Need", "Location"): (
        "MATCH (n:Need {id: $from_key}), (l:Location {name: $to_key}) "
        "MERGE (n)-[:LOCATED_IN]->(l)"
    ),
    ("REQUIRES_SKILL", "Need", "Skill"): (
        "MATCH (n:Need {id: $from_key}), (s:Skill {name: $to_key}) "
        "MERGE (n)-[:REQUIRES_SKILL]->(s)"
    ),
    ("CAUSED_BY", "Need", "Need"): (
        "MATCH (a:Need {id: $from_key}), (b:Need {id: $to_key}) "
        "MERGE (a)-[:CAUSED_BY]->(b)"
    ),
    ("AFFECTS", "Need", "Location"): (
        "MATCH (n:Need {id: $from_key}), (l:Location {name: $to_key}) "
        "MERGE (n)-[:AFFECTS]->(l)"
    ),
}

CREATE_NEED = """
MERGE (n:Need {id: $id})
SET n.ngo_id = $ngo_id,
    n.type = $type,
    n.sub_type = $sub_type,
    n.description = $description,
    n.urgency_score = $urgency_score,
    n.population_affected = $population_affected,
    n.status = 'PENDING',
    n.reported_at = datetime()
"""

MERGE_LOCATION = """
MERGE (l:Location {name: $name})
ON CREATE SET l.id = $id,
              l.ward = $ward,
              l.lat = $lat,
              l.lng = $lng,
              l.point = point({latitude: $lat, longitude: $lng})
"""

MERGE_SKILL = "MERGE (s:Skill {name: $name}) ON CREATE SET s.category = $category"


def _node_key(node: dict) -> str | None:
    return node.get("id") or node.get("name")


async def write_extraction_to_graph(
    extraction: dict,
    *,
    ngo_id: str,
    override_coords: tuple[float, float] | None = None,
) -> str:
    """Create the Need, its Locations and Skills, and the edges between them.

    Returns the new need id, or "" if the extraction held no Need.
    """
    if extraction.get("error"):
        logger.warning("Skipping graph write, extraction failed: %s", extraction["error"])
        return ""

    nodes = extraction.get("nodes") or []
    need_node = next((n for n in nodes if n.get("label") == "Need"), None)
    if need_node is None:
        return ""

    need_id = f"n_{uuid.uuid4().hex[:12]}"
    props = need_node.get("properties") or {}
    urgency = float(props.get("urgency_score") or 0.5)
    need_type = props.get("type") or "unknown"

    location_name = "Unknown Area"
    lat = lng = 0.0

    try:
        driver = neo4j_service.get_driver()
        async with driver.session() as session:
            await session.run(
                CREATE_NEED,
                id=need_id,
                ngo_id=ngo_id,
                type=need_type,
                sub_type=props.get("sub_type", ""),
                description=props.get("description", ""),
                urgency_score=urgency,
                population_affected=int(props.get("population_affected") or 1),
            )

            index_map: dict[int, dict] = {}

            for index, node in enumerate(nodes):
                label = node.get("label")
                node_props = node.get("properties") or {}

                if label == "Need":
                    index_map[index] = {"id": need_id, "label": "Need"}

                elif label == "Location":
                    lat = node_props.get("lat") or 0.0
                    lng = node_props.get("lng") or 0.0
                    if override_coords and not (lat or lng):
                        lat, lng = override_coords
                    location_name = node_props.get("name") or "Unknown Area"
                    await session.run(
                        MERGE_LOCATION,
                        name=location_name,
                        id=f"l_{uuid.uuid4().hex[:12]}",
                        ward=node_props.get("ward", ""),
                        lat=lat,
                        lng=lng,
                    )
                    index_map[index] = {"name": location_name, "label": "Location"}

                elif label == "Skill":
                    name = node_props.get("name") or "general"
                    await session.run(
                        MERGE_SKILL, name=name, category=node_props.get("category", "general")
                    )
                    index_map[index] = {"name": name, "label": "Skill"}

            for edge in extraction.get("edges") or []:
                source = index_map.get(edge.get("from_index"))
                target = index_map.get(edge.get("to_index"))
                if not source or not target:
                    continue

                query = EDGE_QUERIES.get((edge.get("type"), source["label"], target["label"]))
                from_key, to_key = _node_key(source), _node_key(target)
                if not query or not from_key or not to_key:
                    continue

                await session.run(query, from_key=from_key, to_key=to_key)
    except Exception as exc:
        logger.error("Graph write failed for need %s: %s", need_id, exc)
        return ""

    payload = {
        "ngo_id": ngo_id,
        "type": need_type,
        "sub_type": props.get("sub_type", ""),
        "description": props.get("description", ""),
        "urgency_score": urgency,
        "population_affected": int(props.get("population_affected") or 1),
        "lat": lat,
        "lng": lng,
        "location_name": location_name,
    }

    try:
        firebase_service.sync_need_to_firestore(need_id, payload)
        firebase_service.create_task_from_need(need_id, payload)
        firebase_service.add_notification(
            title="New Emergency Reported",
            message=(
                f"A new {need_type} need reported in {location_name}. "
                f"Severity: {urgency * 10:.1f}/10"
            ),
            n_type="URGENT" if urgency > 0.7 else "INFO",
            ngo_id=ngo_id,
        )
        firebase_service.log_activity(
            event_type="NEED_REPORTED",
            title=f"New {need_type.title()} Need",
            description=payload["description"][:120],
            metadata={"need_id": need_id, "urgency_score": urgency, "location": location_name},
            ngo_id=ngo_id,
        )
    except Exception as exc:
        logger.warning("Firestore mirror failed for need %s: %s", need_id, exc)

    return need_id
