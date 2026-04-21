from db.postgres_client import async_session_maker
from db.postgres_models import UserSubtopicProgress, SubtopicStatus
from sqlalchemy import select
from routers.graph import get_next_topics

async def get_next_recommended_topic_for_user(user_id: str, current_subtopic_id: str):
    """
    Intelligent agent logic to decide what the user should learn next.
    Checks if the current topic/subtopic is marked as completed in Postgres.
    If not, it recommends practicing more. If it is, it fetches the next topic from Neo4j.
    """
    async with async_session_maker() as db:
        res = await db.execute(
            select(UserSubtopicProgress)
            .where(
                UserSubtopicProgress.user_id == user_id, 
                UserSubtopicProgress.subtopic_id == current_subtopic_id
            )
        )
        progress = res.scalars().first()
        status = progress.status.name if progress else SubtopicStatus.not_started.name
            
    # Always recommend the next in the sequence using our Neo4j logic, regardless of lock
    try:
        from routers.graph import get_session, _resolve_node
        # Resolve current name for better feedback
        current_name = current_subtopic_id
        with get_session() as session:
            node = _resolve_node(session, current_subtopic_id)
            if node:
                current_name = node.get("name") or node.get("title") or current_subtopic_id

        seq_res = get_next_topics(current_subtopic_id, count=1)
        if seq_res.sequence:
            next_topic = seq_res.sequence[0]
            reason_str = "Proceeding to the next sequential topic in the curriculum." if status == SubtopicStatus.completed.name else f"Current topic '{current_name}' status is '{status.lower().replace('_', ' ')}'. You may proceed or keep practicing."
            return {
                "recommended_next": next_topic,
                "reason": reason_str
            }
        return {"recommended_next": None, "reason": "End of curriculum reached."}
    except Exception as e:
        return {"error": str(e)}
