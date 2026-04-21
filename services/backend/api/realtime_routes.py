from __future__ import annotations

import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError

from services.live_location_cache import live_location_cache
from services.realtime_events import realtime_bus
from utils.auth_utils import decode_token

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/status")
async def realtime_status():
    return {
        **realtime_bus.stats(),
        "redis_enabled": live_location_cache.enabled,
    }


@router.websocket("/ws")
async def realtime_ws(websocket: WebSocket):
    token = websocket.query_params.get("token")
    if not token:
        auth_header = websocket.headers.get("authorization", "")
        if auth_header.lower().startswith("bearer "):
            token = auth_header.split(" ", 1)[1]

    if not token:
        await websocket.close(code=1008, reason="Missing token")
        return

    try:
        payload = decode_token(token)
        ngo_id = payload.get("ngo_id") or "global"
        user_id = payload.get("sub")
        if not user_id:
            raise JWTError("Missing sub claim")
    except (JWTError, KeyError):
        await websocket.close(code=1008, reason="Invalid token")
        return

    await realtime_bus.connect(ngo_id, websocket)
    try:
        await websocket.send_json({"event": "connected", "payload": {"ngo_id": ngo_id}})
        while True:
            message = await websocket.receive_text()
            if message.strip().lower() == "ping":
                await websocket.send_json({"event": "pong", "payload": {}})
    except WebSocketDisconnect:
        logger.debug("Realtime websocket disconnected for ngo scope %s", ngo_id)
    finally:
        await realtime_bus.disconnect(ngo_id, websocket)
