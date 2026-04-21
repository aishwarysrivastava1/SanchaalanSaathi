from __future__ import annotations

import json
import logging
import os
import time
from typing import Any

logger = logging.getLogger(__name__)

try:
    import redis.asyncio as redis  # type: ignore
except Exception:  # pragma: no cover
    redis = None


class LiveLocationCache:
    def __init__(self) -> None:
        self._client = None
        self._enabled = False
        self._fallback_store: dict[str, dict[str, Any]] = {}
        self._ttl_seconds = int(os.getenv("REDIS_LOCATION_TTL_SECONDS", "120"))

    @property
    def enabled(self) -> bool:
        return self._enabled

    async def startup(self) -> None:
        if redis is None:
            logger.warning("redis package not installed; live location cache running in fallback mode")
            return

        redis_url = os.getenv("REDIS_URL")
        if redis_url:
            client = redis.from_url(redis_url, decode_responses=True)
        else:
            host = os.getenv("REDIS_HOST", "localhost")
            port = int(os.getenv("REDIS_PORT", "6379"))
            db = int(os.getenv("REDIS_DB", "0"))
            client = redis.Redis(host=host, port=port, db=db, decode_responses=True)

        try:
            await client.ping()
            self._client = client
            self._enabled = True
            logger.info("Live location cache connected to Redis")
        except Exception as exc:
            logger.warning("Redis unavailable; live location cache using fallback mode: %s", exc)

    async def shutdown(self) -> None:
        if self._client is not None:
            try:
                await self._client.aclose()
            except Exception:
                pass
        self._client = None
        self._enabled = False

    async def set_location(
        self,
        volunteer_id: str,
        ngo_id: str | None,
        lat: float | None,
        lng: float | None,
        share_location: bool,
    ) -> None:
        key = f"volunteer:{volunteer_id}"
        payload: dict[str, Any] = {
            "volunteer_id": volunteer_id,
            "ngo_id": ngo_id,
            "lat": lat,
            "lng": lng,
            "share_location": share_location,
            "timestamp": int(time.time()),
        }

        self._fallback_store[key] = payload
        if not self._enabled or self._client is None:
            return

        try:
            await self._client.setex(key, self._ttl_seconds, json.dumps(payload))
        except Exception as exc:
            logger.warning("Redis set_location failed; continuing in fallback mode: %s", exc)

    async def get_location(self, volunteer_id: str) -> dict[str, Any] | None:
        key = f"volunteer:{volunteer_id}"
        if self._enabled and self._client is not None:
            try:
                raw = await self._client.get(key)
                if raw:
                    return json.loads(raw)
            except Exception as exc:
                logger.warning("Redis get_location failed: %s", exc)
        return self._fallback_store.get(key)


live_location_cache = LiveLocationCache()
