from services.neo4j_service import neo4j_service
from services.firebase_service import firebase_service
import uuid
import logging

logger = logging.getLogger(__name__)

async def write_extraction_to_graph(extraction: dict) -> str:
    """Takes Gemini output, creates all nodes and edges in Neo4j, returns the generated need_id."""
    if "error" in extraction and extraction["error"]:
        logger.error(f"Extraction error: {extraction['error']}")
        return ""
        
    nodes = extraction.get("nodes", [])
    edges = extraction.get("edges", [])
    
    need_node = next((n for n in nodes if n["label"] == "Need"), None)
    if not need_node:
        return ""
        
    need_id = f"n_{uuid.uuid4().hex[:12]}"
    driver = neo4j_service.get_driver()
    
    try:
        async with driver.session() as session:
            # Create Need
            props = need_node.get("properties", {})
            await session.run(
                """
                CREATE (n:Need {
                    id: $id, type: $type, sub_type: $sub_type, 
                    description: $desc, urgency_score: $urg, 
                    population_affected: $pop, status: 'PENDING', 
                    reported_at: datetime()
                }) RETURN n
                """,
                id=need_id,
                type=props.get("type", "unknown"),
                sub_type=props.get("sub_type", ""),
                desc=props.get("description", ""),
                urg=props.get("urgency_score", 0.5),
                pop=props.get("population_affected", 1)
            )

            # Node indices map
            idx_map = {}
            for i, node in enumerate(nodes):
                if node["label"] == "Need":
                    idx_map[i] = {"id": need_id, "label": "Need"}
                elif node["label"] == "Location":
                    l_id = f"l_{uuid.uuid4().hex[:12]}"
                    lp = node.get("properties", {})
                    lat = lp.get("lat") or 0.0
                    lng = lp.get("lng") or 0.0
                    name = lp.get("name", "Unknown Area")
                    
                    await session.run(
                        """
                        MERGE (l:Location {name: $name})
                        ON CREATE SET l.id = $id, l.ward = $ward, l.lat = $lat, l.lng = $lng,
                        l.point = point({latitude: $lat, longitude: $lng})
                        """,
                        name=name, id=l_id, ward=lp.get("ward", ""), lat=lat, lng=lng
                    )
                    idx_map[i] = {"name": name, "label": "Location"}
                
                elif node["label"] == "Skill":
                    sp = node.get("properties", {})
                    name = sp.get("name", "general")
                    await session.run(
                        """
                        MERGE (s:Skill {name: $name})
                        ON CREATE SET s.category = $cat
                        """,
                        name=name, cat=sp.get("category", "general")
                    )
                    idx_map[i] = {"name": name, "label": "Skill"}

            # Edges
            for edge in edges:
                 from_idx = edge.get("from_index")
                 to_idx = edge.get("to_index")
                 e_type = edge.get("type")
                 
                 f_node = idx_map.get(from_idx)
                 t_node = idx_map.get(to_idx)
                 
                 if f_node and t_node:
                     if f_node["label"] == "Need" and t_node["label"] == "Location":
                         await session.run(
                             "MATCH (n:Need {id: $nid}), (l:Location {name: $lname}) MERGE (n)-[:LOCATED_IN]->(l)",
                             nid=f_node["id"], lname=t_node["name"]
                         )
                     elif f_node["label"] == "Need" and t_node["label"] == "Skill":
                          await session.run(
                             "MATCH (n:Need {id: $nid}), (s:Skill {name: $sname}) MERGE (n)-[:REQUIRES_SKILL]->(s)",
                             nid=f_node["id"], sname=t_node["name"]
                         )
                     # Handle other causal edges if generated in advanced queries

            # In a real app we'd also push real-time to Firestore.
            firebase_service.add_notification(
                title="New Emergency Reported",
                message=f"A new {props.get('type', 'emergency')} has been reported. Severity: {props.get('urgency_score', 0.5)*10}/10",
                n_type="URGENT" if props.get('urgency_score', 0.5) > 0.7 else "INFO"
            )
            
            loc_idx = next((i for i, n in enumerate(nodes) if n["label"] == "Location"), -1)
            loc_node = nodes[loc_idx] if loc_idx != -1 else {}
            lp = loc_node.get("properties", {})
            
            # Create a task in Firestore for tracking
            firebase_service.create_task_from_need(need_id, {
                "type": props.get("type", "unknown"),
                "description": props.get("description", ""),
                "urgency_score": props.get("urgency_score", 0.5),
                "lat": lp.get("lat", 0.0),
                "lng": lp.get("lng", 0.0),
                "location_name": lp.get("name", "Unknown Area")
            })
            
        return need_id
    except Exception as e:
        logger.error(f"Graph writer error: {e}")
        return ""
