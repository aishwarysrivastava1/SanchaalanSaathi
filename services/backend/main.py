import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from contextlib import asynccontextmanager

from api import graph_routes, seed_routes, ingest_routes, simulation_routes, analytics_routes, volunteer_routes
from api.auth_routes       import router as auth_router
from api.ngo_admin_routes  import router as ngo_router
from api.vol_mgmt_routes   import router as vol_router
from services.neo4j_service import neo4j_service
from db.base import init_db

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await neo4j_service.initialize_schema()
    try:
        await init_db()  # create PostgreSQL tables (idempotent)
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"PostgreSQL init skipped (no DB configured?): {e}")
    yield
    # Shutdown
    await neo4j_service.close_driver()


app = FastAPI(
    title="SynapseAI Backend",
    version="2.0.0",
    lifespan=lifespan,
)

_FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        _FRONTEND_URL,
    ],
    # Covers Vercel preview deployments and Railway apps without wildcarding all origins
    allow_origin_regex=r"https://[a-z0-9\-]+(\.vercel\.app|\.railway\.app)",
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "synapse-ai-backend"}


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
app.include_router(vol_router,  prefix="/api/volunteer",  tags=["Volunteer Management"])


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
