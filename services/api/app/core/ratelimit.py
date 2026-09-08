"""Redis-backed fixed-window rate limiting.

Fixed window rather than sliding: two Redis operations instead of five, and the
worst case is a client getting twice the limit across a window boundary. Without
Redis this is a no-op, and production boot already requires Redis.
"""
from __future__ import annotations

import logging
import time
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.cache import get_redis
from app.core.errors import AppError
from app.core.security import TokenError, decode_token

logger = logging.getLogger(__name__)

_bearer = HTTPBearer(auto_error=False)


class RateLimited(AppError):
    def __init__(self, retry_after: int) -> None:
        super().__init__(429, f"Too many requests. Try again in {retry_after}s.")
        self.headers = {"Retry-After": str(retry_after)}


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def enforce(key: str, *, limit: int, window_seconds: int) -> None:
    redis = await get_redis()
    if redis is None:
        return

    now = int(time.time())
    bucket = f"rl:{key}:{now // window_seconds}"
    try:
        pipe = redis.pipeline()
        pipe.incr(bucket)
        pipe.expire(bucket, window_seconds + 1)
        count, _ = await pipe.execute()
    except Exception as exc:
        # A Redis blip must not turn into a 500 on a user request.
        logger.warning("Rate limit check failed open for %s: %s", key, exc)
        return

    if int(count) > limit:
        raise RateLimited(max(window_seconds - (now % window_seconds), 1))


def _subject_from_token(credentials: HTTPAuthorizationCredentials | None) -> str | None:
    if not credentials or not credentials.credentials:
        return None
    try:
        return decode_token(credentials.credentials)["sub"]
    except (TokenError, KeyError):
        return None


def limiter(name: str, *, limit: int, window_seconds: int, by: str = "ip"):
    """Builds a FastAPI dependency that limits by client IP or by user id."""
    if by not in ("ip", "user"):
        raise ValueError("by must be 'ip' or 'user'")

    if by == "ip":

        async def by_ip(request: Request) -> None:
            await enforce(f"{name}:{client_ip(request)}", limit=limit, window_seconds=window_seconds)

        return by_ip

    # The token is decoded here rather than read from request.state, because
    # router-level dependencies run before the path function resolves the user.
    async def by_user(
        request: Request,
        credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    ) -> None:
        subject = _subject_from_token(credentials) or client_ip(request)
        await enforce(f"{name}:{subject}", limit=limit, window_seconds=window_seconds)

    return by_user
