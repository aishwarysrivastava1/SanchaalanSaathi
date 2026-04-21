from __future__ import annotations

import asyncio
import datetime as dt
import logging
from collections import defaultdict

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class RealtimeEventBus:
    def __init__(self) -> None:
        self._ngo_clients: dict[str, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, ngo_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._ngo_clients[ngo_id].add(websocket)

    async def disconnect(self, ngo_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            clients = self._ngo_clients.get(ngo_id)
            if not clients:
                return
            clients.discard(websocket)
            if not clients:
                self._ngo_clients.pop(ngo_id, None)

    async def publish(self, ngo_id: str | None, event: str, payload: dict) -> None:
        scope = ngo_id or "global"
        async with self._lock:
            clients = list(self._ngo_clients.get(scope, set()))
        if not clients:
            return

        envelope = {
            "event": event,
            "payload": payload,
            "timestamp": dt.datetime.utcnow().isoformat() + "Z",
        }
        stale: list[WebSocket] = []
        for ws in clients:
            try:
                await ws.send_json(envelope)
            except Exception:
                stale.append(ws)

        if stale:
            async with self._lock:
                bucket = self._ngo_clients.get(scope, set())
                for ws in stale:
                    bucket.discard(ws)
                if not bucket:
                    self._ngo_clients.pop(scope, None)
            logger.debug("Cleaned %s stale websocket client(s) for ngo scope %s", len(stale), scope)

    def stats(self) -> dict:
        return {
            "active_ngo_scopes": len(self._ngo_clients),
            "active_connections": sum(len(v) for v in self._ngo_clients.values()),
        }


realtime_bus = RealtimeEventBus()
