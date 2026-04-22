import json
import asyncio
from db.postgres_client import engine
from db.postgres_models import Chapter
from sqlalchemy import select

async def verify():
    # 1. Load sample from JSON
    with open('neet_examside_data_mapped_v6.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
        json_sample = data[0]
        print(f"JSON Sample: {json_sample.get('pdf_name')} | {json_sample.get('chapter_name')}")

    # 2. Check DB
    async with engine.connect() as conn:
        res = await conn.execute(
            select(Chapter.chapter_id, Chapter.pdf_name, Chapter.chapter_name)
            .where(Chapter.pdf_name == json_sample.get('pdf_name'))
            .limit(1)
        )
        row = res.fetchone()
        if row:
            print(f"DB Match: {row.pdf_name} | {row.chapter_name} (ID: {row.chapter_id})")
        else:
            print("No match found in DB for JSON pdf_name")

if __name__ == "__main__":
    asyncio.run(verify())
