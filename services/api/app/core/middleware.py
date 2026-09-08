"""Request id, access logging, guest cookie, and security headers."""
from __future__ import annotations

import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import settings
from app.core.logging import request_id_var

logger = logging.getLogger("app.access")

GUEST_COOKIE = "guest_id"
GUEST_COOKIE_MAX_AGE = 365 * 24 * 60 * 60


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Assigns X-Request-ID and emits one structured log line per request."""

    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
        token = request_id_var.set(request_id)
        request.state.request_id = request_id
        started = time.perf_counter()

        try:
            response = await call_next(request)
        except Exception:
            logger.exception(
                "request failed",
                extra=self._fields(request, 500, started),
            )
            raise
        finally:
            request_id_var.reset(token)

        response.headers["X-Request-ID"] = request_id
        logger.log(
            logging.WARNING if response.status_code >= 400 else logging.INFO,
            "request",
            extra=self._fields(request, response.status_code, started),
        )
        return response

    @staticmethod
    def _fields(request: Request, status: int, started: float) -> dict:
        user = getattr(request.state, "user", None)
        return {
            "method": request.method,
            "path": request.url.path,
            "status": status,
            "duration_ms": round((time.perf_counter() - started) * 1000, 1),
            "user_id": getattr(user, "user_id", None),
            "ngo_id": getattr(user, "ngo_id", None),
        }


class GuestSessionMiddleware(BaseHTTPMiddleware):
    """Gives anonymous visitors a stable id so demo data can follow them."""

    async def dispatch(self, request: Request, call_next) -> Response:
        guest_id = request.cookies.get(GUEST_COOKIE)
        request.state.guest_id = guest_id or str(uuid.uuid4())

        response = await call_next(request)

        if not guest_id:
            response.set_cookie(
                GUEST_COOKIE,
                request.state.guest_id,
                max_age=GUEST_COOKIE_MAX_AGE,
                httponly=True,
                secure=settings.is_production,
                # Lax, not Strict: the frontend is a different origin, and
                # Strict would drop the cookie on every cross-site call.
                samesite="lax",
                path="/",
            )
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    HEADERS = {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    }

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        for header, value in self.HEADERS.items():
            response.headers.setdefault(header, value)
        if settings.is_production:
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
            )
        return response
