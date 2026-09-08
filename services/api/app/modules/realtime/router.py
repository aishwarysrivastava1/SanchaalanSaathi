"""WebSocket gateway.

Fan-out goes through Redis pub/sub, so any replica can serve any socket.
"""
from __future__ import annotations

import asyncio
import contextlib
import json
import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.core.events import realtime_bus
from app.core.observability import ws_connections
from app.core.security import TokenError, decode_token

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/realtime", tags=["realtime"])

HEARTBEAT_SECONDS = 30
CLOSE_NO_TOKEN = 4001
CLOSE_BAD_TOKEN = 4003


@router.websocket("/ws")
async def realtime_socket(websocket: WebSocket, token: str = Query(default="")) -> None:
    if not token:
        await websocket.close(code=CLOSE_NO_TOKEN, reason="Missing token")
        return
    try:
        payload = decode_token(token, expected_type="access")
    except TokenError as exc:
        logger.info("WebSocket auth rejected: %s", exc)
        await websocket.close(code=CLOSE_BAD_TOKEN, reason="Invalid token")
        return

    ngo_id = payload.get("ngo_id") or "global"
    await websocket.accept()
    queue = await realtime_bus.subscribe(ngo_id)
    ws_connections.inc()

    async def pump() -> None:
        """Forward bus events to the client, with a keepalive between them."""
        while True:
            try:
                envelope = await asyncio.wait_for(queue.get(), timeout=HEARTBEAT_SECONDS)
            except TimeoutError:
                # Proxies (Railway, Vercel, most CDNs) drop idle sockets after
                # ~60s. A periodic frame keeps the connection alive.
                await websocket.send_text(json.dumps({"event": "ping", "payload": {}}))
                continue
            await websocket.send_text(json.dumps(envelope, default=str))

    pump_task = asyncio.create_task(pump())
    try:
        await websocket.send_text(
            json.dumps({"event": "connected", "payload": {"ngo_id": ngo_id}})
        )
        while True:
            message = await websocket.receive_text()
            if message.strip().lower() in ("ping", '"ping"'):
                await websocket.send_text(json.dumps({"event": "pong", "payload": {}}))
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.warning("WebSocket error for ngo %s: %s", ngo_id, exc)
    finally:
        pump_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await pump_task
        await realtime_bus.unsubscribe(ngo_id, queue)
        ws_connections.dec()


@router.get("/status")
async def realtime_status() -> dict:
    return {"status": "ok", **realtime_bus.stats()}
