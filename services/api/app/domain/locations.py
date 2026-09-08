"""Live volunteer locations.

Redis holds the hot, TTL-expiring copy so a volunteer who stops sharing ages
out on its own. Postgres is written on every update and stays the durable
source, which is what keeps the NGO map correct across replicas.
"""
from __future__ import annotations

import json
import logging

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import get_redis
from app.core.config import settings
from app.models import User, VolunteerProfile, utcnow

logger = logging.getLogger(__name__)

KEY_PREFIX = "loc:volunteer:"


async def set_location(
    session: AsyncSession,
    *,
    volunteer_id: str,
    ngo_id: str,
    lat: float | None,
    lng: float | None,
    share_location: bool,
) -> None:
    await session.execute(
        update(VolunteerProfile)
        .where(VolunteerProfile.user_id == volunteer_id, VolunteerProfile.ngo_id == ngo_id)
        .values(lat=lat, lng=lng, share_location=share_location, last_active_at=utcnow())
    )

    redis = await get_redis()
    if redis is not None:
        key = f"{KEY_PREFIX}{volunteer_id}"
        try:
            if share_location and lat is not None and lng is not None:
                await redis.setex(
                    key,
                    settings.location_cache_ttl_seconds,
                    json.dumps({"lat": lat, "lng": lng, "ngo_id": ngo_id}),
                )
            else:
                await redis.delete(key)
        except Exception as exc:
            logger.warning("Location cache write failed for %s: %s", volunteer_id, exc)

    # MERGEs the Volunteer node. Nothing else creates one, so without this the
    # graph volunteer and skill-coverage analytics have nothing to read.
    # Imported here so the coordination and field services do not need the
    # Neo4j driver installed at all.
    try:
        from app.integrations.neo4j import neo4j_service

        await neo4j_service.upsert_volunteer_location(
            volunteer_id=volunteer_id,
            ngo_id=ngo_id,
            lat=lat,
            lng=lng,
            share_location=share_location,
        )
    except Exception as exc:
        logger.warning("Graph location mirror failed for %s: %s", volunteer_id, exc)


async def get_location(volunteer_id: str) -> dict | None:
    redis = await get_redis()
    if redis is None:
        return None
    try:
        raw = await redis.get(f"{KEY_PREFIX}{volunteer_id}")
        return json.loads(raw) if raw else None
    except Exception as exc:
        logger.warning("Location cache read failed for %s: %s", volunteer_id, exc)
        return None


async def sharing_volunteers(session: AsyncSession, ngo_id: str) -> list[dict]:
    """Everyone in this NGO currently sharing a position, for the live map.

    Reads Postgres (the durable store) and overlays any fresher Redis value.
    """
    rows = (
        await session.execute(
            select(VolunteerProfile, User.email)
            .join(User, User.id == VolunteerProfile.user_id)
            .where(
                VolunteerProfile.ngo_id == ngo_id,
                VolunteerProfile.share_location.is_(True),
                VolunteerProfile.lat.is_not(None),
                VolunteerProfile.lng.is_not(None),
            )
        )
    ).all()

    result: list[dict] = []
    for profile, email in rows:
        live = await get_location(profile.user_id)
        result.append(
            {
                "id": profile.id,
                "user_id": profile.user_id,
                "email": email,
                "full_name": profile.full_name,
                "lat": live["lat"] if live else profile.lat,
                "lng": live["lng"] if live else profile.lng,
                "skills": profile.skills,
                "availability": profile.availability,
                "status": profile.status,
                "last_active_at": profile.last_active_at,
                "live": live is not None,
            }
        )
    return result
