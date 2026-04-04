import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
SCHEMA = '"neet-books"'

def clear_postgres():
    if not DATABASE_URL:
        print("Error: DATABASE_URL not found.")
        return

    print(f"Connecting to Postgres to clear {SCHEMA} content...")
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    try:
        cur.execute(f"TRUNCATE TABLE {SCHEMA}.subtopics, {SCHEMA}.topics, {SCHEMA}.chapters, {SCHEMA}.subjects CASCADE;")
        conn.commit()
        print(f"✅ Successfully cleared all tables in {SCHEMA}.")
    except Exception as e:
        conn.rollback()
        print(f"❌ Error clearing tables: {e}")
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    clear_postgres()
