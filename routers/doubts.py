"""
REST endpoints for user doubts (AI-detected confusion/misconceptions).
"""
import uuid
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from db.postgres_client import get_pg_session
from db.postgres_models import UserDoubt, DoubtStatus

router = APIRouter(prefix="/doubts", tags=["doubts"])


class DoubtOut(BaseModel):
    id: str
    user_id: str
    subtopic_id: str
    subtopic_name: str
    topic_id: Optional[str]
    topic_name: Optional[str]
    doubt_type: str
    description: str
    status: str
    occurrence_count: int
    created_at: str
    resolved_at: Optional[str]

    class Config:
        from_attributes = True


def _serialize(d: UserDoubt) -> dict:
    return {
        "id": d.id,
        "user_id": d.user_id,
        "subtopic_id": d.subtopic_id,
        "subtopic_name": d.subtopic_name,
        "topic_id": d.topic_id,
        "topic_name": d.topic_name,
        "doubt_type": d.doubt_type,
        "description": d.description,
        "status": d.status.value,
        "occurrence_count": d.occurrence_count,
        "created_at": d.created_at.isoformat(),
        "resolved_at": d.resolved_at.isoformat() if d.resolved_at else None,
    }


@router.get("/{user_id}")
async def list_doubts(
    user_id: str,
    status: Optional[str] = "active",
    db: AsyncSession = Depends(get_pg_session),
):
    """List all doubts for a user, filtered by status (active/resolved/all)."""
    query = select(UserDoubt).where(UserDoubt.user_id == user_id)
    if status and status != "all":
        try:
            status_enum = DoubtStatus(status)
            query = query.where(UserDoubt.status == status_enum)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")
    query = query.order_by(UserDoubt.created_at.desc())
    result = await db.execute(query)
    doubts = result.scalars().all()
    return {"doubts": [_serialize(d) for d in doubts], "total": len(doubts)}


@router.patch("/{doubt_id}/resolve")
async def resolve_doubt(doubt_id: str, db: AsyncSession = Depends(get_pg_session)):
    """Mark a doubt as resolved."""
    result = await db.execute(select(UserDoubt).where(UserDoubt.id == doubt_id))
    doubt = result.scalars().first()
    if not doubt:
        raise HTTPException(status_code=404, detail="Doubt not found")
    doubt.status = DoubtStatus.resolved
    doubt.resolved_at = datetime.utcnow()
    await db.commit()
    return _serialize(doubt)


@router.patch("/{doubt_id}/unresolve")
async def unresolve_doubt(doubt_id: str, db: AsyncSession = Depends(get_pg_session)):
    """Re-open a previously resolved doubt."""
    result = await db.execute(select(UserDoubt).where(UserDoubt.id == doubt_id))
    doubt = result.scalars().first()
    if not doubt:
        raise HTTPException(status_code=404, detail="Doubt not found")
    doubt.status = DoubtStatus.active
    doubt.resolved_at = None
    await db.commit()
    return _serialize(doubt)


@router.delete("/{doubt_id}")
async def delete_doubt(doubt_id: str, db: AsyncSession = Depends(get_pg_session)):
    """Permanently delete a doubt entry."""
    result = await db.execute(select(UserDoubt).where(UserDoubt.id == doubt_id))
    doubt = result.scalars().first()
    if not doubt:
        raise HTTPException(status_code=404, detail="Doubt not found")
    await db.delete(doubt)
    await db.commit()
    return {"deleted": True, "id": doubt_id}
