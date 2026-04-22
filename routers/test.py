"""
Test & Mock System Router
==========================
Endpoints:
  GET  /test/questions              — query/filter questions
  POST /test/session/create         — start test session
  GET  /test/session/{id}           — resume session
  PATCH /test/session/{id}/answer   — submit single answer
  POST /test/session/{id}/submit    — finalize test
  GET  /test/{report_id}/results    — instant results (scores)
  GET  /test/{report_id}/analysis   — full analysis (after AI)
  GET  /test/user/{uid}/history     — past tests
  GET  /test/user/{uid}/weak-topics — weak area aggregation
  POST /test/practice/generate      — targeted drill
  WS   /test/ws/{session_id}        — timer sync + heartbeat
"""

import json
import os
import random
import asyncio
import uuid
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from pathlib import Path

from fastapi import APIRouter, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from db.postgres_client import get_pg_session, get_pg_session_direct
from db.postgres_models import TestSession, TestReport, PracticeRecommendation

router = APIRouter(prefix="/test", tags=["test"])

# ─────────────────────────────────────────────────────────────────────────────
# Question Bank — loaded once at startup
# ─────────────────────────────────────────────────────────────────────────────

_QBANK: List[Dict] = []
_QBANK_BY_SUBJECT: Dict[str, List[Dict]] = {}
_QBANK_BY_CHAPTER: Dict[str, List[Dict]] = {}

DIFFICULTIES = ["easy", "medium", "hard"]


def _load_qbank():
    """Load and index the NEET question bank from JSON."""
    global _QBANK, _QBANK_BY_SUBJECT, _QBANK_BY_CHAPTER
    if _QBANK:
        return  # Already loaded

    json_path = Path(__file__).parent.parent / "neet_examside_data_mapped_v6.json"
    if not json_path.exists():
        print(f"[WARNING] Question bank not found at {json_path}")
        return

    with open(json_path, "r", encoding="utf-8") as f:
        raw = json.load(f)

    # Assign random difficulty + generate stable ID from URL
    for q in raw:
        q["id"] = q["url"].split("/")[-1]  # slug as stable unique ID
        q["difficulty"] = random.choice(DIFFICULTIES)
        # Normalize options to list of {label, text, is_correct}
        _QBANK_BY_SUBJECT.setdefault(q.get("subject", "unknown"), []).append(q)
        _QBANK_BY_CHAPTER.setdefault(q.get("chapter", "unknown"), []).append(q)

    _QBANK = raw
    print(f"[OK] Question bank loaded: {len(_QBANK)} questions across {len(_QBANK_BY_SUBJECT)} subjects.")


def get_qbank() -> List[Dict]:
    if not _QBANK:
        _load_qbank()
    return _QBANK


def filter_questions(
    subject: Optional[str] = None,
    chapter: Optional[str] = None,
    difficulty: Optional[str] = None,
    limit: int = 20,
    exclude_ids: Optional[List[str]] = None,
    weak_chapters: Optional[List[str]] = None,
) -> List[Dict]:
    """Filter questions from the bank with optional adaptive prioritization."""
    _load_qbank()
    pool = _QBANK

    if subject:
        pool = [q for q in pool if q.get("subject", "").lower() == subject.lower()]
    if chapter:
        pool = [q for q in pool if q.get("chapter", "").lower() == chapter.lower()]
    if difficulty:
        pool = [q for q in pool if q.get("difficulty") == difficulty]
    if exclude_ids:
        pool = [q for q in pool if q["id"] not in exclude_ids]

    # Adaptive prioritization: put weak chapter questions first
    if weak_chapters:
        weak_pool = [q for q in pool if q.get("chapter") in weak_chapters]
        other_pool = [q for q in pool if q.get("chapter") not in weak_chapters]
        pool = weak_pool + other_pool

    random.shuffle(pool[:max(limit * 3, 60)])  # Shuffle from a wider pool
    return pool[:limit]


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic Models
# ─────────────────────────────────────────────────────────────────────────────

class QuestionOut(BaseModel):
    id: str
    question: str
    options: List[Dict]
    chapter: str
    chapter_name: str
    subject: str
    year: str
    difficulty: str
    image: bool = False


class CreateSessionRequest(BaseModel):
    user_id: str = "user_123"
    test_type: str  # "topic_quiz" | "chapter_mock" | "full_mock" | "practice_drill"
    subject: Optional[str] = None
    chapter: Optional[str] = None
    topic_id: Optional[str] = None
    question_count: int = 20
    time_limit_mins: int = 30
    weak_chapters: Optional[List[str]] = None


class AnswerRequest(BaseModel):
    question_id: str
    selected_option: Optional[str] = None  # "A", "B", "C", "D", or None (skipped)
    time_taken_ms: int = 0
    flagged: bool = False


class SubmitRequest(BaseModel):
    user_id: str = "user_123"


# ─────────────────────────────────────────────────────────────────────────────
# Session Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _compute_instant_results(session: TestSession) -> Dict:
    """Compute score and per-question results without AI."""
    questions_map = {q["id"]: q for q in session.question_snapshot or []}
    answers = session.answers or {}

    results = []
    subject_stats: Dict[str, Dict] = {}
    chapter_stats: Dict[str, Dict] = {}
    wrong_questions = []

    score = 0
    total = len(session.question_ids or [])

    for qid in (session.question_ids or []):
        q = questions_map.get(qid, {})
        answer = answers.get(qid, {})
        selected = answer.get("selected_option")
        correct = q.get("correct_option")
        is_correct = selected == correct if selected else False
        is_skipped = not selected

        # +4 / -1 NEET marking
        if is_correct:
            score += 4
        elif selected and not is_correct:
            score -= 1

        sub = q.get("subject", "unknown")
        ch = q.get("chapter", "unknown")
        ch_name = q.get("chapter_name", ch)
        time_ms = answer.get("time_taken_ms", 0)

        subject_stats.setdefault(sub, {"correct": 0, "wrong": 0, "skipped": 0, "time_ms": 0, "score": 0})
        chapter_stats.setdefault(ch, {"correct": 0, "wrong": 0, "skipped": 0, "chapter_name": ch_name, "subject": sub, "time_ms": 0})

        if is_correct:
            subject_stats[sub]["correct"] += 1
            subject_stats[sub]["score"] += 4
            chapter_stats[ch]["correct"] += 1
        elif is_skipped:
            subject_stats[sub]["skipped"] += 1
            chapter_stats[ch]["skipped"] += 1
        else:
            subject_stats[sub]["wrong"] += 1
            subject_stats[sub]["score"] -= 1
            chapter_stats[ch]["wrong"] += 1
            wrong_questions.append({"id": qid, "subject": sub, "chapter": ch, "time_ms": time_ms})

        subject_stats[sub]["time_ms"] += time_ms
        chapter_stats[ch]["time_ms"] += time_ms

        options_list = q.get("options", [])
        results.append({
            "question_id": qid,
            "question": q.get("question", ""),
            "options": options_list,
            "selected_option": selected,
            "correct_option": correct,
            "is_correct": is_correct,
            "is_skipped": is_skipped,
            "solution": q.get("solution", ""),
            "time_taken_ms": time_ms,
            "subject": sub,
            "chapter": ch,
            "chapter_name": ch_name,
            "year": q.get("year", ""),
        })

    max_score = total * 4
    accuracy = round((len([r for r in results if r["is_correct"]]) / total * 100), 1) if total else 0

    return {
        "score": score,
        "max_score": max_score,
        "accuracy_pct": accuracy,
        "total_questions": total,
        "correct": len([r for r in results if r["is_correct"]]),
        "wrong": len([r for r in results if not r["is_correct"] and not r["is_skipped"]]),
        "skipped": len([r for r in results if r["is_skipped"]]),
        "results": results,
        "subject_breakdown": subject_stats,
        "chapter_breakdown": chapter_stats,
        "wrong_questions": wrong_questions,
    }


def _classify_mistakes(wrong_questions: List[Dict], answers: Dict) -> Dict:
    """Classify mistakes as conceptual / calculation / speed."""
    conceptual, calculation, speed = [], [], []

    for wq in wrong_questions:
        qid = wq["id"]
        ans = answers.get(qid, {})
        time_ms = ans.get("time_taken_ms", 0)

        # Speed mistake: answered in < 8 seconds and got it wrong
        if time_ms < 8000 and time_ms > 0:
            speed.append(wq)
        # Calculation mistake heuristic: long time spent (> 90 seconds) but still wrong
        elif time_ms > 90000:
            calculation.append(wq)
        else:
            conceptual.append(wq)

    return {
        "conceptual": conceptual,
        "calculation": calculation,
        "speed": speed,
    }


def _identify_weak_topics(chapter_breakdown: Dict) -> List[Dict]:
    """Identify weak topics sorted by error rate."""
    weak = []
    for ch, stats in chapter_breakdown.items():
        total_attempted = stats["correct"] + stats["wrong"]
        if total_attempted == 0:
            continue
        error_rate = round(stats["wrong"] / total_attempted * 100, 1)
        if error_rate > 30:
            weak.append({
                "chapter": ch,
                "chapter_name": stats.get("chapter_name", ch),
                "subject": stats.get("subject", ""),
                "error_rate": error_rate,
                "correct": stats["correct"],
                "wrong": stats["wrong"],
            })
    weak.sort(key=lambda x: x["error_rate"], reverse=True)
    return weak


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/questions")
async def get_questions(
    subject: Optional[str] = None,
    chapter: Optional[str] = None,
    difficulty: Optional[str] = None,
    limit: int = 20,
):
    """Browse questions from the question bank with filters."""
    qs = filter_questions(subject=subject, chapter=chapter, difficulty=difficulty, limit=limit)
    return {
        "count": len(qs),
        "questions": [
            {
                "id": q["id"],
                "question": q["question"][:200] + "..." if len(q["question"]) > 200 else q["question"],
                "chapter": q.get("chapter"),
                "chapter_name": q.get("chapter_name"),
                "subject": q.get("subject"),
                "year": q.get("year"),
                "difficulty": q.get("difficulty"),
            }
            for q in qs
        ],
    }


@router.get("/subjects")
async def get_subjects():
    """Return subjects and their chapters from the question bank."""
    _load_qbank()
    result = {}
    for q in _QBANK:
        sub = q.get("subject", "unknown")
        ch = q.get("chapter", "unknown")
        ch_name = q.get("chapter_name", ch)
        result.setdefault(sub, {})
        result[sub][ch] = ch_name
    return {
        sub: [{"chapter": ch, "chapter_name": cname} for ch, cname in chapters.items()]
        for sub, chapters in result.items()
    }

@router.get("/chapters/{chapter_slug}/topics")
async def get_chapter_topics(chapter_slug: str, db: AsyncSession = Depends(get_pg_session)):
    """Return AI curriculum topics for a given chapter slug."""
    from db.postgres_models import CurriculumTopic, CurriculumSubtopic
    
    t_res = await db.execute(select(CurriculumTopic))
    all_topics = t_res.scalars().all()
    
    chapter_clean = chapter_slug.replace("-", " ").lower()
    matched_topic_id = None
    
    for t in all_topics:
        title_cl = t.title.lower().replace("-", " ")
        if chapter_clean in title_cl or title_cl in chapter_clean:
            matched_topic_id = t.id
            break
            
    if not matched_topic_id:
        return {"topics": []}
        
    s_res = await db.execute(select(CurriculumSubtopic).where(CurriculumSubtopic.topic_id == matched_topic_id))
    subtopics = s_res.scalars().all()
    
    return {"topics": [{"id": str(s.id), "name": s.title} for s in subtopics]}


@router.post("/session/create")
async def create_session(
    req: CreateSessionRequest,
    db: AsyncSession = Depends(get_pg_session),
):
    """Create a test session. Returns session_id and first batch of questions."""
    _load_qbank()

    # Pick questions based on test type
    subject = req.subject
    chapter = req.chapter
    limit = req.question_count

    if req.test_type == "full_mock":
        # 180 questions evenly distributed across 4 subjects
        qs = []
        for sub in ["physics", "chemistry", "botany", "zoology"]:
            qs.extend(filter_questions(subject=sub, limit=45, weak_chapters=req.weak_chapters))
        random.shuffle(qs)
        qs = qs[:180]
        limit = 180
        req.time_limit_mins = 200  # 3h 20min NEET standard
    elif req.test_type == "chapter_mock":
        # Full chapter — all available questions up to limit (30-50)
        if not chapter:
            raise HTTPException(status_code=400, detail="chapter_mock requires a chapter.")
        limit = max(req.question_count, 30)  # minimum 30 for a chapter mock
        qs = filter_questions(subject=subject, chapter=chapter, limit=limit)
    elif req.test_type == "topic_quiz":
        # Short focused quiz — 10-20 questions from a specific chapter
        limit = min(req.question_count, 20)  # cap at 20 for topic quiz
        qs = filter_questions(subject=subject, chapter=chapter, limit=limit)
    elif req.test_type == "practice_drill":
        qs = filter_questions(
            subject=subject, chapter=chapter,
            limit=limit, weak_chapters=req.weak_chapters
        )
    else:
        qs = filter_questions(subject=subject, chapter=chapter, limit=limit)

    if not qs:
        raise HTTPException(status_code=404, detail="No questions found for the given filters.")

    session_id = str(uuid.uuid4())
    question_ids = [q["id"] for q in qs]

    session = TestSession(
        id=session_id,
        user_id=req.user_id,
        test_type=req.test_type,
        status="active",
        config={
            "subject": subject,
            "chapter": chapter,
            "question_count": len(qs),
            "time_limit_mins": req.time_limit_mins,
        },
        question_ids=question_ids,
        question_snapshot=qs,  # Store full question data for results
        answers={},
        started_at=datetime.utcnow(),
        current_question_index=0,
        total_time_taken_ms=0,
    )
    db.add(session)
    await db.commit()

    # Send questions without correct answers
    safe_qs = []
    for q in qs:
        opts = q.get("options", [])
        safe_qs.append({
            "id": q["id"],
            "question": q["question"],
            "options": [{"label": o["label"], "text": o["text"]} for o in opts],
            "chapter": q.get("chapter"),
            "chapter_name": q.get("chapter_name"),
            "subject": q.get("subject"),
            "year": q.get("year"),
            "difficulty": q.get("difficulty"),
            "image": q.get("image", False),
        })

    return {
        "session_id": session_id,
        "test_type": req.test_type,
        "question_count": len(qs),
        "time_limit_mins": req.time_limit_mins,
        "questions": safe_qs,
        "started_at": session.started_at.isoformat(),
    }


@router.get("/session/{session_id}")
async def get_session(session_id: str, db: AsyncSession = Depends(get_pg_session)):
    """Resume a session (e.g. on page reload). Returns safe question list and any saved answers."""
    result = await db.execute(select(TestSession).where(TestSession.id == session_id))
    session = result.scalars().first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    if session.status == "completed":
        raise HTTPException(status_code=400, detail="Session already completed. View results instead.")

    qs = session.question_snapshot or []
    safe_qs = []
    for q in qs:
        opts = q.get("options", [])
        safe_qs.append({
            "id": q["id"],
            "question": q["question"],
            "options": [{"label": o["label"], "text": o["text"]} for o in opts],
            "chapter": q.get("chapter"),
            "chapter_name": q.get("chapter_name"),
            "subject": q.get("subject"),
            "year": q.get("year"),
            "difficulty": q.get("difficulty"),
            "image": q.get("image", False),
        })

    time_elapsed_ms = int((datetime.utcnow() - session.started_at).total_seconds() * 1000)
    time_limit_ms = session.config.get("time_limit_mins", 30) * 60 * 1000

    return {
        "session_id": session_id,
        "test_type": session.test_type,
        "questions": safe_qs,
        "answers": session.answers or {},
        "current_question_index": session.current_question_index or 0,
        "time_elapsed_ms": time_elapsed_ms,
        "time_remaining_ms": max(0, time_limit_ms - time_elapsed_ms),
        "started_at": session.started_at.isoformat(),
        "config": session.config,
    }


@router.patch("/session/{session_id}/answer")
async def save_answer(
    session_id: str,
    req: AnswerRequest,
    db: AsyncSession = Depends(get_pg_session),
):
    """Save a single answer. Called on every answer selection (auto-save)."""
    result = await db.execute(select(TestSession).where(TestSession.id == session_id))
    session = result.scalars().first()
    if not session or session.status == "completed":
        raise HTTPException(status_code=404, detail="Active session not found.")

    answers = dict(session.answers or {})
    answers[req.question_id] = {
        "selected_option": req.selected_option,
        "time_taken_ms": req.time_taken_ms,
        "flagged": req.flagged,
    }
    session.answers = answers
    session.current_question_index = (session.question_ids or []).index(req.question_id) if req.question_id in (session.question_ids or []) else session.current_question_index
    await db.merge(session)
    await db.commit()
    return {"status": "saved"}


@router.post("/session/{session_id}/submit")
async def submit_test(
    session_id: str,
    req: SubmitRequest,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_pg_session),
):
    """Submit test. Returns instant results. AI analysis runs in background."""
    result = await db.execute(select(TestSession).where(TestSession.id == session_id))
    session = result.scalars().first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    if session.status == "completed":
        # Already submitted — return existing report_id
        existing = await db.execute(
            select(TestReport).where(TestReport.session_id == session_id)
        )
        existing_report = existing.scalars().first()
        if existing_report:
            return {"status": "already_submitted", "report_id": existing_report.id}

    # Mark session as completed
    session.status = "completed"
    session.submitted_at = datetime.utcnow()
    await db.merge(session)
    await db.commit()

    # Compute instant results
    instant = _compute_instant_results(session)
    mistake_analysis = _classify_mistakes(instant["wrong_questions"], session.answers or {})
    weak_topics = _identify_weak_topics(instant["chapter_breakdown"])

    # Save initial report (no AI analysis yet)
    report_id = str(uuid.uuid4())
    report = TestReport(
        id=report_id,
        session_id=session_id,
        user_id=req.user_id,
        test_type=session.test_type,
        score=instant["score"],
        max_score=instant["max_score"],
        accuracy_pct=instant["accuracy_pct"],
        total_questions=instant["total_questions"],
        correct=instant["correct"],
        wrong=instant["wrong"],
        skipped=instant["skipped"],
        subject_breakdown=instant["subject_breakdown"],
        chapter_breakdown=instant["chapter_breakdown"],
        mistake_analysis=mistake_analysis,
        weak_topics=weak_topics,
        strong_topics=[],
        ai_feedback=None,  # Will be filled by background task
        ai_analysis_status="pending",
        created_at=datetime.utcnow(),
    )
    db.add(report)
    await db.commit()

    # Fire AI analysis background task
    background.add_task(_run_ai_analysis, report_id, instant, session.test_type, weak_topics)

    return {
        "status": "submitted",
        "report_id": report_id,
        "score": instant["score"],
        "max_score": instant["max_score"],
        "accuracy_pct": instant["accuracy_pct"],
        "correct": instant["correct"],
        "wrong": instant["wrong"],
        "skipped": instant["skipped"],
        "ai_analysis_status": "pending",
        "message": "Your detailed analysis is being prepared. We will notify you once it's ready.",
    }


@router.get("/{report_id}/results")
async def get_results(report_id: str, db: AsyncSession = Depends(get_pg_session)):
    """Instant results — always available right after submission."""
    result = await db.execute(select(TestReport).where(TestReport.id == report_id))
    report = result.scalars().first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found.")

    # Get session for per-question results
    session_result = await db.execute(
        select(TestSession).where(TestSession.id == report.session_id)
    )
    session = session_result.scalars().first()
    instant = _compute_instant_results(session) if session else {}

    return {
        "report_id": report_id,
        "test_type": report.test_type,
        "score": report.score,
        "max_score": report.max_score,
        "accuracy_pct": report.accuracy_pct,
        "correct": report.correct,
        "wrong": report.wrong,
        "skipped": report.skipped,
        "subject_breakdown": report.subject_breakdown,
        "chapter_breakdown": report.chapter_breakdown,
        "mistake_analysis": report.mistake_analysis,
        "weak_topics": report.weak_topics,
        "ai_analysis_status": report.ai_analysis_status,
        "ai_feedback": report.ai_feedback,
        "results": instant.get("results", []),
        "created_at": report.created_at.isoformat(),
    }


@router.get("/{report_id}/analysis")
async def get_analysis(report_id: str, db: AsyncSession = Depends(get_pg_session)):
    """Full analysis; includes AI feedback once ready."""
    result = await db.execute(select(TestReport).where(TestReport.id == report_id))
    report = result.scalars().first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found.")

    return {
        "report_id": report_id,
        "ai_analysis_status": report.ai_analysis_status,
        "ai_feedback": report.ai_feedback,
        "mistake_analysis": report.mistake_analysis,
        "weak_topics": report.weak_topics,
        "strong_topics": report.strong_topics or [],
        "subject_breakdown": report.subject_breakdown,
        "chapter_breakdown": report.chapter_breakdown,
    }


@router.get("/user/{user_id}/history")
async def get_user_history(user_id: str, db: AsyncSession = Depends(get_pg_session)):
    """Return all past tests for a user, most recent first."""
    result = await db.execute(
        select(TestReport)
        .where(TestReport.user_id == user_id)
        .order_by(desc(TestReport.created_at))
        .limit(20)
    )
    reports = result.scalars().all()
    return {
        "reports": [
            {
                "id": r.id,
                "report_id": r.id,
                "session_id": r.session_id,
                "test_type": r.test_type,
                "score": r.score,
                "max_score": r.max_score,
                "accuracy_pct": r.accuracy_pct,
                "correct": r.correct,
                "wrong": r.wrong,
                "skipped": r.skipped,
                "subject_breakdown": r.subject_breakdown or {},
                "chapter_breakdown": r.chapter_breakdown or {},
                "mistake_analysis": r.mistake_analysis or {},
                "weak_topics": r.weak_topics or [],
                "strong_topics": r.strong_topics or [],
                "ai_feedback": r.ai_feedback,
                "ai_analysis_status": r.ai_analysis_status,
                "created_at": r.created_at.isoformat(),
            }
            for r in reports
        ]
    }


@router.get("/user/{user_id}/weak-topics")
async def get_weak_topics(user_id: str, db: AsyncSession = Depends(get_pg_session)):
    """Aggregate weak topics across all past tests."""
    result = await db.execute(
        select(TestReport)
        .where(TestReport.user_id == user_id)
        .order_by(desc(TestReport.created_at))
        .limit(10)
    )
    reports = result.scalars().all()

    aggregated: Dict[str, Dict] = {}
    for report in reports:
        for wt in (report.weak_topics or []):
            ch = wt.get("chapter", "unknown")
            if ch not in aggregated:
                aggregated[ch] = {
                    "chapter": ch,
                    "chapter_name": wt.get("chapter_name", ch),
                    "subject": wt.get("subject", ""),
                    "total_error_rate": 0,
                    "occurrences": 0,
                }
            aggregated[ch]["total_error_rate"] += wt.get("error_rate", 0)
            aggregated[ch]["occurrences"] += 1

    weak_list = []
    for ch, data in aggregated.items():
        avg_error = data["total_error_rate"] / data["occurrences"]
        weak_list.append({
            **data,
            "avg_error_rate": round(avg_error, 1),
        })

    weak_list.sort(key=lambda x: x["avg_error_rate"], reverse=True)
    return {
        "weak_topics": [
            {
                **d,
                "error_rate": round(d["total_error_rate"] / d["occurrences"], 1),
                "total_attempts": d["occurrences"] * 5,  # approximate
            }
            for d in weak_list[:15]
        ]
    }


@router.post("/practice/generate")
async def generate_practice(
    user_id: str = "user_123",
    subject: Optional[str] = None,
    chapter: Optional[str] = None,
    question_count: int = 20,
    db: AsyncSession = Depends(get_pg_session),
):
    """Generate a targeted practice drill. Uses weak topic data for adaptive selection."""
    # Get user's past weak chapters
    weak_result = await get_weak_topics(user_id, db)
    weak_chapters = [wt["chapter"] for wt in weak_result.get("weak_topics", [])[:5]]

    qs = filter_questions(
        subject=subject,
        chapter=chapter,
        limit=question_count,
        weak_chapters=weak_chapters if not chapter else None,
    )
    if not qs:
        raise HTTPException(status_code=404, detail="No questions found.")

    # Create a practice drill session
    session_id = str(uuid.uuid4())
    session = TestSession(
        id=session_id,
        user_id=user_id,
        test_type="practice_drill",
        status="active",
        config={
            "subject": subject,
            "chapter": chapter,
            "question_count": len(qs),
            "time_limit_mins": question_count * 2,  # 2 min per question
        },
        question_ids=[q["id"] for q in qs],
        question_snapshot=qs,
        answers={},
        started_at=datetime.utcnow(),
        current_question_index=0,
        total_time_taken_ms=0,
    )
    db.add(session)
    await db.commit()

    safe_qs = [
        {
            "id": q["id"],
            "question": q["question"],
            "options": [{"label": o["label"], "text": o["text"]} for o in q.get("options", [])],
            "chapter": q.get("chapter"),
            "chapter_name": q.get("chapter_name"),
            "subject": q.get("subject"),
            "year": q.get("year"),
            "difficulty": q.get("difficulty"),
        }
        for q in qs
    ]

    return {"session_id": session_id, "questions": safe_qs, "time_limit_mins": session.config["time_limit_mins"]}


# ─────────────────────────────────────────────────────────────────────────────
# WebSocket — Timer Sync + Session Heartbeat
# ─────────────────────────────────────────────────────────────────────────────

@router.websocket("/ws/{session_id}")
async def test_websocket(websocket: WebSocket, session_id: str):
    """
    WebSocket for live timer sync and session persistence.
    Client sends: { type: "heartbeat" | "time_update", elapsed_ms: int }
    Server sends: { type: "timer", time_remaining_ms: int, status: "active"|"expired" }
    """
    await websocket.accept()

    try:
        async with await get_pg_session_direct() as db:
            result = await db.execute(select(TestSession).where(TestSession.id == session_id))
            session = result.scalars().first()
            if not session or session.status == "completed":
                await websocket.send_json({"type": "error", "message": "Session not found or completed."})
                await websocket.close()
                return

            time_limit_ms = session.config.get("time_limit_mins", 30) * 60 * 1000

        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_json(), timeout=5.0)
                msg_type = data.get("type", "heartbeat")

                async with await get_pg_session_direct() as db:
                    result = await db.execute(select(TestSession).where(TestSession.id == session_id))
                    session = result.scalars().first()
                    if not session:
                        break

                    elapsed = int((datetime.utcnow() - session.started_at).total_seconds() * 1000)
                    remaining = max(0, time_limit_ms - elapsed)

                    await websocket.send_json({
                        "type": "timer",
                        "elapsed_ms": elapsed,
                        "time_remaining_ms": remaining,
                        "status": "expired" if remaining == 0 else "active",
                        "answered_count": len(session.answers or {}),
                    })

                    if remaining == 0 and session.status == "active":
                        # Auto-expire
                        session.status = "expired"
                        await db.merge(session)
                        await db.commit()
                        await websocket.send_json({"type": "expired", "message": "Time is up! Submitting your test."})
                        break

            except asyncio.TimeoutError:
                # Send heartbeat ping
                await websocket.send_json({"type": "ping"})

    except WebSocketDisconnect:
        pass


# ─────────────────────────────────────────────────────────────────────────────
# AI Analysis Background Task
# ─────────────────────────────────────────────────────────────────────────────

async def _run_ai_analysis(report_id: str, instant: dict, test_type: str, weak_topics: list):
    """
    Background task: Generate AI feedback using Gemini.
    Updates the report with ai_feedback and ai_analysis_status.
    """
    try:
        from services.tutor_service import _get_gemini_client
        import os

        client = _get_gemini_client()
        model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

        # Build a concise prompt from results
        sub_summary = "\n".join([
            f"- {sub}: {stats.get('correct',0)} correct, {stats.get('wrong',0)} wrong, {stats.get('skipped',0)} skipped"
            for sub, stats in (instant.get("subject_breakdown") or {}).items()
        ])
        weak_summary = "\n".join([
            f"- {wt['chapter_name']} ({wt['subject']}): {wt['error_rate']}% error rate"
            for wt in weak_topics[:5]
        ]) or "No significant weak areas identified."

        prompt = f"""You are an expert NEET coaching analyst. A student just completed a {test_type.replace('_', ' ')}.

Results Summary:
- Score: {instant.get('score')}/{instant.get('max_score')}
- Accuracy: {instant.get('accuracy_pct')}%
- Correct: {instant.get('correct')}, Wrong: {instant.get('wrong')}, Skipped: {instant.get('skipped')}

Subject-wise Performance:
{sub_summary}

Top Weak Areas (chapters with >30% error rate):
{weak_summary}

Write a concise, personalized analysis (5-7 sentences) that:
1. Highlights what the student did well
2. Identifies the 2-3 most critical areas to improve
3. Gives specific actionable advice (e.g., "Focus on revising Newton's laws numericals")
4. Ends with an encouraging note

Be direct, specific and helpful. Do NOT include JSON."""

        response = client.models.generate_content(model=model, contents=prompt)
        ai_feedback = response.text.strip()

        # Update report
        async with await get_pg_session_direct() as db:
            res = await db.execute(select(TestReport).where(TestReport.id == report_id))
            report = res.scalars().first()
            if report:
                report.ai_feedback = ai_feedback
                report.ai_analysis_status = "ready"

                # Identify strong topics
                strong = [
                    {"chapter": ch, "chapter_name": s.get("chapter_name", ch), "subject": s.get("subject",""), "accuracy": round(s["correct"] / max(s["correct"] + s["wrong"], 1) * 100, 1)}
                    for ch, s in (instant.get("chapter_breakdown") or {}).items()
                    if s["correct"] > 0 and (s["correct"] / max(s["correct"] + s["wrong"], 1)) >= 0.7
                ]
                strong.sort(key=lambda x: x["accuracy"], reverse=True)
                report.strong_topics = strong[:5]

                await db.merge(report)
                await db.commit()
                print(f"[OK] AI analysis ready for report {report_id}")

    except Exception as e:
        print(f"[ERROR] AI analysis failed for {report_id}: {e}")
        try:
            async with await get_pg_session_direct() as db:
                res = await db.execute(select(TestReport).where(TestReport.id == report_id))
                report = res.scalars().first()
                if report:
                    report.ai_analysis_status = "failed"
                    await db.merge(report)
                    await db.commit()
        except Exception:
            pass
