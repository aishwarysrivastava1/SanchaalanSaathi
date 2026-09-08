"""Intelligence API: chatbot, knowledge graph, analytics, ingest and simulation.

Grouped into one service because they share the same external dependencies
(Gemini, Neo4j, Firebase) and the same failure mode, a slow external call.
Isolating them keeps an LLM stall from starving task assignment.
"""
from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, File, Query, Request, Response, UploadFile
from fastapi.responses import StreamingResponse

from app.core.config import settings
from app.core.deps import AdminUser, AnyUser, DbSession, GuestId, MaybeUser
from app.core.errors import BadRequest
from app.core.ratelimit import limiter
from app.schemas import (
    ChatRequest,
    GraphAskRequest,
    IngestTextRequest,
    SimulationRequest,
)

logger = logging.getLogger(__name__)

chat_router = APIRouter(prefix="/api/chatbot", tags=["intelligence"])
graph_router = APIRouter(prefix="/api/graph", tags=["intelligence"])
analytics_router = APIRouter(prefix="/api/analytics", tags=["intelligence"])
ingest_router = APIRouter(prefix="/api/ingest", tags=["intelligence"])
voice_router = APIRouter(prefix="/api/voice", tags=["intelligence"])
sim_router = APIRouter(prefix="/api/sim", tags=["intelligence"])

chat_limit = limiter(
    "chat", limit=settings.chatbot_requests_per_minute_per_user, window_seconds=60, by="user"
)
ingest_limit = limiter("ingest", limit=20, window_seconds=60, by="user")
MAX_UPLOAD_BYTES = 5 * 1024 * 1024


# ── Chatbot ───────────────────────────────────────────────────────────────────

@chat_router.post("", dependencies=[Depends(chat_limit)])
@chat_router.post("/", dependencies=[Depends(chat_limit)])
async def chat(data: ChatRequest, guest_id: GuestId, user: MaybeUser) -> StreamingResponse:
    """Server-Sent Events stream of the assistant's reply."""
    from app.domain.chatbot import ChatPipeline

    identifier = user.user_id if user else guest_id
    pipeline = ChatPipeline(identifier=identifier, is_guest=user is None, user=user)

    live_context = ""
    if user is not None:
        live_context = (
            f"Signed-in user role: {user.role}. NGO id: {user.ngo_id or 'not set up yet'}."
        )

    return StreamingResponse(
        pipeline.run(
            data.message,
            live_context=live_context,
            image_b64=data.imageBase64,
            image_mime=data.imageMimeType,
            context_tags=list(data.context.keys())[:10],
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            # Tell nginx/Railway's proxy not to buffer, or the stream arrives
            # all at once at the end and the typing effect is lost.
            "X-Accel-Buffering": "no",
        },
    )


# ── Knowledge graph ───────────────────────────────────────────────────────────

@graph_router.get("/stats")
async def graph_stats(user: AnyUser) -> dict:
    from app.integrations.neo4j import neo4j_service

    rows = await neo4j_service.run_query(
        """
        MATCH (n:Need {ngo_id: $ngo_id})
        WITH count(n) AS total_needs,
             count(CASE WHEN n.status = 'PENDING' THEN 1 END) AS pending_needs,
             count(CASE WHEN n.status IN ['CLAIMED','VERIFIED'] THEN 1 END) AS addressed
        OPTIONAL MATCH (v:Volunteer {ngo_id: $ngo_id})
        WITH total_needs, pending_needs, addressed, count(v) AS total_volunteers
        OPTIONAL MATCH (v2:Volunteer {ngo_id: $ngo_id, availabilityStatus: 'ACTIVE'})
        RETURN total_needs, pending_needs, total_volunteers,
               count(v2) AS active_volunteers,
               CASE WHEN total_needs > 0
                    THEN round((toFloat(addressed) / total_needs) * 100)
                    ELSE 0 END AS coverage_pct
        """,
        {"ngo_id": user.ngo_id},
    )
    return rows[0] if rows else {}


@graph_router.get("/needs")
async def graph_needs(
    user: AnyUser,
    status: Annotated[str | None, Query(max_length=40)] = None,
    type: Annotated[str | None, Query(max_length=60)] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> dict:
    from app.integrations.neo4j import neo4j_service

    clauses = ["n.ngo_id = $ngo_id"]
    params: dict = {"ngo_id": user.ngo_id, "limit": limit}
    if status:
        clauses.append("n.status = $status")
        params["status"] = status
    if type:
        clauses.append("n.type = $type")
        params["type"] = type

    cypher = (
        "MATCH (n:Need)-[:LOCATED_IN]->(l:Location) "
        f"WHERE {' AND '.join(clauses)} "
        "RETURN n, l ORDER BY n.urgency_score DESC LIMIT $limit"
    )
    return {"needs": await neo4j_service.run_query(cypher, params)}


@graph_router.get("/volunteers")
async def graph_volunteers(
    user: AnyUser, limit: Annotated[int, Query(ge=1, le=200)] = 50
) -> dict:
    from app.integrations.neo4j import neo4j_service

    return {
        "volunteers": await neo4j_service.run_query(
            "MATCH (v:Volunteer {ngo_id: $ngo_id}) RETURN v LIMIT $limit",
            {"ngo_id": user.ngo_id, "limit": limit},
        )
    }


@graph_router.get("/tasks")
async def graph_tasks(user: AnyUser, limit: Annotated[int, Query(ge=1, le=200)] = 50) -> dict:
    from app.integrations.neo4j import neo4j_service

    return {
        "tasks": await neo4j_service.run_query(
            "MATCH (t:Task {ngo_id: $ngo_id}) RETURN t LIMIT $limit",
            {"ngo_id": user.ngo_id, "limit": limit},
        )
    }


@graph_router.get("/hotspots")
async def graph_hotspots(user: AnyUser) -> dict:
    from app.integrations.neo4j import neo4j_service

    return {
        "hotspots": await neo4j_service.run_query(
            "MATCH (n:Need {ngo_id: $ngo_id})-[:LOCATED_IN]->(l:Location) "
            "RETURN l.name AS location, count(n) AS need_count "
            "ORDER BY need_count DESC LIMIT 10",
            {"ngo_id": user.ngo_id},
        )
    }


@graph_router.get("/causal-chain")
async def graph_causal_chain(
    user: AnyUser,
    node_id: Annotated[str, Query(min_length=1, max_length=64)],
    depth: Annotated[int, Query(ge=1, le=5)] = 3,
) -> dict:
    from app.integrations.neo4j import neo4j_service

    # Neo4j will not accept a parameter inside a variable-length bound, so the
    # Django form `[*1..$depth]` was a syntax error and this endpoint always
    # returned []. `depth` is an int validated to 1-5 by FastAPI before it is
    # interpolated, so there is no injection surface here.
    cypher = (
        f"MATCH path = (n {{id: $node_id}})-[*1..{depth}]-() "
        "RETURN path LIMIT 20"
    )
    return {"chain": await neo4j_service.run_query(cypher, {"node_id": node_id})}


@graph_router.post("/ask")
async def graph_ask(data: GraphAskRequest, user: AnyUser) -> dict:
    from app.integrations.cypher import text_to_cypher

    result = await text_to_cypher(data.question, ngo_id=user.ngo_id)
    if result.get("error"):
        raise BadRequest(result["error"])
    return result


@graph_router.post("/seed")
async def seed_graph_schema(user: AdminUser) -> dict:
    from app.integrations.neo4j import neo4j_service

    await neo4j_service.initialize_schema()
    return {"message": "Graph schema initialized"}


# ── Analytics ─────────────────────────────────────────────────────────────────

@analytics_router.get("/ngo-overview")
async def ngo_overview(session: DbSession, user: AdminUser) -> dict:
    from sqlalchemy import func, select

    from app.models import Assignment, Task, VolunteerProfile

    tasks = (
        await session.execute(
            select(
                func.count(Task.id),
                func.count(Task.id).filter(Task.status == "open"),
                func.count(Task.id).filter(Task.status == "in_progress"),
                func.count(Task.id).filter(Task.status == "completed"),
            ).where(Task.ngo_id == user.ngo_id)
        )
    ).one()
    volunteers = (
        await session.execute(
            select(
                func.count(VolunteerProfile.id),
                func.count(VolunteerProfile.id).filter(VolunteerProfile.status == "active"),
            ).where(VolunteerProfile.ngo_id == user.ngo_id)
        )
    ).one()
    assignments = (
        await session.execute(
            select(
                func.count(Assignment.id),
                func.count(Assignment.id).filter(Assignment.status == "completed"),
                func.avg(Assignment.match_score),
            ).where(Assignment.ngo_id == user.ngo_id)
        )
    ).one()

    return {
        "tasks": {
            "total": tasks[0],
            "open": tasks[1],
            "in_progress": tasks[2],
            "completed": tasks[3],
            "completion_rate_pct": round(tasks[3] / max(tasks[0], 1) * 100, 1),
        },
        "volunteers": {
            "total": volunteers[0],
            "active": volunteers[1],
            "utilization_pct": round(volunteers[1] / max(volunteers[0], 1) * 100, 1),
        },
        "assignments": {
            "total": assignments[0],
            "completed": assignments[1],
            "avg_match_score": round(float(assignments[2] or 0), 3),
        },
    }


@analytics_router.get("/skill-gaps")
async def skill_gaps(session: DbSession, user: AdminUser) -> dict:
    from collections import Counter

    from sqlalchemy import select

    from app.models import Task, VolunteerProfile

    supply: Counter = Counter()
    for skills in (
        await session.scalars(
            select(VolunteerProfile.skills).where(
                VolunteerProfile.ngo_id == user.ngo_id, VolunteerProfile.status == "active"
            )
        )
    ).all():
        for skill in skills or []:
            supply[skill.lower()] += 1

    demand: Counter = Counter()
    for skills in (
        await session.scalars(
            select(Task.required_skills).where(
                Task.ngo_id == user.ngo_id, Task.status.in_(("open", "in_progress"))
            )
        )
    ).all():
        for skill in skills or []:
            demand[skill.lower()] += 1

    gaps = [
        {
            "skill": skill,
            "demand": count,
            "supply": supply.get(skill, 0),
            "gap": max(0, count - supply.get(skill, 0)),
        }
        for skill, count in demand.most_common(20)
    ]
    return {"gaps": gaps}


@analytics_router.get("/leaderboard")
async def leaderboard(
    session: DbSession, user: AdminUser, limit: Annotated[int, Query(ge=1, le=50)] = 10
) -> dict:
    from sqlalchemy import func, select

    from app.models import Assignment, User, VolunteerProfile

    rows = (
        await session.execute(
            select(
                Assignment.volunteer_id,
                func.count(Assignment.id).label("completed"),
                func.avg(Assignment.match_score),
                func.avg(Assignment.completion_rating),
                func.coalesce(func.sum(Assignment.hours_spent), 0.0),
            )
            .where(Assignment.ngo_id == user.ngo_id, Assignment.status == "completed")
            .group_by(Assignment.volunteer_id)
            .order_by(func.count(Assignment.id).desc())
            .limit(limit)
        )
    ).all()
    if not rows:
        return {"leaderboard": []}

    ids = [r[0] for r in rows]
    names = {
        uid: (full_name or email.split("@")[0])
        for uid, full_name, email in (
            await session.execute(
                select(User.id, User.full_name, User.email).where(User.id.in_(ids))
            )
        ).all()
    }
    profile_names = {
        uid: name
        for uid, name in (
            await session.execute(
                select(VolunteerProfile.user_id, VolunteerProfile.full_name).where(
                    VolunteerProfile.user_id.in_(ids)
                )
            )
        ).all()
        if name
    }

    return {
        "leaderboard": [
            {
                "rank": index,
                "volunteer_id": vid,
                "name": profile_names.get(vid) or names.get(vid, vid),
                "completed_tasks": completed,
                "avg_match_score": round(float(avg_match or 0), 3),
                "avg_rating": round(float(avg_rating or 0), 2),
                "hours_contributed": round(float(hours or 0), 1),
            }
            for index, (vid, completed, avg_match, avg_rating, hours) in enumerate(rows, 1)
        ]
    }


@analytics_router.get("/urgency-distribution")
async def urgency_distribution(user: AdminUser) -> dict:
    from app.integrations.neo4j import neo4j_service

    rows = await neo4j_service.run_query(
        """
        MATCH (n:Need {ngo_id: $ngo_id})
        RETURN count(CASE WHEN n.urgency_score < 0.3 THEN 1 END) AS low,
               count(CASE WHEN n.urgency_score >= 0.3 AND n.urgency_score < 0.6 THEN 1 END) AS medium,
               count(CASE WHEN n.urgency_score >= 0.6 AND n.urgency_score < 0.8 THEN 1 END) AS high,
               count(CASE WHEN n.urgency_score >= 0.8 THEN 1 END) AS critical
        """,
        {"ngo_id": user.ngo_id},
    )
    return rows[0] if rows else {"low": 0, "medium": 0, "high": 0, "critical": 0}


@analytics_router.get("/skill-coverage")
async def skill_coverage(user: AdminUser) -> dict:
    from app.integrations.neo4j import neo4j_service

    demanded = await neo4j_service.run_query(
        "MATCH (n:Need {ngo_id: $ngo_id, status: 'PENDING'})-[:REQUIRES_SKILL]->(s:Skill) "
        "RETURN s.name AS skill, count(n) AS demand ORDER BY demand DESC LIMIT 20",
        {"ngo_id": user.ngo_id},
    )
    supplied = await neo4j_service.run_query(
        "MATCH (v:Volunteer {ngo_id: $ngo_id, availabilityStatus: 'ACTIVE'})-[:HAS_SKILL]->(s:Skill) "
        "RETURN s.name AS skill, count(v) AS supply",
        {"ngo_id": user.ngo_id},
    )
    supply_map = {row["skill"]: row["supply"] for row in supplied}
    return {
        "coverage": [
            {
                "skill": row["skill"],
                "demand": row["demand"],
                "supply": supply_map.get(row["skill"], 0),
                "gap": max(0, row["demand"] - supply_map.get(row["skill"], 0)),
            }
            for row in demanded
        ]
    }


@analytics_router.get("/hotzone-ranking")
async def hotzone_ranking(
    user: AdminUser,
    limit: Annotated[int, Query(ge=1, le=200)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict:
    from app.integrations.neo4j import neo4j_service

    rows = await neo4j_service.run_query(
        "MATCH (n:Need {ngo_id: $ngo_id, status: 'PENDING'})-[:LOCATED_IN]->(l:Location) "
        "RETURN l.name AS zone, count(n) AS need_count, "
        "round(sum(n.urgency_score) * 100) / 100.0 AS total_urgency, "
        "sum(n.population_affected) AS total_affected "
        "ORDER BY total_urgency DESC SKIP $offset LIMIT $limit",
        {"ngo_id": user.ngo_id, "limit": limit, "offset": offset},
    )
    return {"hotzones": rows, "limit": limit, "offset": offset}


@analytics_router.get("/volunteer-activity")
async def volunteer_activity(
    user: AdminUser,
    limit: Annotated[int, Query(ge=1, le=200)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict:
    from app.integrations.neo4j import neo4j_service

    rows = await neo4j_service.run_query(
        "MATCH (v:Volunteer {ngo_id: $ngo_id}) "
        "RETURN v.name AS name, coalesce(v.totalTasksCompleted, 0) AS tasks_completed, "
        "coalesce(v.totalXP, 0) AS xp, coalesce(v.reputationScore, 0) AS reputation "
        "ORDER BY tasks_completed DESC SKIP $offset LIMIT $limit",
        {"ngo_id": user.ngo_id, "limit": limit, "offset": offset},
    )
    return {"data": rows, "limit": limit, "offset": offset}


@analytics_router.get("/needs-by-type")
async def needs_by_type(user: AdminUser) -> dict:
    from app.integrations.neo4j import neo4j_service

    rows = await neo4j_service.run_query(
        "MATCH (n:Need {ngo_id: $ngo_id}) RETURN n.type AS type, count(n) AS count "
        "ORDER BY count DESC",
        {"ngo_id": user.ngo_id},
    )
    return {"needs_by_type": rows}


# ── Ingest ────────────────────────────────────────────────────────────────────

@ingest_router.post("/text", dependencies=[Depends(ingest_limit)])
async def ingest_text(data: IngestTextRequest, user: AdminUser) -> dict:
    from app.integrations.gemini import extract_entities
    from app.integrations.graph_writer import write_extraction_to_graph

    result = await extract_entities(data.text, data.language)
    if result.get("error"):
        raise BadRequest(result["error"])

    need_id = await write_extraction_to_graph(result, ngo_id=user.ngo_id)
    return {"entities": result, "need_id": need_id or None}


@ingest_router.post("/document", dependencies=[Depends(ingest_limit)])
async def ingest_document(user: AdminUser, file: UploadFile = File(...)) -> dict:
    from app.integrations.gemini import extract_entities, extract_entities_from_image
    from app.integrations.graph_writer import write_extraction_to_graph

    payload = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(payload) > MAX_UPLOAD_BYTES:
        # The Django version read the whole upload into memory with no ceiling.
        raise BadRequest(f"File exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)}MB limit")
    if not payload:
        raise BadRequest("File is empty")

    mime = file.content_type or "application/octet-stream"
    if mime.startswith("image/") or mime == "application/pdf":
        result = await extract_entities_from_image(payload, mime)
    else:
        result = await extract_entities(payload.decode("utf-8", errors="replace"))

    if result.get("error"):
        raise BadRequest(result["error"])

    need_id = await write_extraction_to_graph(result, ngo_id=user.ngo_id)
    return {"entities": result, "filename": file.filename, "need_id": need_id or None}


@ingest_router.post("/voice", dependencies=[Depends(ingest_limit)])
async def ingest_voice(user: AdminUser, file: UploadFile = File(...)) -> dict:
    """Transcribe a field audio report and add what it describes to the graph."""
    from app.integrations.gemini import extract_entities_from_audio
    from app.integrations.graph_writer import write_extraction_to_graph

    payload = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(payload) > MAX_UPLOAD_BYTES:
        raise BadRequest(f"Audio exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)}MB limit")
    if not payload:
        raise BadRequest("Audio file is empty")

    result = await extract_entities_from_audio(payload, file.content_type or "audio/wav")
    if result.get("error"):
        raise BadRequest(result["error"])

    need_id = await write_extraction_to_graph(result, ngo_id=user.ngo_id)
    return {
        "entities": result,
        "transcript": result.get("transcript_english", ""),
        "detected_language": result.get("detected_language", ""),
        "need_id": need_id or None,
    }


@voice_router.post("/twiml")
async def voice_twiml() -> Response:
    from twilio.twiml.voice_response import VoiceResponse

    reply = VoiceResponse()
    reply.say("Welcome to Sanchaalan Saathi. Please leave your message after the beep.")
    reply.record(timeout=10, transcribe=True, action="/api/voice/recording")
    return Response(content=str(reply), media_type="application/xml")


@voice_router.post("/recording")
async def voice_recording(request: Request) -> Response:
    from app.integrations.gemini import extract_entities

    form = await request.form()
    transcription = str(form.get("TranscriptionText") or "").strip()
    if transcription:
        try:
            await extract_entities(transcription)
        except Exception as exc:
            logger.warning("Voice transcription processing failed: %s", exc)
    return Response(
        content="<?xml version='1.0' encoding='UTF-8'?><Response/>",
        media_type="application/xml",
    )


# ── Simulation ────────────────────────────────────────────────────────────────

@sim_router.post("/run")
async def run_simulation(user: AdminUser, body: SimulationRequest | None = None) -> dict:
    from app.domain.simulation import run_simulation_scenario

    params = (body or SimulationRequest()).params
    result = await run_simulation_scenario(
        num_steps=params.num_steps, strategy=params.strategy
    )

    # Persist the run so /analytics/coverage-history has something to report.
    # Nothing wrote this collection before, so that endpoint always came back empty.
    try:
        from app.integrations.firebase import firebase_service

        if firebase_service.db is not None:
            firebase_service.db.collection("simulation_runs").add(
                {
                    "ngo_id": user.ngo_id,
                    "strategy": params.strategy,
                    "steps": params.num_steps,
                    "final_coverage": result.get("completion_rate", 0),
                    "timestamp": datetime.now(tz=UTC),
                }
            )
    except Exception as exc:
        logger.warning("Could not record simulation run: %s", exc)

    return {"result": result}


@sim_router.get("/compare")
async def compare_strategies(
    user: AdminUser, steps: Annotated[int, Query(ge=10, le=300)] = 100
) -> dict:
    """Run every assignment strategy over one identical scenario.

    Not the same as running each separately: the snapshot is shared, so the
    comparison is apples to apples.
    """
    from app.domain.simulation import run_comparison_scenario

    return {"result": await run_comparison_scenario(steps=steps)}


@analytics_router.get("/trend")
async def activity_trend(
    user: AdminUser, days: Annotated[int, Query(ge=1, le=90)] = 7
) -> dict:
    from app.integrations.firebase import firebase_service

    if firebase_service.db is None:
        return {"trend": [], "days": days, "data_unavailable": True}

    now = datetime.now(tz=UTC)
    counts: dict[str, int] = {}
    try:
        events = (
            firebase_service.db.collection("activity")
            .where("type", "==", "NEED_REPORTED")
            .where("ngo_id", "==", user.ngo_id)
            .where("timestamp", ">=", now - timedelta(days=days))
            .stream()
        )
        for event in events:
            stamp = event.to_dict().get("timestamp")
            if stamp is None:
                continue
            day = stamp.strftime("%Y-%m-%d") if hasattr(stamp, "strftime") else str(stamp)[:10]
            counts[day] = counts.get(day, 0) + 1
    except Exception as exc:
        logger.error("Activity trend query failed: %s", exc)
        return {"trend": [], "days": days, "data_unavailable": True}

    trend = [
        {
            "date": (now - timedelta(days=days - 1 - offset)).strftime("%Y-%m-%d"),
            "count": counts.get((now - timedelta(days=days - 1 - offset)).strftime("%Y-%m-%d"), 0),
        }
        for offset in range(days)
    ]
    return {"trend": trend, "days": days}


@analytics_router.get("/coverage-history")
async def coverage_history(
    user: AdminUser, limit: Annotated[int, Query(ge=1, le=50)] = 10
) -> dict:
    from app.integrations.firebase import firebase_service

    if firebase_service.db is None:
        return {"history": [], "data_unavailable": True}

    try:
        runs = (
            firebase_service.db.collection("simulation_runs")
            .where("ngo_id", "==", user.ngo_id)
            .order_by("timestamp", direction="DESCENDING")
            .limit(limit)
            .stream()
        )
        history = [
            {
                "run_id": run.id,
                "strategy": run.to_dict().get("strategy", "unknown"),
                "coverage_pct": run.to_dict().get("final_coverage", 0),
                "timestamp": str(run.to_dict().get("timestamp", ""))[:10],
            }
            for run in runs
        ]
    except Exception as exc:
        logger.error("Coverage history query failed: %s", exc)
        return {"history": [], "data_unavailable": True}

    return {"history": history, "data_unavailable": not history}
