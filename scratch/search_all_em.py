
import asyncio
from sqlalchemy import select, func
from db.postgres_client import get_pg_session
from db.postgres_models import CurriculumTopic, Chapter

async def main():
    async for db in get_pg_session():
        res = await db.execute(
            select(CurriculumTopic, Chapter)
            .join(Chapter, CurriculumTopic.chapter_id == Chapter.chapter_id)
            .where(CurriculumTopic.title.ilike("%Properties of Electromagnetic Waves%"))
        )
        rows = res.all()
        print(f"Found {len(rows)} matches:")
        for r in rows:
            print(f"Topic ID: {r[0].id} | Topic: {r[0].title} | Chapter: {r[1].chapter_name} | PDF: {r[1].pdf_name}")
        break

if __name__ == "__main__":
    asyncio.run(main())
