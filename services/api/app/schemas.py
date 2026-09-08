"""Request and response models.

Field names and defaults mirror what the frontend already sends. Length and
range bounds are load-bearing: several endpoints previously accepted
unbounded text and out-of-range coordinates.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

Priority = Literal["low", "medium", "high"]
TaskStatus = Literal["open", "in_progress", "completed", "cancelled"]
Role = Literal["ngo_admin", "volunteer"]

Skills = Annotated[list[str], Field(default_factory=list, max_length=40)]
Lat = Annotated[float, Field(ge=-90, le=90)]
Lng = Annotated[float, Field(ge=-180, le=180)]


class Model(BaseModel):
    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)


class SignupRequest(Model):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: Role
    invite_code: str | None = Field(default=None, max_length=16)
    full_name: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=30)
    city: str | None = Field(default=None, max_length=100)
    skills: Skills
    languages: Skills
    causes_supported: Skills
    preferred_roles: Skills
    certifications: Skills
    education_level: str | None = Field(default=None, max_length=80)
    years_experience: int | None = Field(default=None, ge=0, le=80)
    bio: str | None = Field(default=None, max_length=2000)
    date_of_birth: date | None = None
    emergency_contact_name: str | None = Field(default=None, max_length=200)
    emergency_contact_phone: str | None = Field(default=None, max_length=30)
    motivation_statement: str | None = Field(default=None, max_length=2000)
    availability_notes: str | None = Field(default=None, max_length=1200)
    preferred_language: str = "en"
    communication_opt_in: bool = True
    consent_analytics: bool = True
    consent_personalization: bool = True
    consent_ai_training: bool = False

    @field_validator("email")
    @classmethod
    def _lower(cls, v: str) -> str:
        return v.lower()


class LoginRequest(Model):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def _lower(cls, v: str) -> str:
        return v.lower()


class GoogleAuthRequest(SignupRequest):
    # Google users have no local password; the id token was verified client-side
    # by the Firebase SDK before this call.
    password: str = ""


class RefreshRequest(Model):
    refresh_token: str = Field(min_length=10, max_length=4000)


class NGOCreateRequest(Model):
    name: str = Field(min_length=2, max_length=200)
    description: str = Field(default="", max_length=2000)
    sector: str | None = Field(default=None, max_length=120)
    website: str | None = Field(default=None, max_length=300)
    headquarters_city: str | None = Field(default=None, max_length=120)
    primary_contact_name: str | None = Field(default=None, max_length=200)
    primary_contact_phone: str | None = Field(default=None, max_length=30)
    operating_regions: Skills
    mission_focus: Skills


class AuthResponse(Model):
    token: str
    refresh_token: str | None = None
    role: str
    ngo_id: str | None = None
    ngo_name: str | None = None
    invite_code: str | None = None
    needs_ngo_setup: bool = False


class TaskCreate(Model):
    title: str = Field(min_length=2, max_length=300)
    description: str = Field(default="", max_length=2000)
    required_skills: Skills
    priority: Priority = "medium"
    deadline: datetime | None = None
    lat: Lat | None = None
    lng: Lng | None = None
    task_category: str | None = Field(default=None, max_length=100)
    estimated_hours: float | None = Field(default=None, ge=0, le=10_000)
    urgency_score: float = Field(default=50.0, ge=0, le=100)
    impact_tags: Skills


class TaskUpdate(Model):
    title: str | None = Field(default=None, min_length=2, max_length=300)
    description: str | None = Field(default=None, max_length=2000)
    required_skills: list[str] | None = None
    priority: Priority | None = None
    status: TaskStatus | None = None
    deadline: datetime | None = None
    lat: Lat | None = None
    lng: Lng | None = None
    urgency_score: float | None = Field(default=None, ge=0, le=100)


class AssignRequest(Model):
    volunteer_id: str = Field(min_length=1, max_length=36)


class BulkAssignRequest(Model):
    max_assignments: int | None = Field(default=None, ge=1, le=500)


class PingRequest(Model):
    message: str | None = Field(default=None, max_length=500)


class RoutePreviewRequest(Model):
    volunteer_id: str = Field(min_length=1, max_length=36)
    task_id: str = Field(min_length=1, max_length=36)


class ResourceCreate(Model):
    type: str = Field(min_length=1, max_length=100)
    quantity: int = Field(default=0, ge=0)
    metadata: dict = Field(default_factory=dict)
    lat: Lat | None = None
    lng: Lng | None = None


class ResourceUpdate(Model):
    type: str | None = Field(default=None, max_length=100)
    quantity: int | None = Field(default=None, ge=0)
    availability_status: Literal["available", "in_use", "depleted"] | None = None
    metadata: dict | None = None
    lat: Lat | None = None
    lng: Lng | None = None


class AllocateRequest(Model):
    task_id: str = Field(min_length=1, max_length=36)


class EventCreate(Model):
    title: str = Field(min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    event_type: Literal["drive", "campaign", "camp", "training"] = "drive"
    date: datetime
    location: str = Field(min_length=1, max_length=300)
    max_volunteers: int = Field(default=0, ge=0, le=100_000)


class AttendanceRequest(Model):
    status: Literal["invited", "present", "absent"]


class ProfileUpdate(Model):
    skills: list[str] | None = None
    availability: dict | None = None
    full_name: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=30)
    city: str | None = Field(default=None, max_length=100)
    bio: str | None = Field(default=None, max_length=2000)
    date_of_birth: date | None = None
    emergency_contact_name: str | None = Field(default=None, max_length=200)
    emergency_contact_phone: str | None = Field(default=None, max_length=30)
    education_level: str | None = Field(default=None, max_length=80)
    years_experience: int | None = Field(default=None, ge=0, le=80)
    preferred_roles: list[str] | None = None
    certifications: list[str] | None = None
    languages: list[str] | None = None
    causes_supported: list[str] | None = None
    motivation_statement: str | None = Field(default=None, max_length=2000)
    availability_notes: str | None = Field(default=None, max_length=1200)


class EnrollRequest(Model):
    reason: str = Field(min_length=10, max_length=2000)
    why_useful: str = Field(min_length=10, max_length=2000)


class LocationUpdate(Model):
    lat: Lat
    lng: Lng
    share_location: bool = True


class CompleteAssignmentRequest(Model):
    hours_spent: float | None = Field(default=None, ge=0, le=1000)


class SOSRequest(Model):
    message: str | None = Field(default=None, max_length=500)
    lat: Lat | None = None
    lng: Lng | None = None


class ChatRequest(Model):
    message: str = Field(min_length=1, max_length=4000)
    context: dict = Field(default_factory=dict)
    imageBase64: str | None = Field(default=None, max_length=8_000_000)
    imageMimeType: str | None = Field(default=None, max_length=100)


class IngestTextRequest(Model):
    text: str = Field(min_length=1, max_length=20_000)
    language: str = Field(default="en", max_length=10)


class GraphAskRequest(Model):
    question: str = Field(min_length=3, max_length=1000)


class SimulationParams(Model):
    num_steps: int = Field(default=50, ge=1, le=200)
    strategy: Literal["skill_first", "proximity_first", "random"] = "skill_first"


class SimulationRequest(Model):
    params: SimulationParams = Field(default_factory=SimulationParams)
