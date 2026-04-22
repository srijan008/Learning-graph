
import asyncio
from sqlalchemy import select
from db.postgres_client import get_pg_session
from db.postgres_models import CurriculumTopic, Chapter

async def main():
    async for db in get_pg_session():
        res = await db.execute(
            select(Chapter)
            .where(Chapter.pdf_name == "kneet-physics117.pdf")
        )
        ch = res.scalars().first()
        if ch:
            print(f"Chapter: {ch.chapter_name} | PDF: {ch.pdf_name}")
            t_res = await db.execute(select(CurriculumTopic).where(CurriculumTopic.chapter_id == ch.chapter_id))
            for t in t_res.scalars():
                print(f"  - {t.title}")
        break

if __name__ == "__main__":
    asyncio.run(main())
