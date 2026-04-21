import asyncio
import os
from sqlalchemy import text
from db.postgres_client import engine

async def count_neet():
    async with engine.connect() as conn:
        print("Counting NEET chapters...")
        res = await conn.execute(text('SELECT count(*) FROM "ai-books".chapters WHERE pdf_name ILIKE \'%neet%\''))
        count = res.scalar()
        print(f"Count: {count}")
        
        if count > 0:
            print("Checking topics count for those chapters...")
            res_topics = await conn.execute(text("""
                SELECT count(*) 
                FROM "ai-books".curriculum_topics 
                WHERE chapter_id IN (
                    SELECT chapter_id::text FROM "ai-books".chapters WHERE pdf_name ILIKE '%neet%'
                )
            """))
            t_count = res_topics.scalar()
            print(f"Topics Count: {t_count}")

if __name__ == "__main__":
    asyncio.run(count_neet())
