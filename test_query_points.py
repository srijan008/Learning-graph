import asyncio
from qdrant_client import AsyncQdrantClient
from qdrant_client.http import models

async def main():
    client = AsyncQdrantClient(url="http://localhost:6333")
    # Just a test call to see if it even initializes or shows signature info if I can
    try:
        # This will fail because no server at localhost:6333, but I want to see if it's callable
        await client.query_points(collection_name="test", query=[0.1]*1536)
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
