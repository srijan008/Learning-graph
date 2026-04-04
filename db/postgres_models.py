import enum
import uuid
from datetime import datetime
from typing import Optional, List

from sqlalchemy import String, Integer, DateTime, Enum, Boolean, JSON, ForeignKey, Text, Float
from sqlalchemy.orm import declarative_base, Mapped, mapped_column

Base = declarative_base()


class SubtopicStatus(enum.Enum):
    not_started = "not_started"
    in_progress = "in_progress"
    completed = "completed"


class MistakeType(enum.Enum):
    conceptual = "conceptual"
    calculation = "calculation"
    reading_error = "reading_error"
    other = "other"


class DoubtStatus(enum.Enum):
    active = "active"
    resolved = "resolved"


class JourneyStatus(enum.Enum):
    active = "active"
    paused = "paused"
    completed = "completed"


class NodeStatus(enum.Enum):
    locked = "locked"
    available = "available"
    in_progress = "in_progress"
    completed = "completed"


class UserGoal(Base):
    __tablename__ = "user_goals"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, index=True)
    goal_id: Mapped[str] = mapped_column(String)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class UserSubtopicProgress(Base):
    __tablename__ = "user_subtopic_progress"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, index=True)
    subtopic_id: Mapped[str] = mapped_column(String, index=True)
    status: Mapped[SubtopicStatus] = mapped_column(Enum(SubtopicStatus), default=SubtopicStatus.not_started)
    last_studied_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    time_spent_minutes: Mapped[int] = mapped_column(Integer, default=0)
    theory_score: Mapped[int] = mapped_column(Integer, default=0)
    example_score: Mapped[int] = mapped_column(Integer, default=0)
    cross_question_score: Mapped[int] = mapped_column(Integer, default=0)


class UserMistakeTracking(Base):
    __tablename__ = "user_mistake_tracking"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, index=True)
    subtopic_id: Mapped[str] = mapped_column(String, index=True)
    question_id: Mapped[str] = mapped_column(String)
    mistake_type: Mapped[MistakeType] = mapped_column(Enum(MistakeType))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class UserTestReport(Base):
    __tablename__ = "user_test_reports"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, index=True)
    curriculum: Mapped[str] = mapped_column(String, default="NEET")
    subject_id: Mapped[Optional[str]] = mapped_column(String)
    chapter_id: Mapped[Optional[str]] = mapped_column(String)
    topic_id: Mapped[Optional[str]] = mapped_column(String)
    score: Mapped[int] = mapped_column(Integer, default=0)
    total_questions: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class UserTestAnswer(Base):
    __tablename__ = "user_test_answers"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    report_id: Mapped[str] = mapped_column(String, ForeignKey("user_test_reports.id"), index=True)
    question_id: Mapped[str] = mapped_column(String, index=True)
    selected_option: Mapped[Optional[str]] = mapped_column(String)
    correct_option: Mapped[Optional[str]] = mapped_column(String)
    is_correct: Mapped[bool] = mapped_column(Boolean)
    time_taken_seconds: Mapped[int] = mapped_column(Integer, default=0)


class TutorChatSession(Base):
    """
    One session per (user, topic). Shared across all subtopics within that topic.
    Stores rolling context compression (prior_summary + recent_messages) and
    independent confidence scores per subtopic.
    """
    __tablename__ = "tutor_chat_sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True)  # {user_id}_{topic_id}
    user_id: Mapped[str] = mapped_column(String, index=True)
    topic_id: Mapped[str] = mapped_column(String, index=True)
    current_subtopic_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    prior_summary: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    recent_messages: Mapped[Optional[dict]] = mapped_column(JSON, default=list)
    message_count: Mapped[int] = mapped_column(Integer, default=0)
    subtopic_scores: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class UserDoubt(Base):
    """
    Doubts/confusions detected by the AI tutor during chat.
    Upserted asynchronously via BackgroundTasks — zero chat latency impact.
    """
    __tablename__ = "user_doubts"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, index=True)
    subtopic_id: Mapped[str] = mapped_column(String, index=True)
    subtopic_name: Mapped[str] = mapped_column(String)
    topic_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    topic_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    doubt_type: Mapped[str] = mapped_column(String)          # conceptual | calculation | misconception | other
    description: Mapped[str] = mapped_column(Text)
    raw_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[DoubtStatus] = mapped_column(Enum(DoubtStatus), default=DoubtStatus.active)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    occurrence_count: Mapped[int] = mapped_column(Integer, default=1)


class LearningJourney(Base):
    """
    A user-defined learning goal with schedule preferences.
    Generates an ordered list of JourneyTopicNode entries.
    """
    __tablename__ = "learning_journeys"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, index=True)
    goal: Mapped[str] = mapped_column(Text)                           # e.g. "Prepare for NEET 2025"
    subjects: Mapped[Optional[dict]] = mapped_column(JSON, default=list)    # list of subject IDs
    study_span_months: Mapped[int] = mapped_column(Integer, default=4)      # 2 / 6 / 10
    weekly_hours: Mapped[int] = mapped_column(Integer, default=10)
    session_minutes: Mapped[int] = mapped_column(Integer, default=60)
    difficulty: Mapped[str] = mapped_column(String, default="standard")     # standard / accelerated / deep_dive
    status: Mapped[JourneyStatus] = mapped_column(Enum(JourneyStatus), default=JourneyStatus.active)
    total_topics: Mapped[int] = mapped_column(Integer, default=0)
    completed_topics: Mapped[int] = mapped_column(Integer, default=0)
    estimated_total_hours: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class JourneyTopicNode(Base):
    """
    One topic (or subtopic) entry in a learning journey.
    Ordered by prerequisite-aware topological sort.
    """
    __tablename__ = "journey_topic_nodes"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    journey_id: Mapped[str] = mapped_column(String, ForeignKey("learning_journeys.id"), index=True)
    topic_id: Mapped[str] = mapped_column(String, index=True)
    topic_name: Mapped[str] = mapped_column(String)
    subject_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    chapter_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    estimated_hours: Mapped[float] = mapped_column(Float, default=1.0)
    prerequisite_topic_ids: Mapped[Optional[dict]] = mapped_column(JSON, default=list)  # list of topic IDs
    node_status: Mapped[NodeStatus] = mapped_column(Enum(NodeStatus), default=NodeStatus.locked)
    week_number: Mapped[int] = mapped_column(Integer, default=1)     # scheduled week
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
