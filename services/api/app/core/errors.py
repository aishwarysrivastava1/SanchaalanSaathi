"""Uniform error responses.

Every failure returns {"detail", "request_id"}. `detail` matches what the Django
backend produced, so existing frontend error handling keeps working.
"""
from __future__ import annotations

import logging

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.core.logging import request_id_var

logger = logging.getLogger(__name__)


class AppError(HTTPException):
    pass


class BadRequest(AppError):
    def __init__(self, detail: str) -> None:
        super().__init__(status.HTTP_400_BAD_REQUEST, detail)


class Unauthorized(AppError):
    def __init__(self, detail: str = "Authentication required") -> None:
        super().__init__(status.HTTP_401_UNAUTHORIZED, detail)


class Forbidden(AppError):
    def __init__(self, detail: str = "Not permitted") -> None:
        super().__init__(status.HTTP_403_FORBIDDEN, detail)


class NotFound(AppError):
    def __init__(self, what: str = "Resource") -> None:
        super().__init__(status.HTTP_404_NOT_FOUND, f"{what} not found")


class Conflict(AppError):
    def __init__(self, detail: str) -> None:
        super().__init__(status.HTTP_409_CONFLICT, detail)


def _body(detail: str) -> dict:
    return {"detail": detail, "request_id": request_id_var.get()}


def _describe(error: dict) -> str:
    location = ".".join(str(part) for part in error.get("loc", ()) if part not in ("body", "query"))
    message = error.get("msg", "invalid")
    return f"{location}: {message}" if location else message


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=_body(str(exc.detail)),
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        detail = "; ".join(_describe(error) for error in exc.errors()) or "Invalid request"
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={**_body(detail), "errors": exc.errors()},
        )

    @app.exception_handler(IntegrityError)
    async def integrity_error(request: Request, exc: IntegrityError) -> JSONResponse:
        logger.warning("Integrity error on %s %s: %s", request.method, request.url.path, exc)
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content=_body("That record already exists or violates a constraint"),
        )

    @app.exception_handler(SQLAlchemyError)
    async def database_error(request: Request, exc: SQLAlchemyError) -> JSONResponse:
        logger.error("Database error on %s %s", request.method, request.url.path, exc_info=exc)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=_body("Database temporarily unavailable"),
        )

    @app.exception_handler(Exception)
    async def unhandled_error(request: Request, exc: Exception) -> JSONResponse:
        logger.error("Unhandled error on %s %s", request.method, request.url.path, exc_info=exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=_body("Internal server error"),
        )
