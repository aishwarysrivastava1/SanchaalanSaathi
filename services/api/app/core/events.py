"""Realtime event bus over Redis pub/sub.

Any replica can publish; every replica holding a matching socket delivers. With
the in-process bus this replaced, a volunteer connected to one replica never
received an event published on another. Without Redis, delivery is local only,
which is correct for a single process.
"""
from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from collections import defaultdict
from datetime import UTC, datetime
from typing import Any

from app.core.cache import get_redis

logger = logging.getLogger(__name__)

CHANNEL_PREFIX = "realtime:ngo:"
QUEUE_SIZE = 100


class RealtimeBus:
    def __init__(self) -> None:
        self._subscribers: dict[str, set[asyncio.Queue]] = defaultdict(set)
        self._lock = asyncio.Lock()
        self._pubsub: Any = None
        self._reader_task: asyncio.Task | None = None

    async def subscribe(self, ngo_id: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=QUEUE_SIZE)
        async with self._lock:
            first_here = not self._subscribers[ngo_id]
            self._subscribers[ngo_id].add(queue)
        if first_here:
            await self._listen(ngo_id)
        return queue

    async def unsubscribe(self, ngo_id: str, queue: asyncio.Queue) -> None:
        async with self._lock:
            listeners = self._subscribers.get(ngo_id)
            if not listeners:
                return
            listeners.discard(queue)
            if listeners:
                return
            self._subscribers.pop(ngo_id, None)

        if self._pubsub is not None:
            with contextlib.suppress(Exception):
                await self._pubsub.unsubscribe(f"{CHANNEL_PREFIX}{ngo_id}")

    async def publish(self, ngo_id: str | None, event: str, payload: dict) -> None:
        scope = ngo_id or "global"
        envelope = {
            "event": event,
            "payload": payload,
            "timestamp": datetime.now(tz=UTC).isoformat(),
        }

        redis = await get_redis()
        if redis is not None:
            try:
                await redis.publish(f"{CHANNEL_PREFIX}{scope}", json.dumps(envelope, default=str))
                # The reader below fans this back out locally; delivering here
                # too would send every local socket a duplicate.
                return
            except Exception as exc:
                logger.warning("Redis publish failed, delivering locally only: %s", exc)

        await self._deliver(scope, envelope)

    async def _deliver(self, scope: str, envelope: dict) -> None:
        async with self._lock:
            queues = list(self._subscribers.get(scope, ()))
        for queue in queues:
            try:
                queue.put_nowait(envelope)
            except asyncio.QueueFull:
                # A socket that cannot keep up drops events rather than stalling the bus.
                logger.warning("Realtime queue full for %s - dropping event", scope)

    async def _listen(self, ngo_id: str) -> None:
        redis = await get_redis()
        if redis is None:
            return
        if self._pubsub is None:
            self._pubsub = redis.pubsub(ignore_subscribe_messages=True)
        await self._pubsub.subscribe(f"{CHANNEL_PREFIX}{ngo_id}")
        if self._reader_task is None or self._reader_task.done():
            self._reader_task = asyncio.create_task(self._read_forever())

    async def _read_forever(self) -> None:
        while True:
            try:
                message = await self._pubsub.get_message(timeout=5.0)
                if message and message.get("type") == "message":
                    scope = str(message["channel"]).removeprefix(CHANNEL_PREFIX)
                    await self._deliver(scope, json.loads(message["data"]))
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.error("Realtime reader error: %s", exc)
                await asyncio.sleep(1.0)

    async def shutdown(self) -> None:
        if self._reader_task is not None:
            self._reader_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._reader_task
        if self._pubsub is not None:
            with contextlib.suppress(Exception):
                await self._pubsub.aclose()

    def stats(self) -> dict:
        return {
            "active_scopes": len(self._subscribers),
            "local_connections": sum(len(q) for q in self._subscribers.values()),
        }


realtime_bus = RealtimeBus()
