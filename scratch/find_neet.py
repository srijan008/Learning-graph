import asyncio
import os
from sqlalchemy import text
from db.postgres_client import engine

async def find_neet():
    async with engine.connect() as conn:
        print("Searching for NEET chapters...")
        res = await conn.execute(text('SELECT chapter_id, chapter_name, pdf_name FROM "ai-books".chapters WHERE pdf_name ILIKE \'%neet%\' LIMIT 20'))
        rows = res.mappings().all()
        if not rows:
            print("No NEET chapters found!")
        for r in rows:
            print(f"Chapter: {r}")

if __name__ == "__main__":
    asyncio.run(find_neet())
