"""
Learning Graph API — entry point.

Start with:
    uvicorn main:app --reload --port 8001
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI

from fastapi.middleware.cors import CORSMiddleware
from db.neo4j_client import verify_connectivity
from routers.graph import router as graph_router
from routers.learning import router as learning_router
from routers.practice import router as practice_router
from routers.dashboard import router as dashboard_router
from routers.doubts import router as doubts_router
from routers.journey import router as journey_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: verify Neo4j is reachable
    verify_connectivity()
    print("[OK] Neo4j connection verified.")
    
    # Initialize PostgreSQL tables
    from db.postgres_client import init_db
    await init_db()
    print("[OK] PostgreSQL tables initialized.")
    yield
    # Shutdown: nothing special needed (driver cleans up sessions)


app = FastAPI(
    title="Learning Graph API",
    description=(
        "Graph-based curriculum API powered by Neo4j. "
        "Given a topic (and optional subtopic) returns immediate neighbour nodes: "
        "prerequisites, subtopics, parent, and what this topic unlocks."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(graph_router, prefix="/api/v1")
app.include_router(learning_router, prefix="/api/v1")
app.include_router(practice_router, prefix="/api/v1")
app.include_router(dashboard_router, prefix="/api/v1")
app.include_router(doubts_router, prefix="/api/v1")
app.include_router(journey_router, prefix="/api/v1")


@app.get("/", tags=["health"])
def root():
    return {"status": "ok", "service": "learning-graph-api"}


@app.get("/health", tags=["health"])
def health():
    """Lightweight health check — does not hit Neo4j."""
    return {"status": "healthy"}
