import os
import asyncio
from qdrant_client import AsyncQdrantClient, models
from dotenv import load_dotenv

load_dotenv()

async def create_indexes():
    QDRANT_API_KEY = os.getenv("QDRANT_API_KEY", "")
    QDRANT_HOST = os.getenv("QDRANT_HOST", "")
    
    # Use HTTPS since the main app does
    client = AsyncQdrantClient(
        url=f"https://{QDRANT_HOST}",
        api_key=QDRANT_API_KEY
    )
    
    collections = ["neet_chapter_combined", "jee_chapter_combined", "Learning_Grade1-5"]
    
    for collection in collections:
        print(f"Adding index for metadata.chunk_type in {collection}...")
        try:
            # First check if index exists or just try to create it
            await client.create_payload_index(
                collection_name=collection,
                field_name="metadata.chunk_type",
                field_schema=models.PayloadSchemaType.KEYWORD,
            )
            print(f"✅ Successfully added index for {collection}")
        except Exception as e:
            if "already exists" in str(e).lower():
                print(f"ℹ️ Index already exists for {collection}")
            else:
                print(f"❌ Failed to add index for {collection}: {e}")
    
    await client.close()

if __name__ == "__main__":
    asyncio.run(create_indexes())
