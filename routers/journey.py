"""
Journey router — Learning Journey generation and management.

Endpoints
---------
POST /journey/generate             → Create a new learning journey from goal form
GET  /journey/list/{user_id}       → List all journeys for a user
GET  /journey/{id}                 → Full journey detail (nodes + progress)
GET  /journey/{id}/graph           → React Flow node-edge data from Neo4j prereqs
POST /journey/{id}/node/{topic_id}/complete → Mark a topic node as completed
DELETE /journey/{id}               → Delete a journey
"""
import uuid
import math
import json
from collections import defaultdict
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

from db.postgres_client import engine
from db.postgres_models import (
    LearningJourney, JourneyTopicNode, NodeStatus, JourneyStatus, CurriculumTopic
)

router = APIRouter(prefix="/journey", tags=["journey"])

# ── Pydantic models -----------------------------------------------------------

class GenerateJourneyRequest(BaseModel):
    user_id: str
    goal: str
    subject_ids: List[str]          # list of subject IDs to include
    study_span_months: int = 4      # 2, 6, or 10
    weekly_hours: int = 10          # 1–50
    session_minutes: int = 60       # 15–240
    difficulty: str = "standard"    # standard | accelerated | deep_dive

class CompleteNodeRequest(BaseModel):
    user_id: str


# ── Topological sort helper ---------------------------------------------------

def _topological_sort(nodes: list[dict], edges: dict[str, list[str]]) -> list[dict]:
    """
    Kahn's algorithm for topological sort.
    nodes: list of topic dicts with 'topic_id' key
    edges: prerequisite map {topic_id: [prerequisite_topic_ids]}
    Returns ordered list of nodes (prerequisites first).
    """
    node_map = {n["topic_id"]: n for n in nodes}
    all_ids = set(node_map.keys())

    # Build in-degree count
    in_degree = defaultdict(int)
    dependents = defaultdict(list)  # prereq → list of things that need it

    for tid, prereqs in edges.items():
        for p in prereqs:
            if p in all_ids and tid in all_ids:
                in_degree[tid] += 1
                dependents[p].append(tid)

    # Start with nodes that have no prerequisites (in our set)
    queue = [tid for tid in all_ids if in_degree[tid] == 0]
    sorted_ids = []

    while queue:
        # Sort by curriculum order (chapter sequence) within same dependency level
        queue.sort(key=lambda x: node_map[x].get("curriculum_rank", 0))
        tid = queue.pop(0)
        sorted_ids.append(tid)
        for dep in dependents[tid]:
            in_degree[dep] -= 1
            if in_degree[dep] == 0:
                queue.append(dep)

    # Any remaining (cycle) nodes go at the end
    remaining = [tid for tid in all_ids if tid not in sorted_ids]
    sorted_ids.extend(remaining)

    return [node_map[tid] for tid in sorted_ids if tid in node_map]


# ── Journey generation -------------------------
def _derive_subject(pdf_name: str) -> str:
    """Derive subject name from pdf_name."""
    if not pdf_name:
        return "General"
    name = pdf_name.lower()
    if "physics" in name: return "Physics"
    if "chemistry" in name: return "Chemistry"
    if "zoology" in name: return "Zoology"
    if "botany" in name: return "Botany"
    if "biology" in name: return "Biology"
    return "General"

def _derive_class(pdf_name: str) -> str:
    """Derive class level (11/12) from pdf_name."""
    if not pdf_name: return "Other"
    name = pdf_name.lower()
    if name.startswith('l'): return "12"
    if name.startswith('k'): return "11"
    if "class 11" in name or "_11" in name: return "11"
    if "class 12" in name or "_12" in name: return "12"
    return "Other"


async def _generate_journey_nodes(
    subject_ids: List[str],
    difficulty: str,
) -> tuple[list[dict], dict[str, list[str]]]:
    """
    Fetch all topics for the given subjects from PostgreSQL.
    subject_ids are subject NAMES (e.g. "Physics", "Chemistry") — matched
    against pdf_name via ILIKE. Returns (topic_list, prereq_edges).
    """
    topics = []

    async with engine.connect() as conn:
        # Build WHERE clause: match any subject name against pdf_name
        # subject_ids are names like "Physics", "Chemistry", etc.
        like_clauses = " OR ".join(
            [f"LOWER(pdf_name) LIKE :sub{i}" for i in range(len(subject_ids))]
        )
        params: dict = {f"sub{i}": f"%{sid.lower()}%" for i, sid in enumerate(subject_ids)}

        res_ch = await conn.execute(
            text(
                f'SELECT chapter_id, chapter_name, pdf_name, chapter_num '
                f'FROM "ai-books".chapters '
                f'WHERE {like_clauses} '
                f'ORDER BY chapter_num ASC NULLS LAST, chapter_name'
            ),
            params,
        )
        chapters_rows = res_ch.mappings().all()
        chapter_map = {str(c["chapter_id"]): dict(c) for c in chapters_rows}
        chapter_rank = {str(c["chapter_id"]): i for i, c in enumerate(chapters_rows)}

        chapter_ids = list(chapter_map.keys())
        if not chapter_ids:
            return [], {}

        res_tp = await conn.execute(
            text(
                'SELECT t.id, t.title, t.chapter_id, t.order_index '
                'FROM "ai-books".curriculum_topics t '
                'JOIN "ai-books".chapters c ON c.chapter_id = t.chapter_id '
                'WHERE t.chapter_id = ANY(:cids) '
                'ORDER BY c.chapter_num ASC NULLS LAST, t.order_index ASC'
            ),
            {"cids": [uuid.UUID(cid) for cid in chapter_ids]},
        )

        multiplier = {"standard": 1.0, "accelerated": 0.7, "deep_dive": 1.5}.get(difficulty, 1.0)
        for row_idx, tp in enumerate(res_tp.mappings().all()):
            ch = chapter_map.get(str(tp["chapter_id"]), {})
            subject_name = _derive_subject(ch.get("pdf_name", ""))
            topics.append({
                "topic_id": str(tp["id"]),
                "topic_name": tp["title"],
                "subject_name": subject_name,
                "chapter_name": ch.get("chapter_name", ""),
                "estimated_hours": round(2.0 * multiplier, 1),
                "curriculum_rank": chapter_rank.get(str(tp["chapter_id"]), 9999) * 10000 + row_idx,
            })

    # Fetch prerequisite edges
    prereq_edges: dict[str, list[str]] = {}
    topic_ids_in_journey = {t["topic_id"] for t in topics}

    if topic_ids_in_journey:
        async with engine.connect() as conn:
            res = await conn.execute(
                text('SELECT id, prerequisites FROM "ai-books".curriculum_topics WHERE id = ANY(:ids)'),
                {"ids": [uuid.UUID(tid) for tid in topic_ids_in_journey]}
            )
            for row in res.mappings().all():
                tid_source = str(row["id"])
                prereqs = row["prerequisites"] or []
                if prereqs:
                    prereq_edges[tid_source] = [str(p) for p in prereqs]

    return topics, prereq_edges


# ── Endpoints -----------------------------------------------------------------

@router.post("/generate")
async def generate_journey(req: GenerateJourneyRequest):
    """
    Generate a new learning journey for a user.
    Fetches topics from PostgreSQL, sorts them using Neo4j prerequisite graph,
    assigns week numbers based on weekly_hours, and persists to DB.
    Topics already studied by the user are pre-marked as 'completed'.
    """
    if not req.subject_ids:
        raise HTTPException(status_code=400, detail="At least one subject must be selected.")

    # 1. Fetch topics + prereq edges
    topics, prereq_edges = await _generate_journey_nodes(req.subject_ids, req.difficulty)

    if not topics:
        raise HTTPException(status_code=404, detail="No topics found for the selected subjects.")

    # 2. Fetch already-studied topic IDs for this user
    #    Source 1: tutor_chat_sessions (topic-level engagement — message_count > 0)
    #    Source 2: user_subtopic_progress -> join up to topics via neet-books.subtopics
    already_studied: set[str] = set()
    async with engine.connect() as conn:
        # tutor_chat_sessions: if user opened a tutor session for a topic, it's studied
        res_chat = await conn.execute(
            text("""
                SELECT DISTINCT topic_id
                FROM tutor_chat_sessions
                WHERE user_id = :uid AND message_count > 0
            """),
            {"uid": req.user_id},
        )
        for r in res_chat.mappings().all():
            if r["topic_id"]:
                already_studied.add(str(r["topic_id"]))

        # user_subtopic_progress: map completed subtopics up to their parent topic
        try:
            res_prog = await conn.execute(
                text("""
                    SELECT DISTINCT s.topic_id::text
                    FROM user_subtopic_progress usp
                    JOIN "ai-books".curriculum_subtopics s ON s.id::text = usp.subtopic_id
                    WHERE usp.user_id = :uid AND usp.status = 'completed'
                """),
                {"uid": req.user_id},
            )
            for r in res_prog.mappings().all():
                if r["topic_id"]:
                    already_studied.add(str(r["topic_id"]))
        except Exception:
            pass  # subtopics table may not exist — gracefully skip

    # 3. Topological sort
    sorted_topics = _topological_sort(topics, prereq_edges)

    # 4. Schedule: assign week numbers
    avg_topic_hours = sum(t["estimated_hours"] for t in sorted_topics) / len(sorted_topics)
    topics_per_week = max(1, math.floor(req.weekly_hours / avg_topic_hours))
    total_estimated_hours = sum(t["estimated_hours"] for t in sorted_topics)

    # 5. Determine initial status for each node
    #    - already studied → 'completed'
    #    - prerequisites all completed → 'available'
    #    - otherwise → 'locked'
    completed_at_start: set[str] = set()
    for t in sorted_topics:
        if t["topic_id"] in already_studied:
            completed_at_start.add(t["topic_id"])

    def _initial_status(topic_id: str, idx: int) -> str:
        if topic_id in completed_at_start:
            return "completed"
        prereqs = prereq_edges.get(topic_id, [])
        if not prereqs:
            # No explicit prereqs — available if it's the first or prev completed
            return "available"
        # Available if all its prerequisites are already completed
        if all(p in completed_at_start for p in prereqs):
            return "available"
        return "locked"

    # 6. Persist journey
    journey_id = str(uuid.uuid4())
    pre_completed_count = len(completed_at_start)

    async with engine.begin() as conn:
        await conn.execute(
            text("""
                INSERT INTO learning_journeys
                  (id, user_id, goal, subjects, study_span_months, weekly_hours,
                   session_minutes, difficulty, status, total_topics,
                   completed_topics, estimated_total_hours, created_at, updated_at)
                VALUES
                  (:id, :user_id, :goal, CAST(:subjects AS jsonb), :span, :wh,
                   :sm, :diff, 'active', :total, :pre_done, :eth, now(), now())
            """),
            {
                "id": journey_id,
                "user_id": req.user_id,
                "goal": req.goal,
                "subjects": json.dumps(req.subject_ids),
                "span": req.study_span_months,
                "wh": req.weekly_hours,
                "sm": req.session_minutes,
                "diff": req.difficulty,
                "total": len(sorted_topics),
                "pre_done": pre_completed_count,
                "eth": total_estimated_hours,
            },
        )

        node_params = []
        for idx, topic in enumerate(sorted_topics):
            week_num = (idx // topics_per_week) + 1
            prereqs = prereq_edges.get(topic["topic_id"], [])
            node_status = _initial_status(topic["topic_id"], idx)

            node_params.append({
                "id": str(uuid.uuid4()),
                "jid": journey_id,
                "tid": topic["topic_id"],
                "tname": topic["topic_name"],
                "sname": topic.get("subject_name", ""),
                "cname": topic.get("chapter_name", ""),
                "oidx": idx,
                "eh": topic["estimated_hours"],
                "prereqs": json.dumps(prereqs),
                "nstatus": node_status,
                "wnum": week_num,
                "completed_at": datetime.utcnow() if node_status == "completed" else None
            })

        if node_params:
            await conn.execute(
                text("""
                    INSERT INTO journey_topic_nodes
                      (id, journey_id, topic_id, topic_name, subject_name, chapter_name,
                       order_index, estimated_hours, prerequisite_topic_ids,
                       node_status, week_number, completed_at)
                    VALUES
                      (:id, :jid, :tid, :tname, :sname, :cname,
                       :oidx, :eh, CAST(:prereqs AS jsonb), :nstatus, :wnum,
                       :completed_at)
                """),
                node_params
            )

    progress_pct = round((pre_completed_count / len(sorted_topics)) * 100) if sorted_topics else 0
    return {
        "journey_id": journey_id,
        "total_topics": len(sorted_topics),
        "already_completed": pre_completed_count,
        "estimated_total_hours": round(total_estimated_hours, 1),
        "progress_pct": progress_pct,
        "message": f"Journey generated! {pre_completed_count} topics already completed from your study history.",
    }



@router.get("/list/{user_id}")
async def list_journeys(user_id: str):
    """Return all journeys for a user."""
    async with engine.connect() as conn:
        res = await conn.execute(
            text("""
                SELECT id, goal, subjects, study_span_months, weekly_hours,
                       session_minutes, difficulty, status,
                       total_topics, completed_topics, estimated_total_hours,
                       created_at, updated_at
                FROM learning_journeys
                WHERE user_id = :uid
                ORDER BY created_at DESC
            """),
            {"uid": user_id},
        )
        journeys = []
        for r in res.mappings().all():
            progress_pct = 0
            if r["total_topics"] > 0:
                progress_pct = round((r["completed_topics"] / r["total_topics"]) * 100)
            journeys.append({**dict(r), "progress_pct": progress_pct,
                             "created_at": str(r["created_at"]),
                             "updated_at": str(r["updated_at"])})
        return journeys


@router.get("/{journey_id}")
async def get_journey(journey_id: str):
    """Return full journey detail with all topic nodes."""
    async with engine.connect() as conn:
        res = await conn.execute(
            text("SELECT * FROM learning_journeys WHERE id = :jid"),
            {"jid": journey_id},
        )
        journey = res.mappings().first()
        if not journey:
            raise HTTPException(status_code=404, detail="Journey not found")

        res_nodes = await conn.execute(
            text("""
                SELECT id, topic_id, topic_name, subject_name, chapter_name, chapter_id,
                       order_index, estimated_hours, prerequisite_topic_ids,
                       node_status, week_number, completed_at
                FROM journey_topic_nodes
                WHERE journey_id = :jid
                ORDER BY order_index
            """),
            {"jid": journey_id},
        )
        nodes = [dict(r) for r in res_nodes.mappings().all()]

        j = dict(journey)
        return {
            **j,
            "created_at": str(j["created_at"]),
            "updated_at": str(j["updated_at"]),
            "nodes": nodes,
            "progress_pct": round((j["completed_topics"] / j["total_topics"]) * 100) if j["total_topics"] > 0 else 0,
        }


@router.get("/{journey_id}/graph")
async def get_journey_graph(journey_id: str):
    """
    Return React Flow–compatible node and edge data.
    Nodes = journey topics. Edges = prerequisite relationships from Neo4j.
    """
    async with engine.connect() as conn:
        res_nodes = await conn.execute(
            text("""
                SELECT topic_id, topic_name, subject_name, chapter_name,
                       order_index, estimated_hours, node_status, week_number
                FROM journey_topic_nodes
                WHERE journey_id = :jid
                ORDER BY order_index
            """),
            {"jid": journey_id},
        )
        db_nodes = list(res_nodes.mappings().all())

    if not db_nodes:
        raise HTTPException(status_code=404, detail="Journey not found or has no nodes")

    # Build React Flow nodes — arrange in grid layout
    cols = 4
    col_gap = 260
    row_gap = 140

    rf_nodes = []
    for idx, n in enumerate(db_nodes):
        col = idx % cols
        row = idx // cols
        status = n["node_status"]
        color_map = {
            "locked": "#334155",
            "available": "#4f46e5",
            "in_progress": "#d97706",
            "completed": "#10b981",
        }
        rf_nodes.append({
            "id": n["topic_id"],
            "type": "journeyNode",
            "position": {"x": col * col_gap, "y": row * row_gap},
            "data": {
                "label": n["topic_name"],
                "subject": n["subject_name"],
                "chapter": n["chapter_name"],
                "status": status,
                "week": n["week_number"],
                "hours": float(n["estimated_hours"]),
                "color": color_map.get(status, "#4f46e5"),
            },
        })

    # Fetch prerequisite edges from PostgreSQL
    rf_edges = []
    topic_ids = [n["id"] for n in rf_nodes] # topic_id was used as 'id' in rf_nodes
    async with engine.connect() as conn:
        res = await conn.execute(
            text('SELECT id, prerequisites FROM "ai-books".curriculum_topics WHERE id = ANY(:ids)'),
            {"ids": topic_ids}
        )
        for row in res.mappings().all():
            source_topic_id = str(row["id"])
            prereqs = row["prerequisites"] or []
            for target_topic_id in prereqs:
                if target_topic_id in topic_ids:
                    rf_edges.append({
                        "id": f"e-{source_topic_id}-{target_topic_id}",
                        "source": source_topic_id,   # the topic that REQUIRES
                        "target": target_topic_id,   # the prerequisite
                        "type": "smoothstep",
                        "animated": False,
                        "style": {"stroke": "#6366f1", "strokeDasharray": "5,5"},
                        "markerEnd": {"type": "arrowclosed", "color": "#6366f1"},
                        "label": "needs first",
                    })

    return {"nodes": rf_nodes, "edges": rf_edges}


@router.post("/{journey_id}/node/{topic_id}/complete")
async def complete_journey_node(journey_id: str, topic_id: str, req: CompleteNodeRequest):
    """
    Mark a topic node as completed and unlock its dependents.
    """
    async with engine.begin() as conn:
        # Mark this node completed
        await conn.execute(
            text("""
                UPDATE journey_topic_nodes
                SET node_status = 'completed', completed_at = now()
                WHERE journey_id = :jid AND topic_id = :tid
            """),
            {"jid": journey_id, "tid": topic_id},
        )

        # Check which nodes have this as a prerequisite and try to unlock them
        res_all = await conn.execute(
            text("""
                SELECT topic_id, prerequisite_topic_ids, node_status
                FROM journey_topic_nodes
                WHERE journey_id = :jid AND node_status = 'locked'
            """),
            {"jid": journey_id},
        )
        locked_nodes = res_all.mappings().all()

        # Fetch all completed topic_ids for this journey
        res_done = await conn.execute(
            text("""
                SELECT topic_id FROM journey_topic_nodes
                WHERE journey_id = :jid AND node_status = 'completed'
            """),
            {"jid": journey_id},
        )
        completed_set = {r["topic_id"] for r in res_done.mappings().all()}

        # Unlock nodes whose all prerequisites are now completed
        for locked in locked_nodes:
            try:
                import ast
                prereqs = ast.literal_eval(locked["prerequisite_topic_ids"]) if locked["prerequisite_topic_ids"] else []
            except Exception:
                prereqs = []
            if not prereqs or all(p in completed_set for p in prereqs):
                await conn.execute(
                    text("""
                        UPDATE journey_topic_nodes
                        SET node_status = 'available'
                        WHERE journey_id = :jid AND topic_id = :tid
                    """),
                    {"jid": journey_id, "tid": locked["topic_id"]},
                )

        # Update journey completed count
        await conn.execute(
            text("""
                UPDATE learning_journeys
                SET completed_topics = (
                    SELECT COUNT(*) FROM journey_topic_nodes
                    WHERE journey_id = :jid AND node_status = 'completed'
                ), updated_at = now()
                WHERE id = :jid
            """),
            {"jid": journey_id},
        )

    return {"status": "ok", "topic_id": topic_id, "message": "Node completed and dependents unlocked"}


@router.delete("/{journey_id}")
async def delete_journey(journey_id: str):
    """Delete a journey and all its nodes."""
    async with engine.begin() as conn:
        await conn.execute(
            text("DELETE FROM journey_topic_nodes WHERE journey_id = :jid"),
            {"jid": journey_id},
        )
        await conn.execute(
            text("DELETE FROM learning_journeys WHERE id = :jid"),
            {"jid": journey_id},
        )
    return {"status": "ok", "message": "Journey deleted"}
