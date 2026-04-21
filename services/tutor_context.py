"""
tutor_context.py
================
Retrieves relevant textbook chunks from PostgreSQL (ai-books schema)
for a given subtopic to provide context for the AI Tutor.
"""
import json
import os
import asyncio
from pathlib import Path
from typing import List, Dict, Any, Optional

from sqlalchemy import select
from db.postgres_client import engine
from db.postgres_models import CurriculumChunk, CurriculumSubtopic
from db.redis_client import redis_client

# Redis key template
REDIS_CONTEXT_KEY = "tutor:context:{}"

async def prefetch_topic_context(topic_id: str, session_id: str):
    """
    Fetches ALL textbook chunks for a topic from PostgreSQL and caches them in Redis.
    Serialized as a JSON map: {subtopic_id: [chunks]}
    """
    from db.postgres_client import get_pg_session_direct
    try:
        async with await get_pg_session_direct() as session:
            # Join Chunks with Subtopics to filter by Topic ID
            stmt = select(CurriculumChunk).join(
                CurriculumSubtopic, 
                CurriculumChunk.subtopic_id == CurriculumSubtopic.id
            ).where(
                CurriculumSubtopic.topic_id == topic_id
            )
            
            res = await session.execute(stmt)
            chunks = res.scalars().all()
            
            mapping = {}
            for c in chunks:
                sid = str(c.subtopic_id)
                if sid not in mapping:
                    mapping[sid] = []
                
                meta = c.chunk_metadata or {}
                mapping[sid].append({
                    "content": c.content,
                    "section": meta.get("section_name", ""),
                    "confidence": "high" # PostgreSQL source is curated
                })
                
            # Store in Redis with 24h TTL
            key = REDIS_CONTEXT_KEY.format(session_id)
            await redis_client.set(key, json.dumps(mapping), ex=86400)
            print(f"🚀 Prefetched {len(chunks)} chunks for session {session_id} into Redis.")
            return mapping
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"❌ Prefetch failed for topic {topic_id}: {e}")
        return None

async def get_subtopic_context(subtopic_id: str, session_id: str, topic_id: Optional[str] = None, max_chunks: int = 5) -> str:
    """
    Returns a formatted string of textbook snippets for the given subtopic.
    Reads from Redis cache; falls back to PostgreSQL if cache is miss.
    """
    chunks = []
    
    # 1. Try Redis Cache
    key = REDIS_CONTEXT_KEY.format(session_id)
    cached_data = await redis_client.get(key)
    
    if cached_data:
        mapping = json.loads(cached_data)
        chunks = mapping.get(subtopic_id, [])
    
    # 2. Cache Miss: Fallback to PostgreSQL
    if not chunks:
        if topic_id:
            # Re-run prefetch to fix the cache for next time
            mapping = await prefetch_topic_context(topic_id, session_id)
            if mapping:
                chunks = mapping.get(subtopic_id, [])
        
        # If still no chunks (or no topic_id provided), query DB directly for this subtopic
        if not chunks:
            try:
                from db.postgres_client import get_pg_session_direct
                async with await get_pg_session_direct() as session:
                    stmt = select(CurriculumChunk).where(
                        CurriculumChunk.subtopic_id == subtopic_id
                    ).limit(max_chunks)
                    res = await session.execute(stmt)
                    for c in res.scalars().all():
                        meta = c.chunk_metadata or {}
                        chunks.append({
                            "content": c.content,
                            "section": meta.get("section_name", ""),
                            "confidence": "high"
                        })
            except Exception as e:
                print(f"⚠️ PostgreSQL context retrieval failed: {e}")

    if not chunks:
        return "[No textbook content available for this specific subtopic.]"

    selected = chunks[:max_chunks]
    lines = []
    for i, c in enumerate(selected, 1):
        section = f" ({c['section']})" if c['section'] else ""
        content = c['content'].strip()
        if content:
            lines.append(f"Snippet {i}{section}:\n{content}")
    
    return "\n\n".join(lines)

async def get_topic_context_all(session_id: str, topic_id: str, max_chunks_per_subtopic: int = 3) -> str:
    """
    Returns a formatted string of textbook snippets for ALL subtopics in the given topic.
    Uses the Redis cache populated by prefetch_topic_context.
    """
    # 1. Try Redis Cache
    key = REDIS_CONTEXT_KEY.format(session_id)
    cached_data = await redis_client.get(key)
    
    mapping = {}
    if cached_data:
        mapping = json.loads(cached_data)
    else:
        # Cache Miss: Trigger prefetch
        mapping = await prefetch_topic_context(topic_id, session_id)
    
    if not mapping:
        return "[No textbook content available for this topic.]"

    # Format the entire mapping
    output_lines = []
    for sid in sorted(mapping.keys()):
        chunks = mapping[sid]
        if not chunks: continue
        
        output_lines.append(f"### SUBTOPIC ID: {sid}")
        selected = chunks[:max_chunks_per_subtopic]
        for i, c in enumerate(selected, 1):
            section = f" ({c['section']})" if c['section'] else ""
            content = c['content'].strip()
            if content:
                output_lines.append(f"Snippet {i}{section}:\n{content}")
        output_lines.append("") # Spacer
        
    return "\n".join(output_lines) if output_lines else "[No textbook content available for this topic.]"