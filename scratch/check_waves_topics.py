
import asyncio
import uuid
from sqlalchemy import select
from db.postgres_client import engine
from db.postgres_models import CurriculumTopic

async def main():
    chapter_id = uuid.UUID("c7ddaef0-54c7-4aca-90af-e1c6125ea938")
    async with engine.connect() as conn:
        res = await conn.execute(select(CurriculumTopic).where(CurriculumTopic.chapter_id == chapter_id))
        rows = res.fetchall()
        print(f"Topics for Waves and Sound (kneet-physics118.pdf):")
        for r in rows:
            print(f"ID: {r.id} | Title: {r.title}")

if __name__ == "__main__":
    asyncio.run(main())
