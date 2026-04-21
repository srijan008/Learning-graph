import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def check():
    db_url = "postgresql+asyncpg://27972d2a8c515ff617f5bbafad9a78288dff00de1fc91d7037cb95b86fd7e4d9:sk_fDUbFYzHOi3yKNR8ZJasC@db.prisma.io:5432/postgres"
    engine = create_async_engine(db_url)
    async with engine.connect() as conn:
        res = await conn.execute(text('SELECT pdf_name, chapter_name FROM "ai-books".chapters LIMIT 100'))
        for r in res.fetchall():
            print(f"{r[0]} | {r[1]}")
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(check())
