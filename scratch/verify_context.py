import asyncio
import os
import uuid
from services.tutor_context import prefetch_topic_context

async def verify():
    # Use the topic ID from the terminal log
    topic_id = "0a7a715e-617b-5eb2-bae7-ea3f1086a9d9"
    session_id = f"verify_{uuid.uuid4()}"
    
    print(f"Testing prefetch for topic {topic_id}...")
    mapping = await prefetch_topic_context(topic_id, session_id)
    
    if mapping:
        print(f"Success! Found {len(mapping)} subtopics with context.")
        for sid, chunks in list(mapping.items())[:1]:
            print(f"Sample Subtopic {sid}: {len(chunks)} chunks.")
            if chunks:
                print(f"First chunk content preview: {chunks[0]['content'][:50]}...")
                print(f"Section: {chunks[0]['section']}")
    else:
        print("Failed to retrieve context mapping.")

if __name__ == "__main__":
    asyncio.run(verify())
