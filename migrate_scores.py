import asyncio
from sqlalchemy import text
from db.postgres_client import get_pg_session

async def migrate():
    print("Starting DB migration...")
    async for session in get_pg_session():
        try:
            # Add columns to user_subtopic_progress
            await session.execute(text("ALTER TABLE user_subtopic_progress ADD COLUMN IF NOT EXISTS theory_score INTEGER DEFAULT 0"))
            await session.execute(text("ALTER TABLE user_subtopic_progress ADD COLUMN IF NOT EXISTS example_score INTEGER DEFAULT 0"))
            await session.execute(text("ALTER TABLE user_subtopic_progress ADD COLUMN IF NOT EXISTS cross_question_score INTEGER DEFAULT 0"))
            
            await session.commit()
            print("Migration successful: Added mastery score columns to 'user_subtopic_progress'")
        except Exception as e:
            await session.rollback()
            print(f"Migration failed: {e}")
        break

if __name__ == "__main__":
    asyncio.run(migrate())
