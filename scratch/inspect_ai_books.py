import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def inspect_ai_books():
    db_url = "postgresql+asyncpg://27972d2a8c515ff617f5bbafad9a78288dff00de1fc91d7037cb95b86fd7e4d9:sk_fDUbFYzHOi3yKNR8ZJasC@db.prisma.io:5432/postgres"
    engine = create_async_engine(db_url)
    
    tables = [
        "curriculums",
        "curriculum_subjects",
        "chapters",
        "curriculum_topics",
        "curriculum_subtopics",
        "curriculum_chunks"
    ]
    
    async with engine.connect() as conn:
        print(f"Inspecting 'ai-books' schema...")
        for table in tables:
            print(f"\nTable: {table}")
            try:
                col_res = await conn.execute(text(f"""
                    SELECT column_name, data_type 
                    FROM information_schema.columns 
                    WHERE table_schema = 'ai-books' AND table_name = '{table}'
                    ORDER BY ordinal_position
                """))
                cols = col_res.fetchall()
                if not cols:
                    print("  (No columns found or table doesn't exist)")
                for col_name, data_type in cols:
                    print(f"  - {col_name} ({data_type})")
            except Exception as e:
                print(f"  Error: {e}")

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(inspect_ai_books())
