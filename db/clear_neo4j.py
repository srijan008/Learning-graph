import os
from pathlib import Path
from dotenv import load_dotenv
from neo4j import GraphDatabase

# Load env
load_dotenv(Path(__file__).parent.parent / ".env")

URI = os.getenv("NEO4J_URI")
USER = os.getenv("NEO4J_USERNAME")
PASSWORD = os.getenv("NEO4J_PASSWORD")
DATABASE = os.getenv("NEO4J_DATABASE", "neo4j")

def clear_neo4j():
    if not URI:
        print("Error: NEO4J_URI not found.")
        return

    print("Connecting to Neo4j to clear content...")
    driver = GraphDatabase.driver(URI, auth=(USER, PASSWORD))
    try:
        driver.verify_connectivity()
        with driver.session(database=DATABASE) as session:
            print("🗑️  Clearing all nodes and relationships from Neo4j...")
            session.run("MATCH (n) DETACH DELETE n")
            print("✅ Successfully cleared Neo4j.")
    except Exception as e:
        print(f"❌ Error clearing Neo4j: {e}")
    finally:
        driver.close()

if __name__ == "__main__":
    clear_neo4j()
