import asyncio
import json
from db.postgres_client import get_pg_session
from db.postgres_models import Chapter
from sqlalchemy import select

async def main():
    async for db in get_pg_session():
        res = await db.execute(select(Chapter.chapter_summary).where(Chapter.chapter_summary.is_not(None)).limit(1))
        summary = res.scalars().first()
        if summary:
            print("Keys:", summary.keys())
            # Safely print a snippet
            for k, v in summary.items():
                print(f"{k}: {type(v)}")
        else:
            print("No summary found")
        break

if __name__ == "__main__":
    asyncio.run(main())
