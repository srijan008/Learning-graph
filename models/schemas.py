from __future__ import annotations
from typing import Literal, Optional
from pydantic import BaseModel, Field

# Valid neighbour types
NeighbourType = Literal["prerequisites", "subtopics", "parent", "unlocks", "next", "previous"]
ALL_NEIGHBOUR_TYPES: list[NeighbourType] = ["prerequisites", "subtopics", "parent", "unlocks", "next", "previous"]


# ─── Request ────────────────────────────────────────────────────────────────

class NeighboursRequest(BaseModel):
    """
    Provide `topic` (topic_id or name) and optionally `subtopic`.
    If `subtopic` is given the neighbours of that specific subtopic are returned.

    - `limit`   : max number of nodes returned per list (prerequisites / subtopics / unlocks).
                  Range: 1–50. Default: 10.
    - `include` : which neighbour types to fetch. Omit unwanted types to keep
                  the response small. Defaults to all four types.
    """
    topic: str
    subtopic: Optional[str] = None
    limit: int = Field(default=10, ge=1, le=50, description="Max results per neighbour list (1-50)")
    include: list[NeighbourType] = Field(
        default=ALL_NEIGHBOUR_TYPES,
        description="Which neighbour types to return",
    )


# ─── Response pieces ────────────────────────────────────────────────────────

class TopicNode(BaseModel):
    topic_id: str
    name: str
    level: Optional[str] = None
    subject: Optional[str] = None
    chapter: Optional[str] = None
    difficulty: Optional[float] = None
    estimated_hours: Optional[float] = None
    description: Optional[str] = None


class NeighboursResponse(BaseModel):
    """
    The resolved node (topic or subtopic) together with its immediate
    graph neighbours.
    """
    node: TopicNode

    # things this node REQUIRES (its prerequisites)
    prerequisites: list[TopicNode] = []

    # direct HAS_SUBTOPIC children
    subtopics: list[TopicNode] = []

    # the node that has this node as a HAS_SUBTOPIC child (its parent)
    parent: Optional[TopicNode] = None

    # nodes that REQUIRE this node (what gets unlocked after mastering this)
    unlocks: list[TopicNode] = []

    # sequential neighbours
    next: list[TopicNode] = []
    previous: list[TopicNode] = []

class SequenceResponse(BaseModel):
    """
    Returns the sequential topics (next or previous) for a given topic.
    """
    node: TopicNode
    sequence: list[TopicNode] = []


class InfographicRequest(BaseModel):
    query: str

