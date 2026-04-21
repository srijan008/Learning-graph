"""
Async background worker: processes detected doubts from LLM chat responses
and upserts them into the user_doubts table.

Called via FastAPI BackgroundTasks — runs AFTER the stream response is delivered,
so it has zero impact on chat latency.
"""
import uuid
from datetime import datetime
from sqlalchemy import select, and_

from db.postgres_models import UserDoubt, DoubtStatus


async def process_doubts(
    db,  # unused (kept for compatibility); we create our own session
    user_id: str,
    user_message: str,
    topic_id: str,
    topic_name: str,
    subtopic_names: dict,  # {subtopic_id: subtopic_name}
    doubts_list: list,
):
    """
    Upsert each detected doubt into user_doubts.
    Merges on (user_id, subtopic_id, doubt_type) to avoid duplicates.
    Creates its own DB session since background tasks run outside FastAPI's DI lifecycle.
    """
    if not doubts_list:
        return

    from db.postgres_client import async_session_maker

    async with async_session_maker() as session:
        for doubt_info in doubts_list:
            subtopic_id = doubt_info.get("subtopic_id", "")
            doubt_type = doubt_info.get("doubt_type", "other")
            description = doubt_info.get("description", "")

            if not subtopic_id or not description:
                continue

            subtopic_name = subtopic_names.get(subtopic_id, subtopic_id)

            try:
                # Check for existing active doubt with same (user, subtopic, type)
                result = await session.execute(
                    select(UserDoubt).where(
                        and_(
                            UserDoubt.user_id == user_id,
                            UserDoubt.subtopic_id == subtopic_id,
                            UserDoubt.doubt_type == doubt_type,
                            UserDoubt.status == DoubtStatus.active,
                        )
                    )
                )
                existing = result.scalars().first()

                if existing:
                    # Increment occurrence count, update with latest wording
                    existing.occurrence_count += 1
                    existing.description = description
                    existing.raw_message = user_message
                else:
                    new_doubt = UserDoubt(
                        id=str(uuid.uuid4()),
                        user_id=user_id,
                        subtopic_id=subtopic_id,
                        subtopic_name=subtopic_name,
                        topic_id=topic_id,
                        topic_name=topic_name,
                        doubt_type=doubt_type,
                        description=description,
                        raw_message=user_message,
                        status=DoubtStatus.active,
                    )
                    session.add(new_doubt)

                await session.commit()
                print("___DOUBT WORKER SUCCESS___: Upserted", len(doubts_list), "doubts.")
            except Exception as e:
                print("___DOUBT WORKER EXCEPTION___:", str(e))
                await session.rollback()
