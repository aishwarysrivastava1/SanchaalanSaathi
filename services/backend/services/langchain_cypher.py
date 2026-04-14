import os
import re
import logging
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import PromptTemplate
from services.neo4j_service import neo4j_service

logger = logging.getLogger(__name__)

SCHEMA_CONTEXT = """
Nodes:
- Location: {id, name, ward, lat, lng, point}
- Need: {id, type, sub_type, description, urgency_score, population_affected, status, reported_at}
- Skill: {name, category}
- Volunteer: {id, name, phone, reputation_score, availability_status, current_active_tasks, total_tasks_completed, total_xp}
- Task: {id, title, status}

Edges:
- (Need)-[:LOCATED_IN]->(Location)
- (Need)-[:REQUIRES_SKILL]->(Skill)
- (Need)-[:CAUSED_BY]->(Need)
- (Need)-[:SPAWNED_TASK]->(Task)
- (Volunteer)-[:LOCATED_IN]->(Location)
- (Volunteer)-[:HAS_SKILL]->(Skill)
- (Volunteer)-[:CLAIMED]->(Task)

Rules:
Return ONLY valid cypher. Do not wrap in ```cypher blocks. Just the raw string.
Limit results to 10 unless specified.
"""

prompt = PromptTemplate(
    input_variables=["question", "schema"],
    template="""Translate this natural language query into Cypher based on the schema.
    
    Schema:
    {schema}
    
    Question: {question}
    Cypher Query:"""
)

async def text_to_cypher(question: str) -> dict:
    try:
        llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", temperature=0)
        formatted_prompt = prompt.format(schema=SCHEMA_CONTEXT, question=question)
        
        response = llm.invoke(formatted_prompt)
        cypher = response.content.strip()
        
        if cypher.startswith("```cypher"):
             cypher = cypher[9:-3].strip()
        elif cypher.startswith("```"):
             cypher = cypher[3:-3].strip()
             
        # Execute cypher
        results = await neo4j_service.run_query(cypher)
        return {"cypher": cypher, "results": results}
        
    except Exception as e:
        logger.error(f"Text to cypher failed: {e}")
        return {"error": str(e), "cypher": None, "results": []}
