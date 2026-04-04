import os
from qdrant_client import AsyncQdrantClient
from dotenv import load_dotenv

load_dotenv()

QDRANT_API_KEY = os.getenv("QDRANT_API_KEY", "")
QDRANT_HOST = os.getenv("QDRANT_HOST", "")

# Using HTTPS implicitly via URL
client = AsyncQdrantClient(
    url=f"https://{QDRANT_HOST}",
    api_key=QDRANT_API_KEY
)

async def verify_qdrant_connectivity():
    try:
        collections = await client.get_collections()
        print("✅ Qdrant connection verified.")
        print(f"Available collections: {[c.name for c in collections.collections]}")
        return True
    except Exception as e:
        print(f"❌ Qdrant connection failed: {e}")
        return False
