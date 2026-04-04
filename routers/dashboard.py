from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from db.postgres_client import get_pg_session
from db.postgres_models import UserMistakeTracking, UserSubtopicProgress, TutorChatSession

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

from fastapi.responses import JSONResponse
import traceback

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
    Joins Postgres TutorChatSession scores with Neo4j node names.
    """
    try:
        # 1. Get all TutorChatSessions for this user
        result = await db.execute(select(TutorChatSession).where(TutorChatSession.user_id == user_id))
        sessions = result.scalars().all()
        
        if not sessions:
            return {"topics": []}
            
        topic_ids = [s.topic_id for s in sessions]
        session_map = {s.topic_id: s for s in sessions}
        
        # 2. Get names from Neo4j
        from db.neo4j_client import get_session as get_neo4j_session
        
        query = """
        MATCH (t:Topic)
        WHERE t.id IN $topic_ids
        OPTIONAL MATCH (t)-[:HAS_SUBTOPIC]->(s:Subtopic)
        RETURN t.id AS topic_id, t.name AS topic_name, 
               collect({id: s.id, name: s.name}) AS subtopics
        """
        response_topics = []
        with get_neo4j_session() as driver_session:
            records = driver_session.run(query, topic_ids=topic_ids).data()
            
            for r in records:
                tid = r["topic_id"]
                tname = r["topic_name"]
                t_session = session_map.get(tid)
                scores = t_session.subtopic_scores if t_session and t_session.subtopic_scores else {}
                
                subs = []
                total_conf = 0
                max_conf = len(r["subtopics"]) * 100 if r["subtopics"] else 100
                
                for s in r["subtopics"]:
                    if not s["id"]: continue
                    raw_conf = scores.get(s["id"], 0)
                    if isinstance(raw_conf, dict):
                        conf = (raw_conf.get("theory", 0) + raw_conf.get("example", 0) + raw_conf.get("cross", 0)) // 3
                    else:
                        conf = raw_conf
                    total_conf += conf
                    subs.append({
                        "subtopic_id": s["id"],
                        "subtopic_name": s["name"],
                        "confidence": conf
                    })
                
                avg_completion = round((total_conf / max_conf) * 100) if max_conf > 0 else 0
                
                response_topics.append({
                    "topic_id": tid,
                    "topic_name": tname,
                    "completion_percentage": avg_completion,
                    "subtopics": subs
                })
                
        # Sort by completion (lowest first) to highlight weak topics
        response_topics.sort(key=lambda x: x["completion_percentage"])
        return {"topics": response_topics}
        
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e), "traceback": traceback.format_exc()})
