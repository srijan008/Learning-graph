"""Create test system tables using asyncpg engine."""
import asyncio
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from db.postgres_client import engine
from db.postgres_models import Base, TestSession, TestReport, PracticeRecommendation

async def create_tables():
    print("Creating test system tables...")
    async with engine.begin() as conn:
        await conn.run_sync(
            Base.metadata.create_all,
            tables=[
                TestSession.__table__,
                TestReport.__table__,
                PracticeRecommendation.__table__,
            ]
        )
    print("[OK] Tables created: test_sessions, test_reports, practice_recommendations")

asyncio.run(create_tables())
