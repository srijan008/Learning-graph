from datetime import datetime
from typing import Optional, List, Dict, Any
import json
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from db.postgres_client import get_pg_session
from db.postgres_models import UserSubtopicProgress, SubtopicStatus, TutorChatSession
from routers.graph import get_next_topics

router = APIRouter(prefix="/learning", tags=["learning"])

SUMMARY_THRESHOLD = 8  # summarise after this many messages
KEEP_RECENT = 4        # keep this many recent after summarising


# ─────────────────────────────────────────────────────────────────────────────
# Models
# ─────────────────────────────────────────────────────────────────────────────

class GreetRequest(BaseModel):
    user_id: str
    topic_id: str
    topic_name: str
    subtopic_ids: list[str] = []
    subtopic_names: list[str] = []
    doubt_context: Optional[str] = None  # e.g. "Student confused about: Newton's 3rd law (conceptual)"

class ChatRequest(BaseModel):
    session_id: str
    user_id: str
    subtopic_id: str
    subtopic_name: str
    user_message: str
    subtopics_context: str = "" # List of all subtopics with IDs to help LLM reason about its JSON response

class ProgressRequest(BaseModel):
    user_id: str
    topic_id: str  # Added to update session scores
    subtopic_id: str
    subtopic_name: Optional[str] = None
    time_spent_minutes: int = 0
    status: SubtopicStatus = SubtopicStatus.in_progress


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

async def _get_or_create_session(
    db: AsyncSession,
    user_id: str,
    topic_id: str,
) -> TutorChatSession:
    session_id = f"{user_id}_{topic_id}"
    
    # 1. First try: Select
    result = await db.execute(select(TutorChatSession).where(TutorChatSession.id == session_id))
    session = result.scalars().first()
    if session:
        return session
    
    # 2. Not found: Try to create (handle race condition)
    try:
        session = TutorChatSession(
            id=session_id,
            user_id=user_id,
            topic_id=topic_id,
            prior_summary=None,
            recent_messages=[],
            message_count=0,
            subtopic_scores={},
        )
        db.add(session)
        await db.flush() # Flush to DB, triggers constraints
        return session
    except Exception:
        # 3. If IntegrityError (duplicate), roll back flush and re-query
        await db.rollback()
        result = await db.execute(select(TutorChatSession).where(TutorChatSession.id == session_id))
        session = result.scalars().first()
        if not session:
            # Should theoretically never happen unless DB is disappearing
            raise HTTPException(status_code=500, detail="Failed to create or retrieve session.")
        return session





async def _maybe_compress_context(session: TutorChatSession):
    """If messages exceed threshold, summarise older ones and trim."""
    if session.message_count < SUMMARY_THRESHOLD:
        return
    from services.tutor_service import generate_summary
    messages_to_summarise = (session.recent_messages or [])[:-KEEP_RECENT]
    kept = (session.recent_messages or [])[-KEEP_RECENT:]
    if not messages_to_summarise:
        return
    new_summary = await generate_summary(messages_to_summarise)
    if session.prior_summary:
        session.prior_summary = f"{session.prior_summary}\n\n{new_summary}"
    else:
        session.prior_summary = new_summary
    session.recent_messages = kept


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/chat/greet")
async def greet_topic(req: GreetRequest, db: AsyncSession = Depends(get_pg_session)):
    """
    Called ONCE when a student enters study mode for a topic.
    Analyses current confidence of all subtopics and returns a personalised greeting.
    Returns the session_id to use for subsequent /chat calls.
    If session already exists with previous messages, returns existing history instead.
    """
    from services.tutor_service import generate_topic_greeting
    
    session = await _get_or_create_session(db, req.user_id, req.topic_id)
    scores = dict(session.subtopic_scores or {})

    # Build subtopic summary list for LLM
    subtopics_info = [
        {"name": name, "confidence": scores.get(sid, 0)}
        for sid, name in zip(req.subtopic_ids, req.subtopic_names)
    ]

    # If session already has messages, just return existing history (resume)
    existing_messages = list(session.recent_messages or [])
    
    # If a new doubt context is provided, we skip the static greeting
    # and let the frontend trigger a fresh streaming request using the doubt as the query.
    if req.doubt_context:
        await db.commit()
        return {
            "session_id": session.id,
            "message": None, 
            "existing_messages": existing_messages,
            "subtopic_scores": scores,
        }

    if existing_messages:
        await db.commit()
        return {
            "session_id": session.id,
            "message": None,  # Frontend uses existing history
            "existing_messages": existing_messages,
            "subtopic_scores": scores,
        }

    # First visit (standard) — generate static greeting
    greeting = await generate_topic_greeting(
        req.topic_name, subtopics_info, req.doubt_context
    )

    messages = [{"role": "assistant", "content": greeting}]
    session.recent_messages = messages
    session.message_count = 1

    await db.commit()
    return {
        "session_id": session.id,
        "message": greeting,
        "existing_messages": None,
        "subtopic_scores": scores,
    }


@router.post("/chat")
async def chat(
    req: ChatRequest,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_pg_session),
):
    """
    Main chat endpoint. Streams response via SSE.
    After stream completes, fires background task to save detected doubts.
    """
    from services.tutor_service import chat_with_tutor_stream

    result = await db.execute(select(TutorChatSession).where(TutorChatSession.id == req.session_id))
    session = result.scalars().first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found. Call /chat/greet first.")

    # Mark subtopic as in_progress
    await _mark_subtopic_progress(db, req.user_id, req.subtopic_id, SubtopicStatus.in_progress)
    await db.commit()

    # Build subtopic_names lookup from context string for the doubt worker
    subtopic_names: dict = {}
    for line in (req.subtopics_context or "").splitlines():
        # Format: - ID: "abc" | Name: "Force"
        try:
            id_part = line.split('ID: "')[1].split('"')[0]
            name_part = line.split('Name: "')[1].split('"')[0]
            subtopic_names[id_part] = name_part
        except (IndexError, ValueError):
            pass

    async def stream_generator():
        stream = chat_with_tutor_stream(
            prior_summary=session.prior_summary,
            recent_messages=list(session.recent_messages or []),
            user_message=req.user_message,
            subtopics_context=req.subtopics_context,
            subtopic_id=req.subtopic_id,
            current_scores=session.subtopic_scores or {},
            session_id=session.id,
            topic_id=session.topic_id,
        )

        reply_accum = ""
        scores_meta = {}
        doubts_meta = []

        async for chunk in stream:
            if chunk.startswith("\n__METADATA__"):
                raw_meta = json.loads(chunk.replace("\n__METADATA__", ""))
                scores_meta = raw_meta.get("scores", {})
                doubts_meta = raw_meta.get("doubts", [])
            else:
                reply_accum += chunk
                sse_chunk = chunk.replace("\n", "\\n")
                yield f"data: {sse_chunk}\n\n"

        # Flush SSE done
        yield "data: [DONE]\n\n"

        # --- DB update (inline, non-blocking for frontend) ---
        try:
            scores = dict(session.subtopic_scores or {})
            primary_sub_id = list(scores_meta.keys())[0] if scores_meta else req.subtopic_id

            msgs = list(session.recent_messages or [])
            msgs.append({"role": "user", "content": req.user_message, "subtopic_id": req.subtopic_id})
            msgs.append({"role": "assistant", "content": reply_accum, "subtopic_id": primary_sub_id})
            session.recent_messages = msgs
            session.message_count = (session.message_count or 0) + 2

            for sid, info in scores_meta.items():
                if isinstance(info, dict):
                    # New sectional formatting
                    t = info.get("theory", 0)
                    e = info.get("example", 0)
                    c = info.get("cross", 0)
                    is_completed = info.get("is_completed", False)
                    # For the generic dictionary, save the average, but the DB gets the specifics
                    avg_conf = (t + e + c) // 3
                    
                    old_score = scores.get(sid, {})
                    if isinstance(old_score, dict):
                        scores[sid] = {
                            "theory": max(old_score.get("theory", 0), t),
                            "example": max(old_score.get("example", 0), e),
                            "cross": max(old_score.get("cross", 0), c)
                        }
                    else:
                         scores[sid] = {"theory": t, "example": e, "cross": c}
                    
                    all_mastered = t >= 70 and e >= 70 and c >= 70
                    
                    if is_completed or all_mastered or avg_conf > 0:
                        # Save the specific numbers to the progress table
                        status = SubtopicStatus.completed if (is_completed or all_mastered) else SubtopicStatus.in_progress
                        await _mark_subtopic_progress(db, req.user_id, sid, status, info)

                else:
                    # Legacy fallback
                    confidence = info
                    is_completed = False # Assuming false for legacy flat number
                    scores[sid] = max(scores.get(sid, 0), confidence)
                    if confidence > 0:
                         status = SubtopicStatus.completed if confidence >= 70 else SubtopicStatus.in_progress
                         await _mark_subtopic_progress(db, req.user_id, sid, status)

            session.subtopic_scores = scores
            await _maybe_compress_context(session)
            await db.merge(session)
            await db.commit()
        except Exception:
            pass

        # --- Fire doubt worker as background task (truly async, non-blocking) ---
        if doubts_meta:
            from services.doubt_worker import process_doubts
            background.add_task(
                process_doubts,
                None,        # ignored inside worker (creates own session)
                req.user_id,
                req.user_message,
                session.topic_id,
                subtopic_names.get(req.subtopic_id, req.subtopic_id),
                subtopic_names,
                doubts_meta,
            )

    return StreamingResponse(
        stream_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/progress")
async def update_progress(req: ProgressRequest, db: AsyncSession = Depends(get_pg_session)):
    """
    Manually updates subtopic progress from the frontend (e.g. "Mark Done").
    If status is 'completed', ensures scores reach at least 70.
    """
    scores_update = {}
    if req.status == SubtopicStatus.completed:
        # All 3 parts >= 70 as requested
        scores_update = {"theory": 70, "example": 70, "cross": 70}
    
    # 1. Update UserSubtopicProgress table
    await _mark_subtopic_progress(db, req.user_id, req.subtopic_id, req.status, scores_update)
    
    # 2. Sync with TutorChatSession so the frontend sees the score update immediately
    session_id = f"{req.user_id}_{req.topic_id}"
    result = await db.execute(select(TutorChatSession).where(TutorChatSession.id == session_id))
    session = result.scalars().first()
    if session:
        scores = dict(session.subtopic_scores or {})
        if req.status == SubtopicStatus.completed:
            old_s = scores.get(req.subtopic_id, {})
            if isinstance(old_s, dict):
                scores[req.subtopic_id] = {
                    "theory": max(old_s.get("theory", 0), 70),
                    "example": max(old_s.get("example", 0), 70),
                    "cross": max(old_s.get("cross", 0), 70)
                }
            else:
                scores[req.subtopic_id] = {"theory": 70, "example": 70, "cross": 70}
        session.subtopic_scores = scores
        # Commit handled in helper or here
        await db.commit()

    return {"status": "success"}


@router.get("/progress/{user_id}/topic/{topic_id}")
async def get_topic_progress(
    user_id: str,
    topic_id: str,
    db: AsyncSession = Depends(get_pg_session),
):
    """
    Returns progress for all subtopics of a topic including confidence scores.
    Also returns can_practice (all subtopics >= 50% confidence).
    """
    # Get chat session for confidence scores
    session_id = f"{user_id}_{topic_id}"
    result = await db.execute(select(TutorChatSession).where(TutorChatSession.id == session_id))
    session = result.scalars().first()
    scores = dict(session.subtopic_scores or {}) if session else {}

    # Get all progress for this user
    prog_result = await db.execute(
        select(UserSubtopicProgress).where(UserSubtopicProgress.user_id == user_id)
    )
    progress_list = prog_result.scalars().all()
    progress_map = {p.subtopic_id: p.status.value for p in progress_list}

    def _get_avg_score(raw_score):
        if isinstance(raw_score, dict):
            return (raw_score.get("theory", 0) + raw_score.get("example", 0) + raw_score.get("cross", 0)) // 3
        return raw_score

    return {
        "scores": scores,
        "progress": progress_map,
        # can_practice: every subtopic in request (via query param) has >= 60% average confidence
        "can_practice": len(scores) > 0 and all(_get_avg_score(scores.get(sid, 0)) >= 60 for sid in scores),
    }


async def _mark_subtopic_progress(db: AsyncSession, user_id: str, subtopic_id: str, status: SubtopicStatus, sectional_scores: dict = None):
    """
    Upserts subtopic progress, optionally saving sectional scores from the AI.
    """
    result = await db.execute(
        select(UserSubtopicProgress)
        .where(UserSubtopicProgress.user_id == user_id, UserSubtopicProgress.subtopic_id == subtopic_id)
    )
    progress = result.scalars().first()

    if progress:
        progress.status = status
        progress.last_studied_at = datetime.utcnow()
        if sectional_scores:
            progress.theory_score = max(progress.theory_score, sectional_scores.get("theory", 0))
            progress.example_score = max(progress.example_score, sectional_scores.get("example", 0))
            progress.cross_question_score = max(progress.cross_question_score, sectional_scores.get("cross", 0))
    else:
        progress = UserSubtopicProgress(
            user_id=user_id,
            subtopic_id=subtopic_id,
            status=status,
            theory_score=sectional_scores.get("theory", 0) if sectional_scores else 0,
            example_score=sectional_scores.get("example", 0) if sectional_scores else 0,
            cross_question_score=sectional_scores.get("cross", 0) if sectional_scores else 0,
        )
        db.add(progress)

    await db.commit()
    await db.refresh(progress)


@router.get("/{user_id}/next")
async def get_next_recommended_topic(user_id: str, current_subtopic_id: str, subtopic_name: Optional[str] = None):
    """Given the current topic, recommends the next topic using Neo4j graph."""
    from services.learning_agent import get_next_recommended_topic_for_user
    try:
        recommendation = await get_next_recommended_topic_for_user(user_id, current_subtopic_id)
        if "error" in recommendation:
            raise HTTPException(status_code=500, detail=recommendation["error"])
        return recommendation
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
