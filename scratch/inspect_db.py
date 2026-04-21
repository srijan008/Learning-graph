import asyncio
import os
from sqlalchemy import text
from db.postgres_client import engine

async def inspect():
    async with engine.connect() as conn:
        print("Checking Curriculums...")
        res = await conn.execute(text('SELECT * FROM "ai-books".curriculums'))
        for r in res.mappings().all():
            print(f"Curriculum: {r}")
            
        print("\nChecking Books/Chapters sample...")
        res = await conn.execute(text('SELECT chapter_id, chapter_name, book_id, pdf_name FROM "ai-books".chapters LIMIT 10'))
        for r in res.mappings().all():
            print(f"Chapter: {r}")

if __name__ == "__main__":
    asyncio.run(inspect())
