"""
Seed Neo4j from the CSV files in data/.
Run this once:  python -m db.seed

Uses MERGE so it is idempotent — safe to re-run at any time.
"""
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

DATA_DIR = Path(__file__).parent.parent / "data"

TOPICS_CSV = DATA_DIR / "class10_physics_topics.csv"
PREREQS_CSV = DATA_DIR / "class10_physics_prerequisites.csv"
SUBTOPICS_CSV = DATA_DIR / "class10_physics_subtopics.csv"


# ── Helpers ------------------------------------------------------------------

def _to_float(val: str) -> float | None:
    try:
        return float(val) if val.strip() else None
    except ValueError:
        return None


def seed_topics(session) -> int:
    """Create / update Topic nodes from topics CSV."""
    count = 0
    with open(TOPICS_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            topic_id = row["topic_id"].strip()
            if not topic_id:
                continue

            session.run(
                """
                MERGE (t:Topic {topic_id: $topic_id})
                SET t.name              = $name,
                    t.subject           = $subject,
                    t.level             = $level,
                    t.chapter           = $chapter,
                    t.description       = $description,
                    t.difficulty        = $difficulty,
                    t.estimated_hours   = $estimated_hours,
                    t.parent_topic      = $parent_topic
                """,
                topic_id=topic_id,
                name=row["name"].strip(),
                subject=row.get("subject", "").strip(),
                level=row.get("level", "").strip(),
                chapter=row.get("chapter", "").strip(),
                description=row.get("description", "").strip(),
                difficulty=_to_float(row.get("difficulty", "")),
                estimated_hours=_to_float(row.get("estimated_hours", "")),
                parent_topic=row.get("parent_topic", "").strip() or None,
            )
            count += 1
    return count


def seed_prerequisites(session) -> int:
    """Create REQUIRES relationships from prerequisites CSV."""
    count = 0
    with open(PREREQS_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            src = row["source_topic"].strip()
            tgt = row["target_topic"].strip()
            if not src or not tgt:
                continue

            session.run(
                """
                MATCH (src:Topic {topic_id: $src})
                MATCH (tgt:Topic {topic_id: $tgt})
                MERGE (src)-[:REQUIRES]->(tgt)
                """,
                src=src,
                tgt=tgt,
            )
            count += 1
    return count


def seed_subtopics(session) -> int:
    """Create HAS_SUBTOPIC relationships from subtopics CSV."""
    count = 0
    with open(SUBTOPICS_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            parent = row["parent_topic"].strip()
            child = row["child_topic"].strip()
            if not parent or not child:
                continue

            session.run(
                """
                MATCH (p:Topic {topic_id: $parent})
                MATCH (c:Topic {topic_id: $child})
                MERGE (p)-[:HAS_SUBTOPIC]->(c)
                """,
                parent=parent,
                child=child,
            )
            count += 1
    return count


# ── Constraint (unique index on topic_id) ------------------------------------

def create_constraint(session):
    session.run(
        "CREATE CONSTRAINT topic_id_unique IF NOT EXISTS "
        "FOR (t:Topic) REQUIRE t.topic_id IS UNIQUE"
    )


# ── Entry point ---------------------------------------------------------------

def main():
    driver = GraphDatabase.driver(URI, auth=(USER, PASSWORD))
    try:
        driver.verify_connectivity()
        print("✅  Connected to Neo4j.")

        with driver.session(database=DATABASE) as session:
            print("Creating uniqueness constraint...")
            create_constraint(session)

            print("Seeding topics...")
            n = seed_topics(session)
            print(f"   → {n} topic nodes merged.")

            print("Seeding REQUIRES relationships...")
            n = seed_prerequisites(session)
            print(f"   → {n} REQUIRES relationships merged.")

            print("Seeding HAS_SUBTOPIC relationships...")
            n = seed_subtopics(session)
            print(f"   → {n} HAS_SUBTOPIC relationships merged.")

        print("✅  Seed complete.")
    finally:
        driver.close()


if __name__ == "__main__":
    main()
