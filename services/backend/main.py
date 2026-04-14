from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from contextlib import asynccontextmanager

from api import graph_routes, seed_routes, ingest_routes, simulation_routes, analytics_routes, volunteer_routes
from services.neo4j_service import neo4j_service

load_dotenv()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup logic: Initialize Neo4j schema
    await neo4j_service.initialize_schema()
    yield
    # Shutdown logic: Close Neo4j driver
    await neo4j_service.close_driver()

app = FastAPI(
    title="Synapse AI Backend",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "ok", "service": "synapse-backend"}

app.include_router(graph_routes.router, prefix="/api/graph", tags=["Graph"])
app.include_router(seed_routes.router, prefix="/api/seed", tags=["Seed"])
app.include_router(ingest_routes.router, prefix="/api/ingest", tags=["Ingest"])
app.include_router(simulation_routes.router, prefix="/api/sim",        tags=["Simulation"])
app.include_router(analytics_routes.router,  prefix="/api/analytics",  tags=["Analytics"])
app.include_router(volunteer_routes.router,  prefix="/api/volunteers",  tags=["Volunteers"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
