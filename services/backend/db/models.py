import uuid
import datetime
from sqlalchemy import (
    String, Text, Integer, Float, Boolean, DateTime, Date,
    ForeignKey, JSON, Index,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base


def _gen_id() -> str:
    return str(uuid.uuid4())


# ── NGOs ────────────────────────────────────────────────────────────────────

class NGO(Base):
    __tablename__ = "ngos"

    id:          Mapped[str] = mapped_column(String(36), primary_key=True, default=_gen_id)
    name:        Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    invite_code: Mapped[str] = mapped_column(String(16), unique=True, nullable=False)
    created_by:  Mapped[str] = mapped_column(String(36), ForeignKey("users.id", use_alter=True, name="fk_ngo_created_by"), nullable=False)
    created_at:  Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow)
    sector:      Mapped[str | None] = mapped_column(String(120), nullable=True)
    website:     Mapped[str | None] = mapped_column(String(300), nullable=True)
    headquarters_city: Mapped[str | None] = mapped_column(String(120), nullable=True)
    primary_contact_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    primary_contact_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    operating_regions: Mapped[list] = mapped_column(JSON, default=list)
    mission_focus: Mapped[list] = mapped_column(JSON, default=list)
    updated_at:  Mapped[datetime.datetime] = mapped_column(
        DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow
    )


# ── Users ────────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"
    __table_args__ = (Index("ix_users_ngo_id", "ngo_id"),)

    id:            Mapped[str] = mapped_column(String(36), primary_key=True, default=_gen_id)
    email:         Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role:          Mapped[str] = mapped_column(
        SAEnum("ngo_admin", "volunteer", name="user_role"), nullable=False
    )
    ngo_id:        Mapped[str | None] = mapped_column(
        String(36), ForeignKey("ngos.id"), nullable=True
    )
    created_at:    Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow)
    full_name:     Mapped[str | None] = mapped_column(String(200), nullable=True)
    phone:         Mapped[str | None] = mapped_column(String(30), nullable=True)
    preferred_language: Mapped[str] = mapped_column(String(32), default="en")
    communication_opt_in: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    consent_analytics: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    consent_personalization: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    consent_ai_training: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    profile_completed_at: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)
    last_login_at: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")


# ── Volunteer Profiles ───────────────────────────────────────────────────────

class VolunteerProfile(Base):
    __tablename__ = "volunteer_profiles"
    __table_args__ = (Index("ix_vol_ngo_id", "ngo_id"),)

    id:           Mapped[str] = mapped_column(String(36), primary_key=True, default=_gen_id)
    user_id:      Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), unique=True, nullable=False)
    ngo_id:       Mapped[str] = mapped_column(String(36), ForeignKey("ngos.id"), nullable=False)
    skills:         Mapped[list]         = mapped_column(JSON, default=list)
    availability:   Mapped[dict]         = mapped_column(JSON, default=dict)
    status:         Mapped[str]          = mapped_column(
        SAEnum("active", "inactive", name="vol_status"), default="active"
    )
    share_location: Mapped[bool]         = mapped_column(Boolean, default=False, server_default="false")
    lat:            Mapped[float | None] = mapped_column(Float, nullable=True)
    lng:            Mapped[float | None] = mapped_column(Float, nullable=True)
    full_name:      Mapped[str | None]   = mapped_column(String(200), nullable=True)
    phone:          Mapped[str | None]   = mapped_column(String(30), nullable=True)
    city:           Mapped[str | None]   = mapped_column(String(100), nullable=True)
    bio:            Mapped[str | None]   = mapped_column(Text, nullable=True)
    date_of_birth:  Mapped[datetime.date | None] = mapped_column(Date, nullable=True)
    emergency_contact_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    emergency_contact_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    education_level: Mapped[str | None] = mapped_column(String(80), nullable=True)
    years_experience: Mapped[int | None] = mapped_column(Integer, nullable=True)
    preferred_roles: Mapped[list] = mapped_column(JSON, default=list)
    certifications: Mapped[list] = mapped_column(JSON, default=list)
    languages: Mapped[list] = mapped_column(JSON, default=list)
    causes_supported: Mapped[list] = mapped_column(JSON, default=list)
    motivation_statement: Mapped[str | None] = mapped_column(Text, nullable=True)
    availability_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    work_preferences: Mapped[dict] = mapped_column(JSON, default=dict)
    last_active_at: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)
    profile_completeness_score: Mapped[float] = mapped_column(Float, default=0)


# ── Tasks ────────────────────────────────────────────────────────────────────

class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (Index("ix_task_ngo_id", "ngo_id"),)

    id:              Mapped[str] = mapped_column(String(36), primary_key=True, default=_gen_id)
    ngo_id:          Mapped[str] = mapped_column(String(36), ForeignKey("ngos.id"), nullable=False)
    title:           Mapped[str] = mapped_column(String(300), nullable=False)
    description:     Mapped[str] = mapped_column(Text, default="")
    required_skills: Mapped[list] = mapped_column(JSON, default=list)
    priority:        Mapped[str] = mapped_column(
        SAEnum("low", "medium", "high", name="task_priority"), default="medium"
    )
    status:          Mapped[str] = mapped_column(
        SAEnum("open", "in_progress", "completed", "cancelled", name="task_status"), default="open"
    )
    deadline:        Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)
    lat:             Mapped[float | None] = mapped_column(Float, nullable=True)
    lng:             Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at:      Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow)
    updated_at:      Mapped[datetime.datetime] = mapped_column(
        DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow
    )
    task_category:   Mapped[str | None] = mapped_column(String(100), nullable=True)
    estimated_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    urgency_score:   Mapped[float] = mapped_column(Float, default=50)
    impact_tags:     Mapped[list] = mapped_column(JSON, default=list)


# ── Assignments ──────────────────────────────────────────────────────────────

class Assignment(Base):
    __tablename__ = "assignments"
    __table_args__ = (Index("ix_assign_ngo_id", "ngo_id"),)

    id:           Mapped[str] = mapped_column(String(36), primary_key=True, default=_gen_id)
    task_id:      Mapped[str] = mapped_column(String(36), ForeignKey("tasks.id"), nullable=False)
    volunteer_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    ngo_id:       Mapped[str] = mapped_column(String(36), ForeignKey("ngos.id"), nullable=False)
    status:       Mapped[str] = mapped_column(
        SAEnum("assigned", "accepted", "rejected", "completed", name="assign_status"), default="assigned"
    )
    assigned_at:  Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow)
    accepted_at:  Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)
    updated_at:   Mapped[datetime.datetime] = mapped_column(
        DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow
    )
    hours_spent:  Mapped[float | None] = mapped_column(Float, nullable=True)
    completion_rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ngo_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    match_score:  Mapped[float | None] = mapped_column(Float, nullable=True)


# ── Resources ────────────────────────────────────────────────────────────────

class Resource(Base):
    __tablename__ = "resources"
    __table_args__ = (Index("ix_res_ngo_id", "ngo_id"),)

    id:                  Mapped[str] = mapped_column(String(36), primary_key=True, default=_gen_id)
    ngo_id:              Mapped[str] = mapped_column(String(36), ForeignKey("ngos.id"), nullable=False)
    type:                Mapped[str] = mapped_column(String(100), nullable=False)
    quantity:            Mapped[int] = mapped_column(Integer, default=0)
    availability_status: Mapped[str] = mapped_column(
        SAEnum("available", "in_use", "depleted", name="res_status"), default="available"
    )
    metadata_:           Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    lat:                 Mapped[float | None] = mapped_column(Float, nullable=True)
    lng:                 Mapped[float | None] = mapped_column(Float, nullable=True)


# ── Allocations ──────────────────────────────────────────────────────────────

class Allocation(Base):
    __tablename__ = "allocations"

    id:                Mapped[str] = mapped_column(String(36), primary_key=True, default=_gen_id)
    resource_id:       Mapped[str] = mapped_column(String(36), ForeignKey("resources.id"), nullable=False)
    task_id:           Mapped[str] = mapped_column(String(36), ForeignKey("tasks.id"), nullable=False)
    ngo_id:            Mapped[str] = mapped_column(String(36), ForeignKey("ngos.id"), nullable=False)
    allocation_status: Mapped[str] = mapped_column(
        SAEnum("pending", "active", "released", name="alloc_status"), default="pending"
    )


# ── Events ───────────────────────────────────────────────────────────────────

class Event(Base):
    __tablename__ = "events"
    __table_args__ = (Index("ix_event_ngo_id", "ngo_id"),)

    id:             Mapped[str] = mapped_column(String(36), primary_key=True, default=_gen_id)
    ngo_id:         Mapped[str] = mapped_column(String(36), ForeignKey("ngos.id"), nullable=False)
    title:          Mapped[str] = mapped_column(String(200), nullable=False)
    description:    Mapped[str | None] = mapped_column(Text, nullable=True)
    event_type:     Mapped[str] = mapped_column(
        SAEnum("drive", "campaign", "camp", "training", name="event_type"), default="drive"
    )
    date:           Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    location:       Mapped[str] = mapped_column(String(300), nullable=False)
    max_volunteers: Mapped[int] = mapped_column(Integer, default=0)
    status:         Mapped[str] = mapped_column(
        SAEnum("upcoming", "active", "completed", name="event_status"), default="upcoming"
    )
    created_at:     Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow)


class EventAttendance(Base):
    __tablename__ = "event_attendance"
    __table_args__ = (Index("ix_ea_event_id", "event_id"),)

    id:           Mapped[str] = mapped_column(String(36), primary_key=True, default=_gen_id)
    event_id:     Mapped[str] = mapped_column(String(36), ForeignKey("events.id"), nullable=False)
    volunteer_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    status:       Mapped[str] = mapped_column(
        SAEnum("invited", "present", "absent", name="attend_status"), default="invited"
    )


# ── Notifications ─────────────────────────────────────────────────────────────

class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (Index("ix_notif_user_id", "user_id"),)

    id:         Mapped[str] = mapped_column(String(36), primary_key=True, default=_gen_id)
    user_id:    Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    message:    Mapped[str] = mapped_column(Text, nullable=False)
    type:       Mapped[str] = mapped_column(
        SAEnum("task_assigned", "status_update", "general", name="notif_type"), default="general"
    )
    is_read:    Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow)


# ── Task Enrollment Requests ──────────────────────────────────────────────────

class TaskEnrollmentRequest(Base):
    __tablename__ = "task_enrollment_requests"
    __table_args__ = (Index("ix_enroll_ngo_id", "ngo_id"),)

    id:           Mapped[str] = mapped_column(String(36), primary_key=True, default=_gen_id)
    task_id:      Mapped[str] = mapped_column(String(36), ForeignKey("tasks.id"), nullable=False)
    volunteer_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    ngo_id:       Mapped[str] = mapped_column(String(36), ForeignKey("ngos.id"), nullable=False)
    reason:       Mapped[str] = mapped_column(Text, default="")
    why_useful:   Mapped[str] = mapped_column(Text, default="")
    status:       Mapped[str] = mapped_column(
        SAEnum("pending", "approved", "rejected", name="enroll_status"), default="pending"
    )
    created_at:   Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow)


# ── Consent & Chatbot Telemetry ─────────────────────────────────────────────

class ConsentEvent(Base):
    __tablename__ = "consent_events"
    __table_args__ = (
        Index("ix_consent_user_id", "user_id"),
        Index("ix_consent_scope", "scope"),
    )

    id:         Mapped[str] = mapped_column(String(36), primary_key=True, default=_gen_id)
    user_id:    Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    scope:      Mapped[str] = mapped_column(
        SAEnum("analytics", "personalization", "ai_training", name="consent_scope"), nullable=False
    )
    granted:    Mapped[bool] = mapped_column(Boolean, nullable=False)
    source:     Mapped[str] = mapped_column(String(60), default="ui")
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow)


class ChatbotSession(Base):
    __tablename__ = "chatbot_sessions"
    __table_args__ = (
        Index("ix_chatbot_session_user_id", "user_id"),
        Index("ix_chatbot_session_ngo_id", "ngo_id"),
    )

    id:          Mapped[str] = mapped_column(String(36), primary_key=True, default=_gen_id)
    user_id:     Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    ngo_id:      Mapped[str | None] = mapped_column(String(36), ForeignKey("ngos.id"), nullable=True)
    channel:     Mapped[str] = mapped_column(String(40), default="web")
    language:    Mapped[str] = mapped_column(String(32), default="en")
    context_tags: Mapped[list] = mapped_column(JSON, default=list)
    created_at:  Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow)
    ended_at:    Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)


class ChatbotMessage(Base):
    __tablename__ = "chatbot_messages"
    __table_args__ = (
        Index("ix_chatbot_msg_session_id", "session_id"),
        Index("ix_chatbot_msg_role", "role"),
    )

    id:          Mapped[str] = mapped_column(String(36), primary_key=True, default=_gen_id)
    session_id:  Mapped[str] = mapped_column(String(36), ForeignKey("chatbot_sessions.id"), nullable=False)
    user_id:     Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    role:        Mapped[str] = mapped_column(
        SAEnum("user", "assistant", "system", name="chat_role"), nullable=False
    )
    content:     Mapped[str] = mapped_column(Text, nullable=False)
    prompt_features: Mapped[dict] = mapped_column(JSON, default=dict)
    latency_ms:  Mapped[int | None] = mapped_column(Integer, nullable=True)
    user_feedback: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at:  Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow)

# ── Guests ───────────────────────────────────────────────────────────────────

class Guest(Base):
    __tablename__ = "guests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_gen_id)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow)
    last_active_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow)
    is_converted_to_user: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")


class GuestData(Base):
    __tablename__ = "guest_data"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_gen_id)
    guest_id: Mapped[str] = mapped_column(String(36), ForeignKey("guests.id"), unique=True, index=True)
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow
    )

