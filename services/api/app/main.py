"""Application entrypoint.

One image, deployed as one service or as several. SERVICES chooses which
modules this process mounts:

    SERVICES=all                   everything in one process
    SERVICES=identity              only /api/auth
    SERVICES=coordination,field    only the NGO and volunteer APIs
    SERVICES=realtime              only the WebSocket gateway
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.core.cache import check_redis, close_redis, get_redis
from app.core.config import settings
from app.core.db import check_database, dispose_engine
from app.core.errors import register_exception_handlers
from app.core.events import realtime_bus
from app.core.logging import configure_logging
from app.core.middleware import (
    GuestSessionMiddleware,
    RequestContextMiddleware,
    SecurityHeadersMiddleware,
)
from app.core.observability import MetricsMiddleware, metrics_endpoint

logger = logging.getLogger(__name__)


def _routers():
    """Yields the routers for each enabled module. Imported lazily so a split
    deployment never loads dependencies it does not use."""
    modules = settings.enabled_modules

    if "identity" in modules:
        from app.modules.identity.router import router

        yield router

    if "coordination" in modules:
        from app.modules.coordination.router import router

        yield router

    if "field" in modules:
        from app.modules.field.router import router

        yield router

    if "intelligence" in modules:
        from app.modules.intelligence import router as intelligence

        yield from (
            intelligence.chat_router,
            intelligence.graph_router,
            intelligence.analytics_router,
            intelligence.ingest_router,
            intelligence.voice_router,
            intelligence.sim_router,
        )

    if "realtime" in modules:
        from app.modules.realtime.router import router

        yield router


async def _close_neo4j() -> None:
    if "intelligence" not in settings.enabled_modules:
        return
    try:
        from app.integrations.neo4j import neo4j_service
    except ImportError:
        return
    await neo4j_service.close_driver()


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    settings.validate_for_boot()
    logger.info(
        "Starting %s v%s (env=%s, modules=%s)",
        settings.service_name,
        settings.version,
        settings.deployment_env,
        ",".join(settings.enabled_modules),
    )
    await get_redis()

    yield

    logger.info("Shutting down")
    await realtime_bus.shutdown()

    # Each cleanup is isolated: one failure must not skip the rest, or a rolling
    # deploy leaks Postgres connections until the pooler reaps them.
    for name, close in (("neo4j", _close_neo4j), ("redis", close_redis), ("database", dispose_engine)):
        try:
            await close()
        except Exception as exc:
            logger.warning("Error closing %s during shutdown: %s", name, exc)


def create_app() -> FastAPI:
    app = FastAPI(
        title="Sanchaalan Saathi API",
        version=settings.version,
        lifespan=lifespan,
        # The schema maps every endpoint and its auth requirement, so it stays
        # off in production.
        docs_url=None if settings.is_production else "/docs",
        openapi_url=None if settings.is_production else "/openapi.json",
        redoc_url=None,
    )

    # Starlette runs middleware in reverse registration order, so the last one
    # added runs first. RequestContext must be outermost: everything logs through it.
    app.add_middleware(GZipMiddleware, minimum_size=1000)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(GuestSessionMiddleware)
    app.add_middleware(MetricsMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
        max_age=3600,
    )
    app.add_middleware(RequestContextMiddleware)

    register_exception_handlers(app)

    for router in _routers():
        app.include_router(router)

    modules = list(settings.enabled_modules)

    @app.get("/health", tags=["ops"])
    async def health() -> dict:
        """Liveness. Dependency-free and always 200, so a database blip cannot
        make the platform kill a healthy container."""
        return {
            "status": "healthy",
            "service": settings.service_name,
            "version": settings.version,
            "modules": modules,
        }

    @app.get("/ready", tags=["ops"])
    async def ready() -> dict:
        """Readiness. Reports dependency health for dashboards and alerts."""
        database_ok = await check_database()
        return {
            "status": "ready" if database_ok else "degraded",
            "database": "ok" if database_ok else "error",
            "redis": await check_redis(),
            "modules": modules,
        }

    app.add_route("/metrics", metrics_endpoint, methods=["GET"], include_in_schema=False)
    return app


app = create_app()
