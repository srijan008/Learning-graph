import csv
import os
from pathlib import Path
from dotenv import load_dotenv
from neo4j import GraphDatabase

# ── Load env -----------------------------------------------------------------
load_dotenv(Path(__file__).parent.parent / ".env")

URI = os.getenv("NEO4J_URI")
USER = os.getenv("NEO4J_USERNAME")
PASSWORD = os.getenv("NEO4J_PASSWORD")
DATABASE = os.getenv("NEO4J_DATABASE", "neo4j")

OUTPUT_DIR = Path(__file__).parent.parent / "output"

SUBJECTS_CSV = OUTPUT_DIR / "neet_subjects.csv"
CHAPTERS_CSV = OUTPUT_DIR / "neet_chapters.csv"
TOPICS_CSV = OUTPUT_DIR / "neet_topics.csv"
SUBTOPICS_CSV = OUTPUT_DIR / "neet_subtopics.csv"

def clear_db(session):
    print("🗑️  Clearing all content from Neo4j...")
    session.run("MATCH (n) DETACH DELETE n")

def ingest_subjects(session):
    print("📚 Ingesting subjects...")
    with open(SUBJECTS_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        batch = [row for row in reader]
        
        session.run(
            """
            UNWIND $batch AS row
            CREATE (s:Subject {id: row.id, name: row.name, order_index: toInteger(row.order_index), goal_id: row.goal_id})
            """,
            batch=batch
        )

def ingest_chapters(session):
    print("📖 Ingesting chapters and linking to subjects...")
    with open(CHAPTERS_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        batch = [row for row in reader]
        
        session.run(
            """
            UNWIND $batch AS row
            MATCH (s:Subject {id: row.subject_id})
            CREATE (s)-[:HAS_CHAPTER]->(c:Chapter {id: row.id, name: row.name, order_index: toInteger(row.order_index)})
            """,
            batch=batch
        )

def ingest_topics(session):
    print("📋 Ingesting topics and linking to chapters...")
    with open(TOPICS_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        batch = [row for row in reader]
        
        session.run(
            """
            UNWIND $batch AS row
            MATCH (c:Chapter {id: row.chapter_id})
            CREATE (c)-[:HAS_TOPIC]->(t:Topic {id: row.id, name: row.title, order_index: toInteger(row.order_index)})
            """,
            batch=batch
        )

def ingest_subtopics(session):
    print("🔬 Ingesting subtopics and linking to topics...")
    with open(SUBTOPICS_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        batch = [row for row in reader]
        
        session.run(
            """
            UNWIND $batch AS row
            MATCH (t:Topic {id: row.topic_id})
            CREATE (t)-[:HAS_SUBTOPIC]->(st:Subtopic {id: row.id, title: row.title, order_index: toInteger(row.order_index)})
            """,
            batch=batch
        )

def establish_topic_sequence(session):
    print("🔗 Establishing NEXT/PREVIOUS topic relationships...")
    result = session.run(
        """
        MATCH (s:Subject)-[:HAS_CHAPTER]->(c:Chapter)-[:HAS_TOPIC]->(t:Topic)
        RETURN t.id AS id
        ORDER BY s.order_index, c.order_index, t.order_index
        """
    )
    topic_ids = [record["id"] for record in result]
    
    batch = [{"id1": topic_ids[i], "id2": topic_ids[i+1]} for i in range(len(topic_ids) - 1)]
    
    session.run(
        """
        UNWIND $batch AS row
        MATCH (t1:Topic {id: row.id1}), (t2:Topic {id: row.id2})
        CREATE (t1)-[:NEXT]->(t2)
        CREATE (t2)-[:PREVIOUS]->(t1)
        """,
        batch=batch
    )

def create_constraints(session):
    print("⚙️  Creating constraints...")
    session.run("CREATE CONSTRAINT subject_id_unique IF NOT EXISTS FOR (s:Subject) REQUIRE s.id IS UNIQUE")
    session.run("CREATE CONSTRAINT chapter_id_unique IF NOT EXISTS FOR (c:Chapter) REQUIRE c.id IS UNIQUE")
    session.run("CREATE CONSTRAINT topic_id_unique IF NOT EXISTS FOR (t:Topic) REQUIRE t.id IS UNIQUE")
    session.run("CREATE CONSTRAINT subtopic_id_unique IF NOT EXISTS FOR (st:Subtopic) REQUIRE st.id IS UNIQUE")

def main():
    driver = GraphDatabase.driver(URI, auth=(USER, PASSWORD))
    try:
        driver.verify_connectivity()
        print("✅ Connected to Neo4j.")
        
        with driver.session(database=DATABASE) as session:
            clear_db(session)
            create_constraints(session)
            ingest_subjects(session)
            ingest_chapters(session)
            ingest_topics(session)
            ingest_subtopics(session)
            establish_topic_sequence(session)
            
        print("🎉 Ingestion complete!")
    except Exception as e:
        print(f"❌ Error during ingestion: {e}")
    finally:
        driver.close()

if __name__ == "__main__":
    main()
