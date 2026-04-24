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
from db.postgres_models import Chapter, CurriculumTopic, CurriculumSubtopic, Curriculum, UserTopicSketch
from models.schemas import NeighboursRequest, NeighboursResponse, TopicNode, SequenceResponse, InfographicRequest
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

from functools import lru_cache

# Simple global cache to avoid redundant DB queries for the static curriculum
CURRICULUM_CACHE = {}

@router.get("/curriculum")
async def get_curriculum(curriculum: Optional[str] = "neet", db: AsyncSession = Depends(get_pg_session)):
    """
    Return filtered Curriculum → Subject → Class → Chapter → Topic hierarchy from PostgreSQL (ai-books).
    Defaults to NEET for performance.
    """
    curr_key = curriculum.lower() if curriculum else "neet"
    if curr_key in CURRICULUM_CACHE:
        return CURRICULUM_CACHE[curr_key]
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
            "pdf_name": ch.pdf_name or "",
            "class_level": meta["class"],
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
        
    CURRICULUM_CACHE[curr_key] = result
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

@router.get("/chapter/{chapter_id}/graph")
async def get_chapter_graph(chapter_id: str, db: AsyncSession = Depends(get_pg_session)):
    """
    Return all topics and their subtopics for a given chapter, formatted for a graph UI.
    Includes chapter and subject metadata for faster frontend rendering.
    """
    # 1. Fetch Chapter Metadata
    chapter_res = await db.execute(
        select(Chapter).where(Chapter.chapter_id == chapter_id)
    )
    chapter = chapter_res.scalars().first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")

    meta = _derive_metadata(chapter.pdf_name)

    # 2. Fetch topics for the chapter
    topics_res = await db.execute(
        select(CurriculumTopic)
        .where(CurriculumTopic.chapter_id == chapter_id)
        .order_by(CurriculumTopic.order_index)
    )
    topics = topics_res.scalars().all()
    
    if not topics:
        return {
            "chapter_id": chapter_id,
            "chapter_name": chapter.chapter_name,
            "subject": meta["subject"],
            "topics": []
        }
    
    # 3. Fetch subtopics for all these topics
    topic_ids = [t.id for t in topics]
    subtopics_res = await db.execute(
        select(CurriculumSubtopic)
        .where(CurriculumSubtopic.topic_id.in_(topic_ids))
        .order_by(CurriculumSubtopic.topic_id, CurriculumSubtopic.order_index)
    )
    subtopics = subtopics_res.scalars().all()
    
    # Group subtopics by topic_id
    subtopics_by_topic = {}
    for st in subtopics:
        tid = str(st.topic_id)
        if tid not in subtopics_by_topic: subtopics_by_topic[tid] = []
        subtopics_by_topic[tid].append({
            "id": str(st.id),
            "name": st.title,
            "order_index": st.order_index
        })
        
    # 4. Combine
    result_topics = []
    for t in topics:
        tid = str(t.id)
        result_topics.append({
            "id": tid,
            "name": t.title,
            "order_index": t.order_index,
            "subtopics": subtopics_by_topic.get(tid, [])
        })
        
    return {
        "chapter_id": chapter_id,
        "chapter_name": chapter.chapter_name,
        "subject": meta["subject"],
        "topics": result_topics
    }

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


@router.get("/chapter/{chapter_id}/revision")
async def get_chapter_revision(chapter_id: str, mode: str = "summary", db: AsyncSession = Depends(get_pg_session)):
    """
    Return revision content for a chapter.
    mode: summary | formulas | mnemonics | flashcards | mindmap | sketchpad
    """
    from db.postgres_models import CurriculumChunk
    import uuid
    
    # Ensure chapter_id is a UUID object for consistent DB querying
    try:
        ch_uuid = uuid.UUID(chapter_id) if isinstance(chapter_id, str) else chapter_id
    except Exception:
        ch_uuid = chapter_id

    # Get topics for this chapter
    topics_res = await db.execute(
        select(CurriculumTopic).where(CurriculumTopic.chapter_id == ch_uuid).order_by(CurriculumTopic.order_index)
    )
    topics = topics_res.scalars().all()
    topic_ids = [t.id for t in topics]
    topic_names = [t.title for t in topics]

    if not topic_ids:
        raise HTTPException(status_code=404, detail="No topics found for this chapter")

    if mode == "summary":
        # Fetch from chapters table
        ch_res = await db.execute(select(Chapter).where(Chapter.chapter_id == ch_uuid))
        ch = ch_res.scalars().first()
        if ch and ch.chapter_summary:
            summary_dict = ch.chapter_summary
            lines = [f"# {ch.chapter_name or 'Chapter Summary'}"]
            if summary_dict.get('scope'):
                lines.append(f"**Scope**: {summary_dict['scope']}\n")
            if summary_dict.get('chapter_summary'):
                lines.append(f"{summary_dict['chapter_summary']}\n")
            if summary_dict.get('key_concepts'):
                lines.append("## Key Concepts")
                for kc in summary_dict['key_concepts']:
                    lines.append(f"- {kc}")
            if summary_dict.get('learning_objectives'):
                lines.append("\n## Learning Objectives")
                for lo in summary_dict['learning_objectives']:
                    lines.append(f"- {lo}")
            return {"mode": "summary", "text": "\n".join(lines)}
        else:
            return {"mode": "summary", "text": "Summary not available from database."}

    elif mode == "formulas":
        # Use LLM to generate formulas dynamically
        from services.tutor_service import generate_chapter_formulas
        ch_res = await db.execute(select(Chapter).where(Chapter.chapter_id == ch_uuid))
        ch = ch_res.scalars().first()
        ch_name = ch.chapter_name if ch else "this topic"
        try:
            formulas = await generate_chapter_formulas(ch_name)
            return {"mode": "formulas", "text": formulas}
        except Exception as e:
            print("Formula generation error:", e)
            return {"mode": "formulas", "text": "Failed to generate formula sheet. Please try again later."}

    elif mode == "mnemonics":
        # Build simple mnemonic hints from topic names
        lines = [f"To remember topics in this chapter:"]
        if topic_names:
            initials = "".join(n[0].upper() for n in topic_names[:8] if n)
            lines.append(f"\nFirst-letter mnemonic: **{initials}**")
            for i, name in enumerate(topic_names[:8]):
                lines.append(f"  {name[0].upper()} → {name}")
        return {"mode": "mnemonics", "text": "\n".join(lines)}

    elif mode == "flashcards":
        sub_res = await db.execute(
            select(CurriculumSubtopic).where(CurriculumSubtopic.topic_id.in_(topic_ids)).limit(30)
        )
        subtopics = sub_res.scalars().all()
        cards = []
        for tp in topics[:10]:
            tp_subs = [s for s in subtopics if str(s.topic_id) == str(tp.id)]
            for s in tp_subs[:3]:
                cards.append({
                    "question": f"What is '{s.title}'?",
                    "answer": f"A subtopic of {tp.title}. Study it in the Learning Agent for full details."
                })
            if not tp_subs:
                cards.append({
                    "question": f"Explain: {tp.title}",
                    "answer": f"A key topic in this chapter. Open the AI Tutor to get a full explanation."
                })
        return {"mode": "flashcards", "cards": cards[:20]}

    elif mode == "mindmap":
        # Fetch chapter info
        ch_res = await db.execute(select(Chapter).where(Chapter.chapter_id == ch_uuid))
        ch = ch_res.scalars().first()
        ch_name = ch.chapter_name if ch else "Chapter"

        # Fetch all subtopics for these topics
        sub_res = await db.execute(
            select(CurriculumSubtopic).where(CurriculumSubtopic.topic_id.in_(topic_ids))
        )
        all_subtopics = sub_res.scalars().all()

        nodes = []
        edges = []

        # Root Node
        nodes.append({"id": "root", "label": ch_name, "type": "root"})

        for tp in topics:
            t_id = f"topic_{tp.id}"
            nodes.append({"id": t_id, "label": tp.title, "type": "topic"})
            edges.append({"id": f"edge_root_{t_id}", "source": "root", "target": t_id})

            tp_subs = [s for s in all_subtopics if str(s.topic_id) == str(tp.id)]
            for s in tp_subs:
                s_id = f"sub_{s.id}"
                nodes.append({"id": s_id, "label": s.title, "type": "subtopic"})
                edges.append({"id": f"edge_{t_id}_{s_id}", "source": t_id, "target": s_id})

        return {"mode": "mindmap", "nodes": nodes, "edges": edges}

    elif mode == "sketchpad":
        # Return topics for selection
        ch_res = await db.execute(select(Chapter).where(Chapter.chapter_id == ch_uuid))
        ch = ch_res.scalars().first()
        ch_name = ch.chapter_name if ch else "Chapter"
        
        return {
            "mode": "sketchpad",
            "topics": [
                {
                    "id": str(t.id),
                    "title": t.title,
                    "description": f"Master the concepts of {t.title} through visual sketching.",
                    "image_prompt": f"Detailed scientific diagram of {t.title} for {ch_name}, minimalist, line art, educational"
                }
                for t in topics
            ]
        }

    raise HTTPException(status_code=400, detail="Invalid mode. Use: summary | formulas | mnemonics | flashcards | mindmap | sketchpad")


@router.get("/topic/{topic_id}/ai-sketch")
async def get_topic_ai_sketch(topic_id: str, db: AsyncSession = Depends(get_pg_session)):
    """Generates an AI-powered interactive sketch for a specific topic."""
    from services.tutor_service import generate_ai_sketch
    import uuid
    
    try:
        tid_uuid = uuid.UUID(topic_id) if isinstance(topic_id, str) else topic_id
        t_res = await db.execute(select(CurriculumTopic).where(CurriculumTopic.id == tid_uuid))
        topic = t_res.scalars().first()
        if not topic:
            raise HTTPException(status_code=404, detail="Topic not found")
            
        # Get chapter name for context
        ch_res = await db.execute(select(Chapter).where(Chapter.chapter_id == topic.chapter_id))
        ch = ch_res.scalars().first()
        ch_name = ch.chapter_name if ch else "NEET Biology"
        
        commands = await generate_ai_sketch(topic.title, ch_name)
        print(f"DEBUG: Generated {len(commands)} commands for topic {topic.title}")
        return {"topic_id": topic_id, "topic_name": topic.title, "commands": commands}
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return {"topic_id": topic_id, "commands": [], "error": str(e)}
        

@router.post("/ai-infographic")
async def generate_concept_infographic(req: InfographicRequest):
    """Generates an AI-powered infographic for a custom user query."""
    from services.tutor_service import generate_infographic_sketch
    from models.schemas import InfographicRequest
    
    try:
        commands = await generate_infographic_sketch(req.query)
        print(f"DEBUG: Generated {len(commands)} infographic commands for query: {req.query}")
        return {"query": req.query, "commands": commands}
    except Exception as e:
        return {"query": req.query, "commands": [], "error": str(e)}
        

@router.post("/topic/{topic_id}/sketch")
async def save_user_sketch(topic_id: str, payload: dict, db: AsyncSession = Depends(get_pg_session)):
    """Saves a user sketch (AI commands + user strokes) to the database."""
    import uuid
    try:
        user_id = payload.get("user_id", "user_123")
        sketch_name = payload.get("name", "My Sketch")
        sketch_data = payload.get("data", {})
        
        tid_uuid = uuid.UUID(topic_id) if isinstance(topic_id, str) else topic_id
        
        new_sketch = UserTopicSketch(
            id=uuid.uuid4(),
            user_id=user_id,
            topic_id=tid_uuid,
            sketch_name=sketch_name,
            data=sketch_data
        )
        db.add(new_sketch)
        await db.commit()
        return {"status": "success", "id": str(new_sketch.id)}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/topic/{topic_id}/sketches")
async def get_user_sketches(topic_id: str, user_id: str = "user_123", db: AsyncSession = Depends(get_pg_session)):
    """Retrieves all saved sketches for a topic and user."""
    import uuid
    try:
        tid_uuid = uuid.UUID(topic_id) if isinstance(topic_id, str) else topic_id
        res = await db.execute(
            select(UserTopicSketch)
            .where(and_(UserTopicSketch.topic_id == tid_uuid, UserTopicSketch.user_id == user_id))
            .order_by(UserTopicSketch.created_at.desc())
        )
        sketches = res.scalars().all()
        return {
            "sketches": [
                {
                    "id": str(s.id),
                    "name": s.sketch_name,
                    "created_at": s.created_at.isoformat(),
                    "data": s.data
                }
                for s in sketches
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

