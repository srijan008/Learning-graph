"""
Graph router — neighbour-node queries against Neo4j.

Endpoints
---------
POST /graph/neighbours   → main neighbour lookup
GET  /graph/topics       → list all topics (for autocomplete / debugging)
GET  /graph/topic/{id}   → single topic detail
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession

from db.postgres_client import engine, get_pg_session
from db.postgres_models import Chapter, CurriculumTopic, CurriculumSubtopic, Curriculum
from models.schemas import NeighboursRequest, NeighboursResponse, TopicNode, SequenceResponse
from sqlalchemy import select, and_, or_, any_

router = APIRouter(prefix="/graph", tags=["graph"])


# ── Helpers ------------------------------------------------------------------

def _derive_metadata(pdf_name: str) -> dict:
    """Derive subject, class, and curriculum from pdf_name."""
    if not pdf_name:
        return {"subject": "General", "class": "Other"}
    
    name = pdf_name.lower()
    # Class: l = 12, k = 11
    class_level = "12" if name.startswith('l') else ("11" if name.startswith('k') else "Other")
    
    # Subject
    subject = "Other"
    if "physics" in name: subject = "Physics"
    elif "chemistry" in name: subject = "Chemistry"
    elif "biology" in name: subject = "Biology"
    elif "zoology" in name: subject = "Zoology"
    elif "botany" in name: subject = "Botany"
    
    return {"subject": subject, "class": class_level}


def _model_to_topic(topic: CurriculumTopic, chapter: Chapter = None) -> TopicNode:
    """Convert a CurriculumTopic model to a TopicNode schema."""
    meta = _derive_metadata(chapter.pdf_name if chapter else "")
    
    return TopicNode(
        topic_id=str(topic.id),
        name=topic.title,
        level=None, # TBD
        subject=meta["subject"],
        chapter=chapter.chapter_name if chapter else None,
        difficulty=None,
        estimated_hours=None,
        description=None,
        order_index=topic.order_index,
    )


def _resolve_node(session, identifier: str):
    """
    Find a Topic or Subtopic node by id (exact) or name (case-insensitive).
    Returns a dictionary of node data augmented with subject/chapter, or None.
    """
    result = session.run(
        """
        MATCH (t)
        WHERE (t:Topic OR t:Subtopic) 
          AND (t.id = $id OR t.topic_id = $id 
               OR toLower(t.name) = toLower($id) 
               OR toLower(t.title) = toLower($id))
        OPTIONAL MATCH (s:Subject)-[:HAS_CHAPTER]->(c:Chapter)-[:HAS_TOPIC]->(top:Topic)
        WHERE top = t OR (top)-[:HAS_SUBTOPIC]->(t)
        RETURN t, s.name AS subject, c.name AS chapter
        LIMIT 1
        """,
        id=identifier,
    )
    record = result.single()
    if not record:
        return None
        
    node = record["t"]
    node_data = dict(node)
    if record["subject"]:
        node_data["subject"] = record["subject"]
    if record["chapter"]:
        node_data["chapter"] = record["chapter"]
    return node_data


def _fetch_neighbours(session, topic_id: str, include: list[str], limit: int) -> dict:
    """
    Fetch only the requested neighbour types for a topic_id.
    Results for each list are capped at `limit`.
    """
    want = set(include)

    # Build OPTIONAL MATCH clauses based on current graph structure
    pre_clause    = "OPTIONAL MATCH (t)-[:REQUIRES]->(pre:Topic)"    if "prerequisites" in want else ""
    child_clause  = "OPTIONAL MATCH (t)-[:HAS_SUBTOPIC]->(child)"     if "subtopics"    in want else ""
    parent_clause = "OPTIONAL MATCH (parent)-[:HAS_TOPIC|HAS_SUBTOPIC]->(t)" if "parent"    in want else ""
    unlock_clause = "OPTIONAL MATCH (unlock:Topic)-[:REQUIRES]->(t)"  if "unlocks"       in want else ""
    next_clause   = "OPTIONAL MATCH (t)-[:NEXT]->(nxt:Topic)"         if "next"          in want else ""
    prev_clause   = "OPTIONAL MATCH (t)-[:PREVIOUS]->(prev:Topic)"    if "previous"      in want else ""

    cypher = f"""
        MATCH (t)
        WHERE t.id = $tid OR t.topic_id = $tid
        {pre_clause}
        {child_clause}
        {parent_clause}
        {unlock_clause}
        {next_clause}
        {prev_clause}
        RETURN
            collect(DISTINCT pre)    AS prerequisites,
            collect(DISTINCT child)  AS subtopics,
            parent,
            collect(DISTINCT unlock) AS unlocks,
            collect(DISTINCT nxt)    AS next,
            collect(DISTINCT prev)   AS previous
    """
    result = session.run(cypher, tid=topic_id)
    record = result.single()
    if record is None:
        return {"prerequisites": [], "subtopics": [], "parent": None, "unlocks": [], "next": [], "previous": []}

    def _pick(key):
        """Convert nodes and apply limit."""
        return [_row_to_topic(n) for n in record[key] if n][:limit]

    return {
        "prerequisites": _pick("prerequisites") if "prerequisites" in want else [],
        "subtopics":     _pick("subtopics")     if "subtopics"     in want else [],
        "parent":        _row_to_topic(record["parent"]) if "parent" in want else None,
        "unlocks":       _pick("unlocks")       if "unlocks"       in want else [],
        "next":          _pick("next")          if "next"          in want else [],
        "previous":      _pick("previous")      if "previous"      in want else [],
    }


# ── Endpoints ----------------------------------------------------------------

@router.post("/neighbours", response_model=NeighboursResponse)
async def get_neighbours(req: NeighboursRequest):
    """
    Return the immediate graph neighbours of a topic via PostgreSQL.
    """
    async with engine.connect() as conn:
        # Step 1: Resolve main topic
        # Search by ID or title
        stmt = select(CurriculumTopic, Chapter).join(Chapter, CurriculumTopic.chapter_id == Chapter.chapter_id).where(
            or_(
                CurriculumTopic.id == req.topic,
                CurriculumTopic.title.ilike(req.topic)
            )
        )
        res = await conn.execute(stmt)
        row = res.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Topic '{req.topic}' not found.")
        
        main_topic, main_chapter = row
        target_node = _model_to_topic(main_topic, main_chapter)

        # Step 2: Fetch neighbours
        want = set(req.include)
        limit = req.limit or 10
        
        # Prerequisites
        prerequisites = []
        if "prerequisites" in want and main_topic.prerequisites:
            pre_stmt = select(CurriculumTopic, Chapter).join(Chapter, CurriculumTopic.chapter_id == Chapter.chapter_id).where(
                CurriculumTopic.id.in_(main_topic.prerequisites)
            ).limit(limit)
            pre_res = await conn.execute(pre_stmt)
            prerequisites = [_model_to_topic(t, c) for t, c in pre_res]

        # Subtopics
        subtopics = []
        if "subtopics" in want:
            sub_stmt = select(CurriculumSubtopic).where(
                CurriculumSubtopic.topic_id == main_topic.id
            ).order_by(CurriculumSubtopic.order_index).limit(limit)
            sub_res = await conn.execute(sub_stmt)
            subtopics = [TopicNode(topic_id=str(s.id), name=s.title, order_index=s.order_index) for s in sub_res.scalars()]

        # Unlocks (topics that have THIS topic in their prerequisites array)
        unlocks = []
        if "unlocks" in want:
            unl_stmt = select(CurriculumTopic, Chapter).join(Chapter, CurriculumTopic.chapter_id == Chapter.chapter_id).where(
                main_topic.id == any_(CurriculumTopic.prerequisites)
            ).limit(limit)
            unl_res = await conn.execute(unl_stmt)
            unlocks = [_model_to_topic(t, c) for t, c in unl_res]

        # Next/Prev in same chapter
        next_nodes = []
        if "next" in want:
            nxt_stmt = select(CurriculumTopic, Chapter).join(Chapter, CurriculumTopic.chapter_id == Chapter.chapter_id).where(
                and_(
                    CurriculumTopic.chapter_id == main_topic.chapter_id,
                    CurriculumTopic.order_index > main_topic.order_index
                )
            ).order_by(CurriculumTopic.order_index).limit(limit)
            nxt_res = await conn.execute(nxt_stmt)
            next_nodes = [_model_to_topic(t, c) for t, c in nxt_res]

        prev_nodes = []
        if "previous" in want:
            prv_stmt = select(CurriculumTopic, Chapter).join(Chapter, CurriculumTopic.chapter_id == Chapter.chapter_id).where(
                and_(
                    CurriculumTopic.chapter_id == main_topic.chapter_id,
                    CurriculumTopic.order_index < main_topic.order_index
                )
            ).order_by(CurriculumTopic.order_index.desc()).limit(limit)
            prv_res = await conn.execute(prv_stmt)
            prev_nodes = [_model_to_topic(t, c) for t, c in prv_res]

        return NeighboursResponse(
            node=target_node,
            prerequisites=prerequisites,
            subtopics=subtopics,
            parent=None, # Simplified for now
            unlocks=unlocks,
            next=next_nodes,
            previous=prev_nodes,
        )


@router.get("/topics", response_model=list[TopicNode])
def list_topics():
    """Return all Topic nodes — useful for autocomplete or debugging."""
    with get_session() as session:
        result = session.run(
            """
            MATCH (s:Subject)-[:HAS_CHAPTER]->(c:Chapter)-[:HAS_TOPIC]->(t:Topic)
            RETURN t, s.name AS subject, c.name AS chapter
            ORDER BY s.order_index, c.order_index, t.order_index, t.name
            """
        )
        topics = []
        for record in result:
            node_data = dict(record["t"])
            node_data["subject"] = record["subject"]
            node_data["chapter"] = record["chapter"]
            topics.append(_row_to_topic(node_data))
        return topics


from sqlalchemy import text
from db.postgres_client import engine
import logging

logger = logging.getLogger(__name__)

@router.get("/curriculum")
async def get_curriculum(curriculum: Optional[str] = "neet", db: AsyncSession = Depends(get_pg_session)):
    """
    Return filtered Curriculum → Subject → Class → Chapter → Topic hierarchy from PostgreSQL (ai-books).
    Defaults to NEET for performance.
    """
    # 1. Fetch Chapters and their Topics
    # We filter by curriculum pattern in pdf_name
    curr_pattern = f"%{curriculum.lower()}%" if curriculum else "%neet%"
    
    chapters_res = await db.execute(
        select(Chapter)
        .where(Chapter.pdf_name.ilike(curr_pattern))
        .order_by(Chapter.chapter_num)
    )
    chapters_list = chapters_res.scalars().all()
    # Store by string ID for the hierarchy builder
    chapters = {str(c.chapter_id): c for c in chapters_list}
    
    # Use UUID objects for the database query
    chapter_uuids = [c.chapter_id for c in chapters_list]
    if not chapter_uuids:
        return []

    topics_res = await db.execute(
        select(CurriculumTopic)
        .where(CurriculumTopic.chapter_id.in_(chapter_uuids))
        .order_by(CurriculumTopic.order_index)
    )
    topics = topics_res.scalars().all()
        
    # 2. Derive hierarchy
    hierarchy = {} # {curriculum: {subject: {class: {chapter: [topics]}}}}
    
    # Group topics by chapter
    chapter_topics = {}
    for tp in topics:
        cid = str(tp.chapter_id)
        if cid not in chapter_topics: chapter_topics[cid] = []
        chapter_topics[cid].append({"id": str(tp.id), "name": tp.title})
        
    for cid, ch in chapters.items():
        meta = _derive_metadata(ch.pdf_name)
        curr_name = "NEET" # Default for now
        sub_name = meta["subject"]
        class_name = f"Class {meta['class']}"
        
        if curr_name not in hierarchy: hierarchy[curr_name] = {}
        if sub_name not in hierarchy[curr_name]: hierarchy[curr_name][sub_name] = {}
        if class_name not in hierarchy[curr_name][sub_name]: hierarchy[curr_name][sub_name][class_name] = []
        
        hierarchy[curr_name][sub_name][class_name].append({
            "id": cid,
            "name": ch.chapter_name,
            "topics": chapter_topics.get(cid, [])
        })

    # 3. Format as nested list for frontend
    result = []
    for curr, subjects in hierarchy.items():
        curr_node = {"id": curr, "name": f"{curr} Curriculum", "subjects": []}
        for sub, classes in subjects.items():
            # Combine all chapters from all classes (11 and 12) into one subject list
            all_chapters = []
            for cls_name, chapters_list in classes.items():
                all_chapters.extend(chapters_list)
            
            # Sort chapters by name or number if needed
            all_chapters.sort(key=lambda x: x.get("name", ""))
            
            sub_node = {
                "id": sub, 
                "name": sub, 
                "chapters": all_chapters
            }
            curr_node["subjects"].append(sub_node)
        result.append(curr_node)
        
    return result

@router.get("/topic/{topic_id}/subtopics")
async def get_topic_subtopics(topic_id: str, db: AsyncSession = Depends(get_pg_session)):
    """
    Return subtopics for a given topic ID from PostgreSQL (ai-books).
    """
    res = await db.execute(
        select(CurriculumSubtopic).where(CurriculumSubtopic.topic_id == topic_id).order_by(CurriculumSubtopic.order_index)
    )
    rows = res.scalars().all()
    subtopics = [{"id": str(r.id), "name": r.title} for r in rows]
    return {"topic_id": topic_id, "subtopics": subtopics}

@router.get("/topic/{topic_id}")
async def get_topic(topic_id: str, db: AsyncSession = Depends(get_pg_session)):
    """Return a single Topic node by its ID from Postgres (ai-books)."""
    stmt = select(CurriculumTopic, Chapter).join(Chapter, CurriculumTopic.chapter_id == Chapter.chapter_id).where(CurriculumTopic.id == topic_id)
    res = await db.execute(stmt)
    row = res.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Topic not found")
    
    topic, chapter = row
    return {
        "id": str(topic.id),
        "topic_id": str(topic.id),
        "name": topic.title,
        "chapter_id": str(topic.chapter_id),
        "chapter_name": chapter.chapter_name
    }


@router.get("/topic/{topic_id}/next", response_model=SequenceResponse)
async def get_next_topics(topic_id: str, count: int = 1, db: AsyncSession = Depends(get_pg_session)):
    """Return the next `count` topics in the sequence après following topic_id (same chapter)."""
    # Resolve main topic
    main_res = await db.execute(select(CurriculumTopic, Chapter).join(Chapter, CurriculumTopic.chapter_id == Chapter.chapter_id).where(CurriculumTopic.id == topic_id))
    main = main_res.fetchone()
    if not main:
        raise HTTPException(status_code=404, detail=f"Topic '{topic_id}' not found.")
    
    m_topic, m_chapter = main
    
    # Fetch sequence
    seq_stmt = select(CurriculumTopic, Chapter).join(Chapter, CurriculumTopic.chapter_id == Chapter.chapter_id).where(
        and_(
            CurriculumTopic.chapter_id == m_topic.chapter_id,
            CurriculumTopic.order_index > m_topic.order_index
        )
    ).order_by(CurriculumTopic.order_index).limit(count)
    
    seq_res = await db.execute(seq_stmt)
    sequence = [_model_to_topic(t, c) for t, c in seq_res]
    return SequenceResponse(node=_model_to_topic(m_topic, m_chapter), sequence=sequence)

@router.get("/topic/{topic_id}/previous", response_model=SequenceResponse)
async def get_previous_topics(topic_id: str, count: int = 1, db: AsyncSession = Depends(get_pg_session)):
    """Return the previous `count` topics in the sequence before topic_id (same chapter)."""
    # Resolve main topic
    main_res = await db.execute(select(CurriculumTopic, Chapter).join(Chapter, CurriculumTopic.chapter_id == Chapter.chapter_id).where(CurriculumTopic.id == topic_id))
    main = main_res.fetchone()
    if not main:
        raise HTTPException(status_code=404, detail=f"Topic '{topic_id}' not found.")
    
    m_topic, m_chapter = main
    
    # Fetch sequence
    seq_stmt = select(CurriculumTopic, Chapter).join(Chapter, CurriculumTopic.chapter_id == Chapter.chapter_id).where(
        and_(
            CurriculumTopic.chapter_id == m_topic.chapter_id,
            CurriculumTopic.order_index < m_topic.order_index
        )
    ).order_by(CurriculumTopic.order_index.desc()).limit(count)
    
    seq_res = await db.execute(seq_stmt)
    sequence = [_model_to_topic(t, c) for t, c in seq_res]
    return SequenceResponse(node=_model_to_topic(m_topic, m_chapter), sequence=sequence)

