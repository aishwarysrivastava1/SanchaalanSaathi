"""Shared Redis client.

Every piece of cross-request state lives here rather than in a module-level
dict, which is what allows more than one replica to run correctly. Redis is
optional in development; `Settings.validate_for_boot` requires it in production.
"""
from __future__ import annotations

import logging

import redis.asyncio as aioredis

from app.core.config import settings

logger = logging.getLogger(__name__)

_client: aioredis.Redis | None = None
_unavailable = False


async def get_redis() -> aioredis.Redis | None:
    global _client, _unavailable

    if _unavailable or not settings.redis_url:
        return None
    if _client is not None:
        return _client

    try:
        _client = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=5,
            socket_keepalive=True,
            health_check_interval=30,
            retry_on_timeout=True,
        )
        await _client.ping()
        logger.info("Redis connected")
    except Exception as exc:
        logger.error("Redis unavailable (%s) - falling back to per-process state", exc)
        _client = None
        _unavailable = True
    return _client


async def check_redis() -> str:
    """Returns 'ok', 'degraded' or 'not_configured' for the readiness probe."""
    if not settings.redis_url:
        return "not_configured"
    client = await get_redis()
    if client is None:
        return "degraded"
    try:
        await client.ping()
        return "ok"
    except Exception:
        return "degraded"


async def close_redis() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
