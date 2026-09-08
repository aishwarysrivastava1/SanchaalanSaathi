"""SQLAlchemy models mapped onto the existing database tables.

Column names match what Django created, so both backends can run against
the same database during cutover. Do not rename a column without a paired
Alembic migration.

`Resource.meta` maps to a column literally named "metadata", which is
reserved on the declarative base. Ids are varchar(36) holding UUID4 text.
"""
from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


def new_id() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(tz=UTC)


class NGO(Base):
    __tablename__ = "ngos"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    invite_code: Mapped[str] = mapped_column(String(16), unique=True)
    created_by: Mapped[str] = mapped_column(String(36))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    sector: Mapped[str | None] = mapped_column(String(120), nullable=True)
    website: Mapped[str | None] = mapped_column(String(300), nullable=True)
    headquarters_city: Mapped[str | None] = mapped_column(String(120), nullable=True)
    primary_contact_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    primary_contact_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    operating_regions: Mapped[list] = mapped_column(JSONB, default=list)
    mission_focus: Mapped[list] = mapped_column(JSONB, default=list)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        Index("ix_users_ngo_id", "ngo_id"),
        Index("ix_users_role", "role"),
        Index("ix_users_ngo_role", "ngo_id", "role"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[str] = mapped_column(String(20))
    ngo_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    full_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    preferred_language: Mapped[str] = mapped_column(String(32), default="en")
    communication_opt_in: Mapped[bool] = mapped_column(Boolean, default=True)
    consent_analytics: Mapped[bool] = mapped_column(Boolean, default=True)
    consent_personalization: Mapped[bool] = mapped_column(Boolean, default=True)
    consent_ai_training: Mapped[bool] = mapped_column(Boolean, default=False)
    profile_completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)


class VolunteerProfile(Base):
    __tablename__ = "volunteer_profiles"
    __table_args__ = (
        Index("ix_vol_ngo_id", "ngo_id"),
        Index("ix_vol_status", "status"),
        Index("ix_vol_ngo_status", "ngo_id", "status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(String(36), unique=True)
    ngo_id: Mapped[str] = mapped_column(String(36))
    skills: Mapped[list] = mapped_column(JSONB, default=list)
    availability: Mapped[dict] = mapped_column(JSONB, default=dict)
    status: Mapped[str] = mapped_column(String(20), default="active")
    share_location: Mapped[bool] = mapped_column(Boolean, default=False)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    full_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    emergency_contact_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    emergency_contact_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    education_level: Mapped[str | None] = mapped_column(String(80), nullable=True)
    years_experience: Mapped[int | None] = mapped_column(Integer, nullable=True)
    preferred_roles: Mapped[list] = mapped_column(JSONB, default=list)
    certifications: Mapped[list] = mapped_column(JSONB, default=list)
    languages: Mapped[list] = mapped_column(JSONB, default=list)
    causes_supported: Mapped[list] = mapped_column(JSONB, default=list)
    motivation_statement: Mapped[str | None] = mapped_column(Text, nullable=True)
    availability_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    work_preferences: Mapped[dict] = mapped_column(JSONB, default=dict)
    last_active_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    profile_completeness_score: Mapped[float] = mapped_column(Float, default=0.0)


class ConsentEvent(Base):
    __tablename__ = "consent_events"
    __table_args__ = (
        Index("ix_consent_user_id", "user_id"),
        Index("ix_consent_scope", "scope"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(String(36))
    scope: Mapped[str] = mapped_column(String(30))
    granted: Mapped[bool] = mapped_column(Boolean)
    source: Mapped[str] = mapped_column(String(60), default="ui")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (
        Index("ix_task_ngo_id", "ngo_id"),
        Index("ix_task_status", "status"),
        Index("ix_task_ngo_status", "ngo_id", "status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    ngo_id: Mapped[str] = mapped_column(String(36))
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text, default="")
    required_skills: Mapped[list] = mapped_column(JSONB, default=list)
    priority: Mapped[str] = mapped_column(String(20), default="medium")
    status: Mapped[str] = mapped_column(String(20), default="open")
    deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )
    task_category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    estimated_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    urgency_score: Mapped[float] = mapped_column(Float, default=50.0)
    impact_tags: Mapped[list] = mapped_column(JSONB, default=list)


class Assignment(Base):
    __tablename__ = "assignments"
    __table_args__ = (
        Index("ix_assign_ngo_id", "ngo_id"),
        Index("ix_assign_volunteer_id", "volunteer_id"),
        Index("ix_assign_task_id", "task_id"),
        Index("ix_assign_ngo_status", "ngo_id", "status"),
        Index("ix_assign_volunteer_status", "volunteer_id", "status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    task_id: Mapped[str] = mapped_column(String(36))
    volunteer_id: Mapped[str] = mapped_column(String(36))
    ngo_id: Mapped[str] = mapped_column(String(36))
    status: Mapped[str] = mapped_column(String(20), default="assigned")
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )
    hours_spent: Mapped[float | None] = mapped_column(Float, nullable=True)
    completion_rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ngo_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    match_score: Mapped[float | None] = mapped_column(Float, nullable=True)


class Resource(Base):
    __tablename__ = "resources"
    __table_args__ = (Index("ix_res_ngo_id", "ngo_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    ngo_id: Mapped[str] = mapped_column(String(36))
    type: Mapped[str] = mapped_column(String(100))
    quantity: Mapped[int] = mapped_column(Integer, default=0)
    availability_status: Mapped[str] = mapped_column(String(20), default="available")
    # DB column is literally "metadata", reserved on the declarative base.
    meta: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)


class Allocation(Base):
    __tablename__ = "allocations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    resource_id: Mapped[str] = mapped_column(String(36))
    task_id: Mapped[str] = mapped_column(String(36))
    ngo_id: Mapped[str] = mapped_column(String(36))
    allocation_status: Mapped[str] = mapped_column(String(20), default="pending")


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (Index("ix_event_ngo_id", "ngo_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    ngo_id: Mapped[str] = mapped_column(String(36))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    event_type: Mapped[str] = mapped_column(String(20), default="drive")
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    location: Mapped[str] = mapped_column(String(300))
    max_volunteers: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="upcoming")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class EventAttendance(Base):
    __tablename__ = "event_attendance"
    __table_args__ = (Index("ix_ea_event_id", "event_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    event_id: Mapped[str] = mapped_column(String(36))
    volunteer_id: Mapped[str] = mapped_column(String(36))
    status: Mapped[str] = mapped_column(String(20), default="invited")


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (Index("ix_notif_user_id", "user_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(String(36))
    message: Mapped[str] = mapped_column(Text)
    type: Mapped[str] = mapped_column(String(30), default="general")
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class TaskEnrollmentRequest(Base):
    __tablename__ = "task_enrollment_requests"
    __table_args__ = (
        Index("ix_enroll_ngo_id", "ngo_id"),
        Index("ix_enroll_volunteer_id", "volunteer_id"),
        Index("ix_enroll_task_id", "task_id"),
        Index("ix_enroll_volunteer_status", "volunteer_id", "status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    task_id: Mapped[str] = mapped_column(String(36))
    volunteer_id: Mapped[str] = mapped_column(String(36))
    ngo_id: Mapped[str] = mapped_column(String(36))
    reason: Mapped[str] = mapped_column(Text, default="")
    why_useful: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ChatbotSession(Base):
    __tablename__ = "chatbot_sessions"
    __table_args__ = (
        Index("ix_chatbot_session_user_id", "user_id"),
        Index("ix_chatbot_session_ngo_id", "ngo_id"),
        Index("ix_chatbot_session_guest_id", "guest_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    guest_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    ngo_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    channel: Mapped[str] = mapped_column(String(40), default="web")
    language: Mapped[str] = mapped_column(String(32), default="en")
    context_tags: Mapped[list] = mapped_column(JSONB, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ChatbotMessage(Base):
    __tablename__ = "chatbot_messages"
    __table_args__ = (
        Index("ix_chatbot_msg_session_id", "session_id"),
        Index("ix_chatbot_msg_role", "role"),
        Index("ix_chatbot_msg_session_role", "session_id", "role"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    session_id: Mapped[str] = mapped_column(String(36))
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    guest_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    role: Mapped[str] = mapped_column(String(20))
    content: Mapped[str] = mapped_column(Text)
    prompt_features: Mapped[dict] = mapped_column(JSONB, default=dict)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    user_feedback: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ChatbotSemanticCache(Base):
    __tablename__ = "chatbot_semantic_cache"
    __table_args__ = (
        Index("ix_semantic_cache_hash", "input_hash"),
        Index("ix_semantic_cache_hits", "hits"),
        Index("ix_semantic_cache_updated", "updated_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    input_hash: Mapped[str] = mapped_column(String(64))
    embedding: Mapped[list] = mapped_column(JSONB, default=list)
    action_response: Mapped[dict] = mapped_column(JSONB, default=dict)
    reply_text: Mapped[str] = mapped_column(Text)
    intent_category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    hits: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class TokenUsageCounter(Base):
    __tablename__ = "token_usage_counters"
    __table_args__ = (
        # Added by migration 0002. The Django schema had no uniqueness here, so
        # the daily budget was maintained with a read-modify-write that raced
        # under concurrency and could silently double a user's allowance. This
        # constraint is what lets the counter be a single atomic UPSERT.
        UniqueConstraint("identifier", "date_stamp", name="uq_token_usage_identifier_date"),
        Index("ix_token_usage_user", "identifier"),
        Index("ix_token_usage_date", "date_stamp"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    identifier: Mapped[str] = mapped_column(String(100))
    date_stamp: Mapped[date] = mapped_column(Date)
    session_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0)
    requests_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class GlobalResourceCounter(Base):
    __tablename__ = "global_resource_counters"
    __table_args__ = (
        UniqueConstraint("resource_key", "timestamp_minute", name="uq_res_ts"),
        Index("ix_global_res_ts", "timestamp_minute"),
        Index("ix_global_res_expires", "expires_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    resource_key: Mapped[str] = mapped_column(String(120))
    timestamp_minute: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    current_value: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class Guest(Base):
    __tablename__ = "guests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_active_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )
    is_converted_to_user: Mapped[bool] = mapped_column(Boolean, default=False)
