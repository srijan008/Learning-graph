"""
Graph router — neighbour-node queries against Neo4j.

Endpoints
---------
POST /graph/neighbours   → main neighbour lookup
GET  /graph/topics       → list all topics (for autocomplete / debugging)
GET  /graph/topic/{id}   → single topic detail
"""
from fastapi import APIRouter, HTTPException

from db.neo4j_client import get_session
from models.schemas import NeighboursRequest, NeighboursResponse, TopicNode, SequenceResponse

router = APIRouter(prefix="/graph", tags=["graph"])


# ── Helpers ------------------------------------------------------------------

def _row_to_topic(node) -> TopicNode | None:
    """Convert a neo4j Node to a TopicNode. Returns None for None nodes."""
    if node is None:
        return None
    
    # Neo4j Node objects can be converted to dict
    node_data = dict(node)
    
    # Topic and Chapter use 'name', Subtopic uses 'title'
    name = node_data.get("name") or node_data.get("title") or ""
    
    return TopicNode(
        topic_id=node_data.get("id") or node_data.get("topic_id") or "",
        name=name,
        level=node_data.get("level") or node_data.get("difficulty_level"),
        subject=node_data.get("subject"),
        chapter=node_data.get("chapter"),
        difficulty=node_data.get("difficulty"),
        estimated_hours=node_data.get("estimated_hours"),
        description=node_data.get("description"),
        order_index=node_data.get("order_index"),
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
def get_neighbours(req: NeighboursRequest):
    """
    Return the immediate graph neighbours of a topic (and optionally a subtopic).

    - If only `topic` is given  → resolve that topic node and return its neighbours.
    - If `subtopic` is also given → resolve the subtopic scoped to the topic's chapter,
      then return *its* neighbours.

    **Body parameters:**
    | Field     | Type            | Default | Description |
    |-----------|-----------------|---------|-------------|
    | topic     | string          | —       | topic_id or human name (required) |
    | subtopic  | string          | null    | optional subtopic_id or name |
    | limit     | int (1–50)      | 10      | max nodes per neighbour list |
    | include   | list of strings | all     | which types to return: `prerequisites`, `subtopics`, `parent`, `unlocks` |
    """
    with get_session() as session:
        # Step 1: resolve the primary topic
        topic_node = _resolve_node(session, req.topic)
        if topic_node is None:
            raise HTTPException(
                status_code=404,
                detail=f"Topic '{req.topic}' not found. Use topic_id or name.",
            )

        # Step 2: optionally resolve subtopic, scoped to same chapter/subject
        if req.subtopic:
            chapter = topic_node.get("chapter", "")
            subject = topic_node.get("subject", "")

            result = session.run(
                """
                MATCH (t:Topic)
                WHERE (t.id = $sub OR t.topic_id = $sub OR toLower(t.name) = toLower($sub))
                  AND (t.chapter = $chapter OR t.subject = $subject)
                RETURN t
                LIMIT 1
                """,
                sub=req.subtopic,
                chapter=chapter,
                subject=subject,
            )
            rec = result.single()

            if rec is None:
                sub_node = _resolve_node(session, req.subtopic)
                if sub_node is None:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Subtopic '{req.subtopic}' not found.",
                    )
            else:
                sub_node = rec["t"]

            target_node = sub_node
        else:
            target_node = topic_node

        # Step 3: fetch neighbours — only requested types, capped at limit
        target_topic = _row_to_topic(target_node)
        neighbours = _fetch_neighbours(
            session,
            target_topic.topic_id,
            include=req.include,
            limit=req.limit,
        )

        return NeighboursResponse(
            node=target_topic,
            prerequisites=neighbours["prerequisites"],
            subtopics=neighbours["subtopics"],
            parent=neighbours["parent"],
            unlocks=neighbours["unlocks"],
            next=neighbours["next"],
            previous=neighbours["previous"],
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
async def get_curriculum():
    """
    Return the full Curriculum → Subject → Chapter → Topic hierarchy from PostgreSQL.
    """
    async with engine.connect() as conn:
        res_sub = await conn.execute(text('SELECT id, name FROM "neet-books".subjects ORDER BY name'))
        subjects_data = res_sub.mappings().all()

        res_ch = await conn.execute(text('SELECT id, name, subject_id FROM "neet-books".chapters ORDER BY order_index, name'))
        chapters_data = res_ch.mappings().all()
        
        res_tp = await conn.execute(text('SELECT id, title AS name, chapter_id FROM "neet-books".topics ORDER BY title'))
        topics_data = res_tp.mappings().all()
        
        # Track topics by chapter
        chapter_topics = {}
        for tp in topics_data:
            cid = str(tp["chapter_id"])
            if cid not in chapter_topics:
                chapter_topics[cid] = []
            chapter_topics[cid].append({"id": str(tp["id"]), "name": tp["name"]})
            
        # Track chapters by subject
        subject_chapters = {}
        for ch in chapters_data:
            sid = str(ch["subject_id"])
            if sid not in subject_chapters:
                subject_chapters[sid] = []
            subject_chapters[sid].append({
                "id": str(ch["id"]),
                "name": ch["name"],
                "topics": chapter_topics.get(str(ch["id"]), [])
            })
            
        # Build subjects list
        curriculum_subjects = []
        for sub in subjects_data:
            curriculum_subjects.append({
                "id": str(sub["id"]),
                "name": sub["name"],
                "chapters": subject_chapters.get(str(sub["id"]), [])
            })
            
        # Return as 4-level structure with dummy NEET curriculum at root
        return [{
            "id": "NEET",
            "name": "NEET Curriculum",
            "subjects": curriculum_subjects
        }]

@router.get("/topic/{topic_id}/subtopics")
async def get_topic_subtopics(topic_id: str):
    """
    Return subtopics for a given topic ID from PostgreSQL.
    """
    try:
        async with engine.connect() as conn:
            # Query subtopics table
            res = await conn.execute(
                text('SELECT id, title FROM "neet-books".subtopics WHERE topic_id = :tid ORDER BY title'),
                {"tid": topic_id}
            )   
            rows = res.mappings().all()
            # Map 'title' to 'name' for frontend compatibility
            subtopics = [{"id": str(r["id"]), "name": r["title"]} for r in rows]
            
            if not subtopics:
                # Fallback: Check if topic_id is actually a topic
                res_tp = await conn.execute(
                    text('SELECT id, name FROM "neet-books".topics WHERE id = :tid'),
                    {"tid": topic_id}
                )
                tp = res_tp.mappings().first()
                if tp:
                    subtopics = [{"id": str(tp["id"]), "name": tp["name"]}]
            
            return {"topic_id": topic_id, "subtopics": subtopics}
    except Exception as e:
        logger.error(f"Error in get_topic_subtopics: {e}")
        # If subtopics table doesn't work, fallback to the ID itself
        return {"topic_id": topic_id, "subtopics": [{"id": topic_id, "name": "Topic Content"}]}

@router.get("/topic/{topic_id}")
async def get_topic(topic_id: str):
    """Return a single Topic node by its ID from Postgres."""
    async with engine.connect() as conn:
        res = await conn.execute(
            text('SELECT id, title AS name, chapter_id FROM "neet-books".topics WHERE id = :tid'),
            {"tid": topic_id}
        )
        row = res.mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="Topic not found")
        return {
            "id": str(row["id"]),
            "topic_id": str(row["id"]),
            "name": row["name"],
            "chapter_id": str(row["chapter_id"])
        }


@router.get("/topic/{topic_id}/next", response_model=SequenceResponse)
def get_next_topics(topic_id: str, count: int = 1):
    """Return the next `count` topics in the sequence after the given topic_id."""
    with get_session() as session:
        node = _resolve_node(session, topic_id)
        if node is None:
            raise HTTPException(status_code=404, detail=f"Topic '{topic_id}' not found.")
        
        result = session.run(
            """
            MATCH (t:Topic {id: $tid})-[:NEXT*1..%d]->(next_t:Topic)
            RETURN next_t
            """ % min(count, 50), # cap at 50 to prevent huge queries
            tid=topic_id
        )
        
        sequence = [_row_to_topic(record["next_t"]) for record in result]
        return SequenceResponse(node=_row_to_topic(node), sequence=sequence)

@router.get("/topic/{topic_id}/previous", response_model=SequenceResponse)
def get_previous_topics(topic_id: str, count: int = 1):
    """Return the previous `count` topics in the sequence before the given topic_id."""
    with get_session() as session:
        node = _resolve_node(session, topic_id)
        if node is None:
            raise HTTPException(status_code=404, detail=f"Topic '{topic_id}' not found.")
        
        result = session.run(
            """
            MATCH (t:Topic {id: $tid})-[:PREVIOUS*1..%d]->(prev_t:Topic)
            RETURN prev_t
            """ % min(count, 50),
            tid=topic_id
        )
        
        sequence = [_row_to_topic(record["prev_t"]) for record in result]
        return SequenceResponse(node=_row_to_topic(node), sequence=sequence)

