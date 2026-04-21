"""
Neo4j driver singleton.
Reads credentials from .env and provides a session helper.
"""
from contextlib import contextmanager
from pathlib import Path

from dotenv import load_dotenv
from neo4j import GraphDatabase
import os

# Load .env from the project root (learning-graph/)
env_path = Path(__file__).parent.parent / ".env"
loaded = load_dotenv(env_path)

NEO4J_URI = os.getenv("NEO4J_URI")
NEO4J_USERNAME = os.getenv("NEO4J_USERNAME")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD")
NEO4J_DATABASE = os.getenv("NEO4J_DATABASE", "neo4j")

if not all([NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD]):
    print(f"[DEBUG] Failed to load Neo4j credentials.")
    print(f"[DEBUG] .env path: {env_path.resolve()}")
    print(f"[DEBUG] .env exists: {env_path.exists()}")
    print(f"[DEBUG] load_dotenv result: {loaded}")
    raise EnvironmentError(
        "Missing Neo4j credentials. Check NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD in .env"
    )

driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USERNAME, NEO4J_PASSWORD))


@contextmanager
def get_session():
    """Yield a Neo4j session, always close it after use."""
    session = driver.session(database=NEO4J_DATABASE)
    try:
        yield session
    finally:
        session.close()


def verify_connectivity():
    """Ping Neo4j — raises an exception if unreachable."""
    driver.verify_connectivity()
