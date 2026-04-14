import numpy as np
import math
from scipy.optimize import linear_sum_assignment
from services.neo4j_service import neo4j_service
from services.firebase_service import firebase_service
from firebase_admin import firestore
import logging

logger = logging.getLogger(__name__)

def haversine(lat1, lon1, lat2, lon2):
    """Calculate the great circle distance in kilometers between two points."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

async def compute_optimal_matches() -> dict:
    """Uses Hungarian Algorithm to match available volunteers to open tasks/needs.
    Considers skills, distance, and reputation.
    """
    try:
        # 1. Fetch data with skills and locations
        vols = await neo4j_service.run_query(
            "MATCH (v:Volunteer {availabilityStatus: 'ACTIVE'}) OPTIONAL MATCH (v)-[:HAS_SKILL]->(s:Skill) RETURN v, collect(s.name) as skills"
        )
        needs = await neo4j_service.run_query(
            "MATCH (n:Need {status: 'PENDING'}) MATCH (n)-[:LOCATED_IN]->(l:Location) OPTIONAL MATCH (n)-[:REQUIRES_SKILL]->(s:Skill) RETURN n, l, collect(s.name) as required_skills"
        )
        
        if not vols or not needs:
            return {"matches": [], "message": "Insufficient active volunteers or pending needs"}
            
        n_vols = len(vols)
        n_needs = len(needs)
        
        # 2. Build cost matrix
        cost_matrix = np.zeros((n_vols, n_needs))
        
        for i, v_rec in enumerate(vols):
            v = v_rec["v"]
            v_skills = v_rec["skills"]
            v_lat = v.get("lat", 28.6139) # Default to Delhi if missing
            v_lng = v.get("lng", 77.2090)
            
            for j, n_rec in enumerate(needs):
                n = n_rec["n"]
                l = n_rec["l"]
                n_skills = n_rec["required_skills"]
                n_lat = l.get("lat", 28.6139)
                n_lng = l.get("lng", 77.2090)
                
                # Base cost
                cost = 100.0
                
                # 1. Skill Match (Penalty if missing required skills)
                if n_skills:
                    matches = set(v_skills).intersection(set(n_skills))
                    match_ratio = len(matches) / len(n_skills)
                    cost -= match_ratio * 40.0
                
                # 2. Distance Penalty (km)
                dist = haversine(v_lat, v_lng, n_lat, n_lng)
                cost += dist * 2.0 # 2 points per km
                
                # 3. Reputation Bonus
                rep = v.get("reputation_score", 50)
                cost -= rep * 0.1
                
                cost_matrix[i][j] = max(cost, 0.0)
                
        # 3. Optimization
        row_ind, col_ind = linear_sum_assignment(cost_matrix)
        
        matches = []
        for i, j in zip(row_ind, col_ind):
            # Only match if the cost isn't prohibitively high (e.g., > 150)
            if cost_matrix[i][j] < 150:
                matches.append({
                    "volunteer_id": vols[i]["v"].get("id"),
                    "volunteer_name": vols[i]["v"].get("name"),
                    "need_id": needs[j]["n"].get("id"),
                    "score": round(100 - cost_matrix[i][j], 1)
                })
            
        return {"matches": matches}
        
    except Exception as e:
        logger.error(f"Matching failed: {e}")
        return {"matches": [], "error": str(e)}

async def perform_auto_assignment():
    """Triggered on new need creation to run matching and update statuses."""
    result = await compute_optimal_matches()
    matches = result.get("matches", [])
    
    for match in matches:
        v_id = match["volunteer_id"]
        n_id = match["need_id"]
        
        try:
            # 1. Update Neo4j
            await neo4j_service.run_query(
                """
                MATCH (v:Volunteer {id: $vid}), (n:Need {id: $nid})
                SET n.status = 'CLAIMED'
                SET v.availabilityStatus = 'BUSY'
                MERGE (v)-[:ASSIGNED_TO]->(n)
                """,
                vid=v_id, nid=n_id
            )
            
            # 2. Update Firestore (Task status)
            # This assumes create_task_from_need has already run
            firebase_service.db.collection("tasks").document(n_id).update({
                "status": "CLAIMED",
                "claimedBy": v_id,
                "claimedAt": firestore.SERVER_TIMESTAMP
            })
            
            # 3. Notify Volunteer
            firebase_service.add_notification(
                title="New Assignment",
                message=f"You have been auto-assigned to a high-priority task (ID: {n_id}). See dashboard for details.",
                n_type="SUCCESS"
            )
            
            logger.info(f"Auto-assigned volunteer {v_id} to need {n_id}")
            
        except Exception as e:
            logger.error(f"Failed to commit assignment for {n_id}: {e}")
