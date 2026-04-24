from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from db.postgres_client import get_pg_session
from db.postgres_models import UserMistakeTracking, UserSubtopicProgress, TutorChatSession

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

from fastapi.responses import JSONResponse
import traceback
import uuid
from typing import Optional, List, Any
import logging
logger = logging.getLogger(__name__)

@router.get("/{user_id}/stats")
async def get_dashboard_stats(user_id: str, db: AsyncSession = Depends(get_pg_session)):
    """
    Returns dashboard statistics for the user including their mistake distribution 
    and overall progress counts.
    """
    try:
        # 1. Mistake Distribution
        mistakes_result = await db.execute(
            select(UserMistakeTracking.mistake_type, func.count(UserMistakeTracking.id))
            .where(UserMistakeTracking.user_id == user_id)
            .group_by(UserMistakeTracking.mistake_type)
        )
        def get_name(val):
            if hasattr(val, "name"): return val.name
            return str(val) if val is not None else "Unknown"

        mistake_counts = {get_name(row[0]): row[1] for row in mistakes_result.all()}
        
        # 2. Progress Overview
        progress_result = await db.execute(
            select(UserSubtopicProgress.status, func.count(UserSubtopicProgress.id))
            .where(UserSubtopicProgress.user_id == user_id)
            .group_by(UserSubtopicProgress.status)
        )
        progress_counts = {get_name(row[0]): row[1] for row in progress_result.all()}
        
        # 3. Total time spent
        time_result = await db.execute(
            select(func.sum(UserSubtopicProgress.time_spent_minutes))
            .where(UserSubtopicProgress.user_id == user_id)
        )
        total_time = time_result.scalar() or 0
        
        return {
            "user_id": user_id,
            "mistake_distribution": mistake_counts,
            "progress_summary": progress_counts,
            "total_time_spent_minutes": total_time
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e), "traceback": traceback.format_exc()})


@router.get("/{user_id}/topic-metrics")
async def get_topic_metrics(user_id: str, db: AsyncSession = Depends(get_pg_session)):
    """
    Returns topic-level and subtopic-level progress metrics for the bar chart drilldown.
    Joins Postgres TutorChatSession scores with PostgreSQL curriculum taxonomy.
    """
    try:
        # 1. Get all TutorChatSessions for this user
        result = await db.execute(select(TutorChatSession).where(TutorChatSession.user_id == user_id))
        sessions = result.scalars().all()
        
        if not sessions:
            return {"topics": []}
            
        topic_ids = [s.topic_id for s in sessions if s.topic_id]
        session_map = {str(s.topic_id): s for s in sessions}
        
        # 2. Get names from PostgreSQL
        from db.postgres_models import CurriculumTopic, CurriculumSubtopic
        
        topic_uuids = []
        for tid in topic_ids:
            try:
                topic_uuids.append(uuid.UUID(tid) if isinstance(tid, str) else tid)
            except:
                pass

        if not topic_uuids:
            return {"topics": []}

        t_res = await db.execute(select(CurriculumTopic).where(CurriculumTopic.id.in_(topic_uuids)))
        topics_db = {str(t.id): t for t in t_res.scalars().all()}
        
        s_res = await db.execute(select(CurriculumSubtopic).where(CurriculumSubtopic.topic_id.in_(topic_uuids)))
        all_subs = s_res.scalars().all()
        subs_by_topic = {}
        for sub in all_subs:
            tid_str = str(sub.topic_id)
            subs_by_topic.setdefault(tid_str, []).append(sub)

        response_topics = []
        for tid_str, t_session in session_map.items():
            topic_record = topics_db.get(tid_str)
            if not topic_record:
                continue
            
            subtopic_records = subs_by_topic.get(tid_str, [])
            scores = t_session.subtopic_scores if t_session and t_session.subtopic_scores else {}
            
            subs = []
            total_conf = 0
            max_conf = len(subtopic_records) * 100 if subtopic_records else 100
            
            for s in subtopic_records:
                raw_conf = scores.get(str(s.id), 0)
                if isinstance(raw_conf, dict):
                    conf = (raw_conf.get("theory", 0) + raw_conf.get("example", 0) + raw_conf.get("cross", 0)) // 3
                else:
                    conf = raw_conf
                total_conf += conf
                subs.append({
                    "subtopic_id": str(s.id),
                    "subtopic_name": s.title,
                    "confidence": conf
                })
            
            avg_completion = round((total_conf / max_conf) * 100) if max_conf > 0 else 0
            
            response_topics.append({
                "topic_id": tid_str,
                "topic_name": topic_record.title,
                "completion_percentage": avg_completion,
                "subtopics": subs
            })
                
        response_topics.sort(key=lambda x: x["completion_percentage"])
        return {"topics": response_topics}
        
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e), "traceback": traceback.format_exc()})


@router.get("/{user_id}/chapters")
async def get_studied_chapters(user_id: str, db: AsyncSession = Depends(get_pg_session)):
    """List all chapters the user has studied or attempted a test for."""
    from db.postgres_models import TestReport
    
    chapters: dict = {}

    # From test reports
    try:
        reports_result = await db.execute(
            select(TestReport)
            .where(TestReport.user_id == user_id)
            .order_by(desc(TestReport.created_at))
            .limit(30)
        )
        reports = reports_result.scalars().all()
        for r in reports:
            for ch, stats in (r.chapter_breakdown or {}).items():
                if ch not in chapters:
                    chapters[ch] = {
                        "chapter": ch,
                        "chapter_name": stats.get("chapter_name", ch),
                        "subject": stats.get("subject", ""),
                        "has_test_data": True,
                        "has_learning_data": False,
                    }
    except Exception:
        pass

    # From learning sessions (TutorChatSession topic_id → CurriculumTopic → chapter mapping)
    try:
        from db.postgres_models import CurriculumTopic, TutorChatSession
        sessions_result = await db.execute(
            select(TutorChatSession).where(TutorChatSession.user_id == user_id)
        )
        sessions = sessions_result.scalars().all()
        topic_ids = [s.topic_id for s in sessions if s.topic_id]
        
        topic_uuids = []
        for tid in topic_ids:
            try:
                topic_uuids.append(uuid.UUID(tid) if isinstance(tid, str) else tid)
            except:
                pass
                
        if topic_uuids:
            t_res = await db.execute(select(CurriculumTopic).where(CurriculumTopic.id.in_(topic_uuids)))
            topics_db = {str(t.id): t for t in t_res.scalars().all()}
            
            for s in sessions:
                topic = topics_db.get(str(s.topic_id))
                if topic:
                    ch_key = topic.title.lower().replace(" ", "_")
                    if ch_key not in chapters:
                        chapters[ch_key] = {
                            "chapter": ch_key,
                            "chapter_name": topic.title,
                            "subject": "",
                            "has_test_data": False,
                            "has_learning_data": True,
                            "topic_id": str(s.topic_id),
                        }
                    else:
                        chapters[ch_key]["has_learning_data"] = True
                        chapters[ch_key]["topic_id"] = str(s.topic_id)
    except Exception:
        pass

    return {"chapters": list(chapters.values())}


@router.get("/{user_id}/chapter-detail")
async def get_chapter_detail(
    user_id: str,
    chapter: str,
    db: AsyncSession = Depends(get_pg_session),
):
    """
    Comprehensive chapter analysis combining:
    - Test history performance for this chapter
    - Learning session progress (topic/subtopic confidence)
    - Strong/weak subtopics
    - Recommendations
    """
    from db.postgres_models import TestReport, TestSession, TutorChatSession, CurriculumTopic, CurriculumSubtopic

    result: dict = {
        "chapter": chapter,
        "chapter_name": chapter,
        "subject": "",
        # Test data
        "test_attempts": 0,
        "total_correct": 0,
        "total_wrong": 0,
        "total_skipped": 0,
        "avg_accuracy": 0.0,
        "total_time_on_chapter_ms": 0,
        "test_history": [],   # [{date, accuracy, correct, wrong, test_type}]
        # Per-question breakdown from latest session
        "question_detail": [],
        # Learning data
        "learning_sessions": 0,
        "study_time_minutes": 0,
        "subtopics": [],      # [{name, confidence, time_mins, status}]
        "avg_confidence": 0,
        # Aggregated insights
        "strong_subtopics": [],
        "weak_subtopics": [],
        "recommendations": [],
    }

    # ── Test data ──────────────────────────────────────────────────────────────
    try:
        reports_result = await db.execute(
            select(TestReport)
            .where(TestReport.user_id == user_id)
            .order_by(desc(TestReport.created_at))
            .limit(20)
        )
        all_reports = reports_result.scalars().all()

        accuracies = []
        for r in all_reports:
            ch_stats = (r.chapter_breakdown or {}).get(chapter)
            if not ch_stats:
                # Try to find by chapter_name substring
                for k, v in (r.chapter_breakdown or {}).items():
                    if chapter.lower() in k.lower() or chapter.lower() in v.get("chapter_name", "").lower():
                        ch_stats = v
                        result["chapter"] = k
                        break

            if ch_stats:
                correct   = ch_stats.get("correct", 0)
                wrong     = ch_stats.get("wrong", 0)
                skipped   = ch_stats.get("skipped", 0)
                time_ms   = ch_stats.get("time_ms", 0)
                chapter_name = ch_stats.get("chapter_name", chapter)
                subject   = ch_stats.get("subject", "")
                attempted = correct + wrong
                acc = round(correct / attempted * 100, 1) if attempted > 0 else 0.0

                result["chapter_name"] = chapter_name
                result["subject"] = subject
                result["test_attempts"] += 1
                result["total_correct"]  += correct
                result["total_wrong"]    += wrong
                result["total_skipped"]  += skipped
                result["total_time_on_chapter_ms"] += time_ms
                accuracies.append(acc)

                result["test_history"].append({
                    "date": r.created_at.isoformat(),
                    "test_type": r.test_type,
                    "accuracy": acc,
                    "correct": correct,
                    "wrong": wrong,
                    "skipped": skipped,
                    "time_ms": time_ms,
                    "score": r.score,
                    "report_id": r.id,
                })

        if accuracies:
            result["avg_accuracy"] = round(sum(accuracies) / len(accuracies), 1)

        # Per-question breakdown from latest session
        if all_reports:
            latest_report = all_reports[0]
            sess_result = await db.execute(
                select(TestSession).where(TestSession.id == latest_report.session_id)
            )
            sess = sess_result.scalars().first()
            if sess:
                qmap = {q["id"]: q for q in (sess.question_snapshot or [])}
                answers = sess.answers or {}
                for qid, q in qmap.items():
                    if q.get("chapter") == chapter or chapter.lower() in q.get("chapter", "").lower():
                        ans = answers.get(qid, {})
                        selected = ans.get("selected_option")
                        correct_opt = q.get("correct_option")
                        result["question_detail"].append({
                            "question_id": qid,
                            "question_snippet": q.get("question", "")[:100],
                            "is_correct": selected == correct_opt if selected else False,
                            "is_skipped": not selected,
                            "time_ms": ans.get("time_taken_ms", 0),
                            "flagged": ans.get("flagged", False),
                            "year": q.get("year", ""),
                        })
    except Exception as e:
        logger.error(f"Error in chapter test data: {e}")

    # ── Learning (session + subtopic) data ────────────────────────────────────
    try:
        sessions_result = await db.execute(
            select(TutorChatSession).where(TutorChatSession.user_id == user_id)
        )
        sessions = sessions_result.scalars().all()
        
        seen_subtopics = set()
        chapter_clean = chapter.replace("-", " ").replace("_", " ").lower()

        for s in sessions:
            try:
                tid_uuid = uuid.UUID(s.topic_id) if isinstance(s.topic_id, str) else s.topic_id
                t_res = await db.execute(select(CurriculumTopic).where(CurriculumTopic.id == tid_uuid))
                topic = t_res.scalars().first()
                if not topic:
                    continue

                # Match chapter by topic name
                topic_clean = topic.title.replace("-", " ").replace("_", " ").lower()
                if chapter_clean not in topic_clean and topic_clean not in chapter_clean:
                    continue

                result["learning_sessions"] += 1
                result["chapter_name"] = topic.title  # override if empty, or keep last matched

                # Subtopics
                subs_result = await db.execute(
                    select(CurriculumSubtopic).where(CurriculumSubtopic.topic_id == tid_uuid)
                )
                subtopics_db = subs_result.scalars().all()
                scores = s.subtopic_scores or {}

                for sub in subtopics_db:
                    if str(sub.id) in seen_subtopics:
                        continue
                    seen_subtopics.add(str(sub.id))
                    
                    raw = scores.get(str(sub.id), 0)
                    if isinstance(raw, dict):
                        conf = (raw.get("theory", 0) + raw.get("example", 0) + raw.get("cross", 0)) // 3
                    else:
                        conf = raw

                    # Get time from UserSubtopicProgress
                    prog_res = await db.execute(
                        select(UserSubtopicProgress)
                        .where(UserSubtopicProgress.user_id == user_id)
                        .where(UserSubtopicProgress.subtopic_id == str(sub.id))
                    )
                    prog = prog_res.scalars().first()
                    time_mins = prog.time_spent_minutes if prog else 0

                    result["subtopics"].append({
                        "subtopic_id": str(sub.id),
                        "subtopic_name": sub.title,
                        "confidence": conf,
                        "study_time_minutes": time_mins,
                        "status": prog.status.value if prog and hasattr(prog.status, "value") else (prog.status if prog else "not_started"),
                    })

            except Exception as loop_e:
                logger.error(f"Error processing learning session for chapter: {loop_e}")

        # Calculate final aggregated time correctly
        result["study_time_minutes"] = sum(
            sub.get("study_time_minutes", 0) for sub in result["subtopics"]
        )

        if result["subtopics"]:
            result["avg_confidence"] = round(
                sum(s["confidence"] for s in result["subtopics"]) / len(result["subtopics"]), 1
            )

    except Exception as e:
        logger.error(f"Error in chapter learning data: {e}")

    # ── Derived insights ──────────────────────────────────────────────────────
    result["strong_subtopics"] = [
        s for s in result["subtopics"] if s["confidence"] >= 65
    ]
    result["weak_subtopics"] = [
        s for s in result["subtopics"] if s["confidence"] < 40 and s["confidence"] >= 0
    ]

    # Recommendations
    recs = []
    for w in result["weak_subtopics"][:4]:
        recs.append({
            "type": "re_study",
            "subtopic": w["subtopic_name"],
            "reason": f"Low confidence ({w['confidence']}%) — needs revision",
            "priority": "high" if w["confidence"] < 20 else "medium",
        })
    if result["avg_accuracy"] < 50 and result["test_attempts"] > 0:
        recs.append({
            "type": "practice",
            "subtopic": result["chapter_name"],
            "reason": f"Average test accuracy is {result['avg_accuracy']}% — take more chapter mocks",
            "priority": "high",
        })
    if result["avg_accuracy"] >= 70:
        recs.append({
            "type": "advance",
            "subtopic": result["chapter_name"],
            "reason": "Strong performance — explore harder problems or attempt full mock",
            "priority": "low",
        })
    result["recommendations"] = recs

    return result
@router.get("/{user_id}/weekly-activity")
async def get_weekly_activity(user_id: str, db: AsyncSession = Depends(get_pg_session)):
    """
    Returns study minutes per day for the last 7 days and the current streak.
    """
    from datetime import datetime, timedelta, date
    now = datetime.utcnow()
    last_week = now - timedelta(days=7)
    
    try:
        # 1. Daily study minutes
        # In a real app, we'd have a 'study_sessions' table. 
        # Here we use UserSubtopicProgress.last_studied_at as a proxy.
        # This is limited but works for demonstration.
        result = await db.execute(
            select(func.date(UserSubtopicProgress.last_studied_at), func.sum(UserSubtopicProgress.time_spent_minutes))
            .where(UserSubtopicProgress.user_id == user_id)
            .where(UserSubtopicProgress.last_studied_at >= last_week)
            .group_by(func.date(UserSubtopicProgress.last_studied_at))
        )
        
        daily_stats = {str(row[0]): row[1] for row in result.all()}
        
        # 2. Current Streak
        # Count consecutive days with activity starting from today/yesterday
        streak = 0
        check_date = now.date()
        while True:
            res = await db.execute(
                select(func.count(UserSubtopicProgress.id))
                .where(UserSubtopicProgress.user_id == user_id)
                .where(func.date(UserSubtopicProgress.last_studied_at) == check_date)
            )
            if res.scalar() > 0:
                streak += 1
                check_date -= timedelta(days=1)
            else:
                # If no activity today, check yesterday to continue streak
                if check_date == now.date():
                    check_date -= timedelta(days=1)
                    continue
                break
        
        return {
            "daily_minutes": daily_stats,
            "current_streak": streak,
            "total_weekly_hours": round(sum(daily_stats.values()) / 60, 1)
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})

@router.get("/{user_id}/recent-completions")
async def get_recent_completions(user_id: str, db: AsyncSession = Depends(get_pg_session)):
    """
    Lists the last 5 completed subtopics.
    """
    from db.postgres_models import CurriculumSubtopic
    from sqlalchemy import cast, String
    try:
        result = await db.execute(
            select(UserSubtopicProgress, CurriculumSubtopic.title)
            .join(CurriculumSubtopic, cast(CurriculumSubtopic.id, String) == UserSubtopicProgress.subtopic_id)
            .where(UserSubtopicProgress.user_id == user_id)
            .where(UserSubtopicProgress.status == 'completed')
            .order_by(desc(UserSubtopicProgress.last_studied_at))
            .limit(5)
        )
        
        items = []
        for row in result.all():
            prog, title = row
            items.append({
                "subtopic_id": prog.subtopic_id,
                "subtopic_name": title,
                "completed_at": prog.last_studied_at.isoformat(),
                "time_spent": prog.time_spent_minutes
            })
            
        return {"completions": items}
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})
