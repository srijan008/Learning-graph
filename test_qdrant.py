
import asyncio
from db.qdrant_client import client as qdrant_client
from qdrant_client import models

async def check_qdrant():
    collection = "neet_chapter_combined"
    print(f"Checking collection: {collection}")
    try:
        # Check subtopic_id filter
        res = await qdrant_client.scroll(
            collection_name=collection,
            scroll_filter=models.Filter(
                should=[
                    models.FieldCondition(key="metadata.subtopic_id", match=models.MatchValue(value="687c94dc-2872-4e65-bdf1-ffc14b315592")),
                    models.FieldCondition(key="metadata.topic_id", match=models.MatchValue(value="687c94dc-2872-4e65-bdf1-ffc14b315592")),
                ]
            ),
            limit=5
        )
        points, _ = res
        print(f"Scroll results (by ID): {len(points)}")
        for p in points:
            print(f"- ID: {p.id}")
            print(f"  Content snippet: {str(p.payload.get('content'))[:100]}")
            
        # Check total points
        info = await qdrant_client.get_collection(collection_name=collection)
        print(f"Total points in collection: {info.points_count}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(check_qdrant())
