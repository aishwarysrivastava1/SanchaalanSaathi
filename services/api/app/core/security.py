"""JWT issuing and verification, plus password hashing.

Access tokens keep the claim set the Django backend used (`sub`, `role`,
`ngo_id`, `email`) and the same HS256 key, so tokens issued by either backend
are accepted by both. Refresh tokens are new: they rotate on use and can be
revoked, which the old 24-hour bearer token could not.
"""
from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
import jwt

from app.core.config import settings

logger = logging.getLogger(__name__)

REFRESH_DENYLIST_PREFIX = "auth:revoked:"


class TokenError(Exception):
    """Token is malformed, expired, or of the wrong type."""


def _now() -> datetime:
    return datetime.now(tz=UTC)


def _encode(payload: dict[str, Any]) -> str:
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_access_token(user_id: str, role: str, ngo_id: str | None, email: str = "") -> str:
    return _encode(
        {
            "sub": user_id,
            "role": role,
            "ngo_id": ngo_id,
            "email": email,
            "type": "access",
            "iat": _now(),
            "exp": _now() + timedelta(minutes=settings.access_token_ttl_minutes),
        }
    )


def create_refresh_token(user_id: str) -> tuple[str, str]:
    """Returns (token, jti). The jti is what gets denylisted on logout."""
    jti = str(uuid.uuid4())
    token = _encode(
        {
            "sub": user_id,
            "type": "refresh",
            "jti": jti,
            "iat": _now(),
            "exp": _now() + timedelta(days=settings.refresh_token_ttl_days),
        }
    )
    return token, jti


def decode_token(token: str, *, expected_type: str | None = None) -> dict[str, Any]:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
            options={"require": ["exp", "sub"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise TokenError("Token has expired") from exc
    except jwt.InvalidTokenError as exc:
        raise TokenError("Invalid token") from exc

    if expected_type is not None:
        # Tokens minted by the Django backend carry no `type`; treat them as
        # access tokens so existing sessions survive the cutover.
        actual = payload.get("type", "access")
        if actual != expected_type:
            raise TokenError(f"Expected a {expected_type} token, got {actual}")
    return payload


async def revoke_refresh_token(jti: str) -> None:
    from app.core.cache import get_redis

    redis = await get_redis()
    if redis is None:
        logger.warning("Refresh token %s not revoked: no Redis configured", jti)
        return
    await redis.setex(
        f"{REFRESH_DENYLIST_PREFIX}{jti}", settings.refresh_token_ttl_days * 86400, "1"
    )


async def is_refresh_token_revoked(jti: str) -> bool:
    from app.core.cache import get_redis

    redis = await get_redis()
    if redis is None:
        return False
    return bool(await redis.exists(f"{REFRESH_DENYLIST_PREFIX}{jti}"))


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str | None) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except (ValueError, TypeError):
        return False
