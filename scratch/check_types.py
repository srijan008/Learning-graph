import asyncio
from sqlalchemy import text
from db.postgres_client import engine

async def check_types():
    async with engine.connect() as conn:
        tables = [
            'chapters', 'curriculum_topics', 'curriculum_subtopics', 
            'curriculum_chunks', 'curriculums', 'tutor_chat_sessions', 
            'user_subtopic_progress', 'learning_journeys', 'journey_topic_nodes'
        ]
        for table in tables:
            print(f"\nChecking types for '{table}' table...")
            res = await conn.execute(text(f"""
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = '{table}' AND table_schema = 'ai-books'
            """))
            rows = res.mappings().all()
            if not rows:
                # Try public schema if ai-books is empty for some
                res = await conn.execute(text(f"""
                    SELECT column_name, data_type 
                    FROM information_schema.columns 
                    WHERE table_name = '{table}' AND table_schema = 'public'
                """))
                rows = res.mappings().all()
                print(f"(Found in 'public' schema)")
            
            for r in rows:
                if 'id' in r['column_name'].lower():
                    print(f"Column: {r}")

if __name__ == "__main__":
    asyncio.run(check_types())
