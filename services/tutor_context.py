"""
tutor_context.py
================
Retrieves relevant textbook chunks for a given subtopic to provide
context for the AI Tutor.
"""
import json
import os
import asyncio
from pathlib import Path
from typing import List, Dict, Any, Optional

from db.qdrant_client import client as qdrant_client
from qdrant_client import models
from db.redis_client import redis_client

# Collection name for physics textbook chunks
PH_COLLECTION = "physics_textbook"

# Redis key template
REDIS_CONTEXT_KEY = "tutor:context:{}"

# Path to the mapped chunks JSON (as a fallback)
MAPPED_CHUNKS_PATH = Path("physics_mapped_chunks.json")

# Global cache for the JSON fallback
_SUBTOPIC_INDEX: Dict[str, List[Dict[str, Any]]] = {}
_LAST_LOAD_TIME = 0

def load_context_index():
    """Lazily load and index the mapped chunks by subtopic_id (JSON Fallback)."""
    global _SUBTOPIC_INDEX, _LAST_LOAD_TIME
    
    if not MAPPED_CHUNKS_PATH.exists():
        return {}

    mtime = os.path.getmtime(MAPPED_CHUNKS_PATH)
    if _SUBTOPIC_INDEX and mtime <= _LAST_LOAD_TIME:
        return _SUBTOPIC_INDEX

    try:
        with open(MAPPED_CHUNKS_PATH, "r", encoding="utf-8") as f:
            chunks = json.load(f)
        
        new_index = {}
        for c in chunks:
            sid = c.get("subtopic_id")
            if sid:
                if sid not in new_index:
                    new_index[sid] = []
                new_index[sid].append({
                    "content": c.get("content", ""),
                    "section": (c.get("metadata") or {}).get("section_name", ""),
                    "confidence": c.get("match_confidence", "low")
                })
        
        _SUBTOPIC_INDEX = new_index
        _LAST_LOAD_TIME = mtime
    except Exception:
        pass
    
    return _SUBTOPIC_INDEX

async def prefetch_topic_context(topic_id: str, session_id: str):
    """
    Fetches ALL textbook chunks for a topic from Qdrant and caches them in Redis.
    Serialized as a JSON map: {subtopic_id: [chunks]}
    """
    try:
        # Search Qdrant for all points matching this topic_id
        # Note: We use scroll because we want all points, not just top N similarities
        res = await qdrant_client.scroll(
            collection_name=PH_COLLECTION,
            scroll_filter=models.Filter(
                must=[
                    models.FieldCondition(key="topic_id", match=models.MatchValue(value=topic_id))
                ]
            ),
            limit=500 # Adjust if topics have more than 500 chunks
        )
        points, _ = res
        
        mapping = {}
        for p in points:
            payload = p.payload or {}
            sid = payload.get("subtopic_id")
            if not sid: continue
            
            if sid not in mapping:
                mapping[sid] = []
            
            meta = payload.get("metadata", {})
            mapping[sid].append({
                "content": payload.get("content", ""),
                "section": meta.get("section_name", ""),
                "confidence": payload.get("match_confidence", "high")
            })
            
        # Store in Redis with 24h TTL
        key = REDIS_CONTEXT_KEY.format(session_id)
        await redis_client.set(key, json.dumps(mapping), ex=86400)
        print(f"🚀 Prefetched {len(points)} chunks for session {session_id} into Redis.")
        return mapping
    except Exception as e:
        print(f"❌ Prefetch failed for topic {topic_id}: {e}")
        return None

async def get_subtopic_context(subtopic_id: str, session_id: str, topic_id: Optional[str] = None, max_chunks: int = 5) -> str:
    """
    Returns a formatted string of textbook snippets for the given subtopic.
    Reads from Redis cache; falls back to Qdrant/JSON if cache is miss.
    """
    chunks = []
    
    # 1. Try Redis Cache
    key = REDIS_CONTEXT_KEY.format(session_id)
    cached_data = await redis_client.get(key)
    
    if cached_data:
        mapping = json.loads(cached_data)
        chunks = mapping.get(subtopic_id, [])
    
    # 2. Cache Miss: Fallback to Qdrant (and trigger background prefetch if topic_id provided)
    if not chunks:
        if topic_id:
            # Re-run prefetch to fix the cache for next time
            mapping = await prefetch_topic_context(topic_id, session_id)
            if mapping:
                chunks = mapping.get(subtopic_id, [])
        
        # If still no chunks (or no topic_id provided), try single Qdrant scroll for this subtopic
        if not chunks:
            try:
                res = await qdrant_client.scroll(
                    collection_name=PH_COLLECTION,
                    scroll_filter=models.Filter(
                        must=[
                            models.FieldCondition(key="subtopic_id", match=models.MatchValue(value=subtopic_id))
                        ]
                    ),
                    limit=max_chunks
                )
                points, _ = res
                for p in points:
                    payload = p.payload or {}
                    meta = payload.get("metadata", {})
                    chunks.append({
                        "content": payload.get("content", ""),
                        "section": meta.get("section_name", ""),
                        "confidence": payload.get("match_confidence", "high")
                    })
            except Exception as e:
                print(f"⚠️ Qdrant context retrieval failed: {e}")

    # 3. Last Resort: Local JSON
    if not chunks:
        index = load_context_index()
        chunks = index.get(subtopic_id, [])
    
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
        # Last Resort: Minimal local JSON
        index = load_context_index()
        if not index:
            return "[No textbook content available for this topic.]"
        mapping = index

    # Format the entire mapping
    output_lines = []
    # Sort subtopics by name if possible, or just ID
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