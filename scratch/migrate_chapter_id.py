import asyncio
from sqlalchemy import text
from db.postgres_client import engine

async def add_column():
    async with engine.connect() as conn:
        print("Checking for chapter_id column in journey_topic_nodes...")
        try:
            await conn.execute(text("ALTER TABLE journey_topic_nodes ADD COLUMN chapter_id VARCHAR;"))
            await conn.commit()
            print("Successfully added chapter_id column.")
        except Exception as e:
            if "already exists" in str(e).lower():
                print("Column already exists.")
            else:
                print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(add_column())
