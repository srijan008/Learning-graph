import os
from pathlib import Path
from dotenv import load_dotenv
from neo4j import GraphDatabase

load_dotenv(Path(__file__).parent.parent / ".env")

URI = os.getenv("NEO4J_URI")
USER = os.getenv("NEO4J_USERNAME")
PASSWORD = os.getenv("NEO4J_PASSWORD")
DATABASE = os.getenv("NEO4J_DATABASE", "neo4j")

def verify():
    driver = GraphDatabase.driver(URI, auth=(USER, PASSWORD))
    try:
        with driver.session(database=DATABASE) as session:
            res = session.run("MATCH (n:Subtopic) RETURN count(n) as count")
            cnt = res.single()["count"]
            print(f"📊 Neo4j Subtopic Count: {cnt}")
            if cnt > 0:
                print("✅ Data is present in Neo4j!")
            else:
                print("⚠️  No subtopics found in Neo4j.")
    finally:
        driver.close()

if __name__ == "__main__":
    verify()
