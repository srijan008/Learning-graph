import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from dotenv import load_dotenv

load_dotenv()

import urllib.parse as urlparse

# We need the asyncpg driver
db_url = os.getenv("DATABASE_URL", "")
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql+asyncpg://", 1)
elif db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

# Handle sslmode since asyncpg doesn't accept it as a query param directly
parsed_url = urlparse.urlparse(db_url)
query_params = urlparse.parse_qs(parsed_url.query)
ssl_mode = query_params.get("sslmode", [None])[0]

# Strip off previous workarounds and sslmode
filtered_params = {k: v for k, v in query_params.items() if k not in ("prepared_statement_cache_size", "sslmode")}
new_query = urlparse.urlencode(filtered_params, doseq=True)
db_url = urlparse.urlunparse(parsed_url._replace(query=new_query))

connect_setup = {
    "statement_cache_size": 0,
    "prepared_statement_cache_size": 0,
    "server_settings": {
        "search_path": '"ai-books",public',
        "jit": "off"
    }
}

if ssl_mode and ssl_mode != "disable":
    connect_setup["ssl"] = True

engine = create_async_engine(
    db_url, 
    echo=False,
    connect_args=connect_setup,
    pool_pre_ping=True,
    pool_recycle=3600
)

async_session_maker = async_sessionmaker(
    engine, expire_on_commit=False, class_=AsyncSession
)

async def get_pg_session():
    """Dependency for FastAPI route handlers to get a DB session."""
    async with async_session_maker() as session:
        yield session

async def get_pg_session_direct() -> AsyncSession:
    """Returns a standalone async session for use in background tasks (not a generator)."""
    return async_session_maker()

async def init_db():
    from db.postgres_models import Base
    async with engine.begin() as conn:
        # Create tables if they don't exist
        await conn.run_sync(Base.metadata.create_all)
