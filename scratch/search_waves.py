
import asyncio
from sqlalchemy import select
from db.postgres_client import engine
from db.postgres_models import Chapter

async def main():
    async with engine.connect() as conn:
        res = await conn.execute(select(Chapter).where(Chapter.chapter_name.ilike("%Waves%")))
        rows = res.fetchall()
        for r in rows:
            print(f"ID: {r.chapter_id} | Name: {r.chapter_name} | PDF: {r.pdf_name}")

if __name__ == "__main__":
    asyncio.run(main())
