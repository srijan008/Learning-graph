
import asyncio
from sqlalchemy import select
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
        for r in rows:
            topic = r[0]
            chapter = r[1]
            print(f"Topic ID: {topic.id} | Topic: {topic.title} | Chapter: {chapter.chapter_name} | PDF: {chapter.pdf_name}")
        break

if __name__ == "__main__":
    asyncio.run(main())
