import os
import csv
import psycopg2
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
SCHEMA = '"neet-books"'

def setup_schema(cur):
    """Create schema and tables if they don't exist."""
    print(f"Ensuring schema {SCHEMA} exists...")
    cur.execute(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA};")
    
    print(f"Ensuring tables exist in {SCHEMA}...")
    
    # Create subjects table
    cur.execute(f"CREATE TABLE IF NOT EXISTS {SCHEMA}.subjects (id UUID PRIMARY KEY, name TEXT NOT NULL, goal_id UUID);")
    cur.execute(f"CREATE TABLE IF NOT EXISTS {SCHEMA}.chapters (id UUID PRIMARY KEY, name TEXT NOT NULL, order_index INT4, subject_id UUID REFERENCES {SCHEMA}.subjects(id));")
    cur.execute(f"CREATE TABLE IF NOT EXISTS {SCHEMA}.topics (id UUID PRIMARY KEY, title TEXT NOT NULL, chapter_id UUID REFERENCES {SCHEMA}.chapters(id), order_index INT4);")
    cur.execute(f"CREATE TABLE IF NOT EXISTS {SCHEMA}.subtopics (id UUID PRIMARY KEY, title TEXT NOT NULL, topic_id UUID REFERENCES {SCHEMA}.topics(id), order_index INT4);")

    print(f"Truncating tables in {SCHEMA}...")
    cur.execute(f"TRUNCATE TABLE {SCHEMA}.subtopics, {SCHEMA}.topics, {SCHEMA}.chapters, {SCHEMA}.subjects CASCADE;")
    
    # Proceed to push


    cur.execute(f"""
    CREATE TABLE IF NOT EXISTS {SCHEMA}.subjects (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        goal_id UUID
    );
    """)

    # Create chapters table
    cur.execute(f"""
    CREATE TABLE IF NOT EXISTS {SCHEMA}.chapters (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        order_index INT4,
        subject_id UUID REFERENCES {SCHEMA}.subjects(id)
    );
    """)

    # Create topics table
    cur.execute(f"""
    CREATE TABLE IF NOT EXISTS {SCHEMA}.topics (
        id UUID PRIMARY KEY,
        title TEXT NOT NULL,
        chapter_id UUID REFERENCES {SCHEMA}.chapters(id),
        order_index INT4
    );
    """)

    # Create subtopics table
    cur.execute(f"""
    CREATE TABLE IF NOT EXISTS {SCHEMA}.subtopics (
        id UUID PRIMARY KEY,
        title TEXT NOT NULL,
        topic_id UUID REFERENCES {SCHEMA}.topics(id),
        order_index INT4
    );
    """)

def push_csv_to_table(cur, csv_file, table_name, columns):
    if not os.path.exists(csv_file):
        print(f"Warning: {csv_file} not found. Skipping.")
        return

    print(f"Pushing {csv_file} to {SCHEMA}.{table_name}...")
    with open(csv_file, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            col_names = ", ".join(columns)
            placeholders = ", ".join(["%s"] * len(columns))
            # Convert empty strings to None for proper NULL insertion in Postgres
            values = [row[c] if row[c] != "" else None for c in columns]
            
            query = f"INSERT INTO {SCHEMA}.{table_name} ({col_names}) VALUES ({placeholders}) ON CONFLICT (id) DO NOTHING"
            cur.execute(query, values)

def main():
    if not DATABASE_URL:
        print("Error: DATABASE_URL not found in .env")
        return

    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = True
    
    try:
        with conn.cursor() as cur:
            # Create schema and tables
            setup_schema(cur)
            
            # Push in order of dependencies
            push_csv_to_table(cur, "neet_subjects.csv", "subjects", ["id", "name", "goal_id"])
            push_csv_to_table(cur, "neet_chapters.csv", "chapters", ["id", "name", "order_index", "subject_id"])
            push_csv_to_table(cur, "neet_topics.csv", "topics", ["id", "title", "chapter_id", "order_index"])
            push_csv_to_table(cur, "neet_subtopics.csv", "subtopics", ["id", "title", "topic_id", "order_index"])
            
            print("Successfully pushed all data to Postgres.")
            
    except Exception as e:
        print(f"Error during push: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    main()
