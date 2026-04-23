from __future__ import annotations

import json
import logging
import os
import time
import asyncio
from typing import Any

logger = logging.getLogger(__name__)

class LiveLocationCache:
    def __init__(self) -> None:
        self._enabled = True
        self._store: dict[str, dict[str, Any]] = {}
        self._ttl_seconds = int(os.getenv("LOCATION_TTL_SECONDS", "120"))
        self._cleanup_task = None

    @property
    def enabled(self) -> bool:
        return self._enabled

    async def startup(self) -> None:
        self._enabled = True
        logger.info("Live location cache running in memory mode")
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())

    async def shutdown(self) -> None:
        self._enabled = False
        if self._cleanup_task:
            self._cleanup_task.cancel()

    async def _cleanup_loop(self):
        while self._enabled:
            await asyncio.sleep(60)
            now = int(time.time())
            expired_keys = [
                key for key, val in self._store.items()
                if now - val["timestamp"] > self._ttl_seconds
            ]
            for curr_key in expired_keys:
                self._store.pop(curr_key, None)

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
        self._store[key] = payload

    async def get_location(self, volunteer_id: str) -> dict[str, Any] | None:
        key = f"volunteer:{volunteer_id}"
        payload = self._store.get(key)
        if payload is not None:
            if int(time.time()) - payload["timestamp"] <= self._ttl_seconds:
                return payload
            else:
                self._store.pop(key, None)
        return None

live_location_cache = LiveLocationCache()
