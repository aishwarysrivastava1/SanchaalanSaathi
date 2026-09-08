"""Natural language to Cypher, via Gemini.

Generated queries are forced to be scoped to the caller's ngo_id, rejected
if they contain writes, and given a LIMIT if the model omitted one.
"""
from __future__ import annotations

import logging
import re

from app.core.config import settings
from app.integrations.neo4j import neo4j_service

logger = logging.getLogger(__name__)

SCHEMA_CONTEXT = """
Graph Schema — Sanchaalan Saathi Knowledge Graph:

Node Labels and Properties:
- Location: {id, name, ward, lat, lng, point}
- Need: {id, type, sub_type, description, urgency_score, population_affected, status, reported_at}
  type values: infrastructure | water_sanitation | medical | food | shelter | safety
  status values: PENDING | CLAIMED | VERIFIED
- Skill: {name, category}
  category values: medical | technical | logistics | education | construction
- Volunteer: {id, name, phone, reputationScore, availabilityStatus, totalXP, totalTasksCompleted}
  availabilityStatus values: ACTIVE | BUSY | OFFLINE
- Task: {id, title, status}

Relationship Types:
- (Need)-[:LOCATED_IN]->(Location)
- (Need)-[:REQUIRES_SKILL]->(Skill)
- (Need)-[:CAUSED_BY]->(Need)         ← causal chain edges
- (Need)-[:SPAWNED_TASK]->(Task)
- (Volunteer)-[:LOCATED_IN]->(Location)
- (Volunteer)-[:HAS_SKILL]->(Skill)
- (Volunteer)-[:ASSIGNED_TO]->(Need)

Rules for generating Cypher:
1. Output ONLY a raw Cypher query string — no markdown, no explanation, no ```cypher blocks.
2. ALWAYS LIMIT results to 20 unless the user asks for more.
3. Use OPTIONAL MATCH for relationships that might not exist.
4. Never use WRITE operations (CREATE, MERGE, SET, DELETE) — read-only queries only.
5. Property names are case-sensitive: use `availabilityStatus` (camelCase) not `availability_status`.
6. EVERY match on Need, Volunteer or Task MUST filter on the ngo_id supplied in
   the question context. Never return nodes belonging to another ngo_id.
"""

PROMPT = """You are a Cypher query generator for a Neo4j graph database.

Schema:
{schema}

User Question: {question}

Generate a Cypher query that answers the question. Return ONLY the raw Cypher query string, nothing else."""

# Dangerous keywords that must never appear in generated Cypher
WRITE_KEYWORDS = re.compile(
    r"\b(CREATE|MERGE|SET|DELETE|REMOVE|DROP|DETACH|CALL\s+apoc\.periodic|LOAD\s+CSV)\b",
    re.IGNORECASE
)


async def text_to_cypher(question: str, *, ngo_id: str | None = None) -> dict:
    if not settings.gemini_key:
        return {"error": "The assistant is not configured on this deployment.", "cypher": None, "results": []}

    try:
        import google.generativeai as genai

        scoped_question = question
        if ngo_id:
            scoped_question = (
                question
                + "\n\n[Context: restrict every match to ngo_id = "
                + repr(ngo_id)
                + "]"
            )
        model = genai.GenerativeModel(
            "gemini-2.5-flash",
            generation_config=genai.GenerationConfig(temperature=0),
        )
        response = await model.generate_content_async(
            PROMPT.format(schema=SCHEMA_CONTEXT, question=scoped_question)
        )
        cypher = (response.text or "").strip()

        # Strip any markdown code fences
        for prefix in ("```cypher", "```"):
            if cypher.startswith(prefix):
                cypher = cypher[len(prefix):]
        if cypher.endswith("```"):
            cypher = cypher[:-3]
        cypher = cypher.strip()

        if WRITE_KEYWORDS.search(cypher):
            return {"error": "Query contains write operations - not permitted.", "cypher": cypher, "results": []}

        # An unbounded traversal on a shared Aura instance is a denial of
        # service waiting to happen, so require an explicit LIMIT.
        if not re.search(r"LIMIT", cypher, re.IGNORECASE):
            cypher = f"{cypher} LIMIT 20"

        if ngo_id and "ngo_id" not in cypher:
            return {
                "error": "Generated query was not scoped to your organisation - refused.",
                "cypher": cypher,
                "results": [],
            }

        # Execute cypher
        results = await neo4j_service.run_query(cypher)
        return {"cypher": cypher, "results": results}

    except Exception as e:
        logger.error(f"Text to cypher failed: {e}")
        return {"error": str(e), "cypher": None, "results": []}
