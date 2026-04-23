import os
import time
import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from contextlib import asynccontextmanager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger(__name__)

from api import graph_routes, seed_routes, ingest_routes, simulation_routes, analytics_routes, volunteer_routes
from api.auth_routes       import router as auth_router
from api.ngo_admin_routes  import router as ngo_router
from api.realtime_routes   import router as realtime_router
from api.vol_mgmt_routes   import router as vol_router
from api.guest_routes      import router as guest_router
from services.live_location_cache import live_location_cache
from services.neo4j_service import neo4j_service
from db.base import init_db
from utils.auth_utils import validate_jwt_config

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    validate_jwt_config()
    await live_location_cache.startup()
    await neo4j_service.initialize_schema()
    try:
        await init_db()  # create PostgreSQL tables (idempotent)
    except Exception as e:
        logger.warning(f"PostgreSQL init skipped (no DB configured?): {e}")
    yield
    # Shutdown
    await live_location_cache.shutdown()
    await neo4j_service.close_driver()


app = FastAPI(
    title="Sanchaalan Saathi Backend",
    version="2.0.0",
    lifespan=lifespan,
)

_FRONTEND_URL = os.getenv("FRONTEND_URL", "")
_extra_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        *([_FRONTEND_URL] if _FRONTEND_URL else []),
        *_extra_origins,
    ],
    allow_origin_regex=r"https?://.*",
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

from middleware.guest import GuestSessionMiddleware
app.add_middleware(GuestSessionMiddleware)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.monotonic()
    try:
        response = await call_next(request)
    except Exception as exc:
        duration = time.monotonic() - start
        logger.error(
            f"{request.method} {request.url.path} → 500 ({duration:.3f}s) UNHANDLED: {exc}"
        )
        return JSONResponse({"error": "Internal server error"}, status_code=500)
    duration = time.monotonic() - start
    level = logging.WARNING if response.status_code >= 400 else logging.INFO
    logger.log(
        level,
        f"{request.method} {request.url.path} → {response.status_code} ({duration:.3f}s)",
    )
    return response


@app.get("/health")
async def health():
    return {"status": "ok", "service": "sanchaalan-saathi-backend"}


# ── Existing intelligence routes (Neo4j / Gemini) ────────────────────────────
app.include_router(graph_routes.router,      prefix="/api/graph",      tags=["Graph"])
app.include_router(seed_routes.router,       prefix="/api/seed",       tags=["Seed"])
app.include_router(ingest_routes.router,     prefix="/api/ingest",     tags=["Ingest"])
app.include_router(simulation_routes.router, prefix="/api/sim",        tags=["Simulation"])
app.include_router(analytics_routes.router,  prefix="/api/analytics",  tags=["Analytics"])
app.include_router(volunteer_routes.router,  prefix="/api/volunteers", tags=["Volunteers"])

# ── New NGO multi-tenancy routes (PostgreSQL / JWT) ──────────────────────────
app.include_router(auth_router, prefix="/api/auth",       tags=["Auth"])
app.include_router(ngo_router,  prefix="/api/ngo",        tags=["NGO Admin"])
app.include_router(guest_router, prefix="/api",           tags=["Guest Session"])
app.include_router(realtime_router, prefix="/api/realtime", tags=["Realtime"])
app.include_router(vol_router,  prefix="/api/volunteer",  tags=["Volunteer Management"])


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
