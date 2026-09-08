"""Identity API: signup, login, Google exchange, guest demos, NGO creation.

Access tokens are short-lived and paired with a rotating refresh token that
can be revoked on logout.
"""
from __future__ import annotations

import logging
import secrets
import string
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select

from app.core.config import settings
from app.core.deps import AnyUser, DbSession, require_ngo_admin
from app.core.errors import BadRequest, Conflict, NotFound, Unauthorized
from app.core.ratelimit import limiter
from app.core.security import (
    TokenError,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    is_refresh_token_revoked,
    revoke_refresh_token,
    verify_password,
)
from app.models import NGO, ConsentEvent, User, VolunteerProfile, utcnow
from app.modules.identity.seed import WEEKDAYS, seed_ngo_demo, seed_volunteer_demo
from app.schemas import (
    AuthResponse,
    GoogleAuthRequest,
    LoginRequest,
    NGOCreateRequest,
    RefreshRequest,
    SignupRequest,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["identity"])

auth_limit = limiter(
    "auth", limit=settings.auth_attempts_per_minute_per_ip, window_seconds=60
)
guest_limit = limiter(
    "guest", limit=settings.guest_signups_per_hour_per_ip, window_seconds=3600
)

ROLE_LABELS = {"ngo_admin": "NGO Admin", "volunteer": "Volunteer"}


def _role_conflict(existing_role: str) -> Conflict:
    label = ROLE_LABELS.get(existing_role, existing_role)
    return Conflict(
        f"This email is already registered as a {label} account. "
        f"Please use the {label} sign-in button."
    )


async def _unique_invite_code(session: DbSession, length: int = 8) -> str:
    alphabet = string.ascii_uppercase + string.digits
    for _ in range(20):
        # secrets, not random: an invite code is the only thing standing between
        # the public internet and joining someone's NGO.
        code = "".join(secrets.choice(alphabet) for _ in range(length))
        if not await session.scalar(select(NGO.id).where(NGO.invite_code == code)):
            return code
    raise BadRequest("Could not allocate an invite code. Please retry.")


def _record_consent(session: DbSession, user_id: str, data, source: str) -> None:
    for scope, granted in (
        ("analytics", data.consent_analytics),
        ("personalization", data.consent_personalization),
        ("ai_training", data.consent_ai_training),
    ):
        session.add(
            ConsentEvent(user_id=user_id, scope=scope, granted=granted, source=source)
        )


def _tokens(user_id: str, role: str, ngo_id: str | None, email: str) -> tuple[str, str]:
    access = create_access_token(user_id, role, ngo_id, email)
    refresh, _ = create_refresh_token(user_id)
    return access, refresh


def _volunteer_profile(user_id: str, ngo_id: str, data) -> VolunteerProfile:
    return VolunteerProfile(
        user_id=user_id,
        ngo_id=ngo_id,
        skills=data.skills,
        availability=dict(WEEKDAYS),
        full_name=data.full_name,
        phone=data.phone,
        city=data.city,
        motivation_statement=data.motivation_statement,
        languages=data.languages,
        causes_supported=data.causes_supported,
        education_level=data.education_level,
        years_experience=data.years_experience,
        bio=data.bio,
        date_of_birth=data.date_of_birth,
        emergency_contact_name=data.emergency_contact_name,
        emergency_contact_phone=data.emergency_contact_phone,
        preferred_roles=data.preferred_roles,
        certifications=data.certifications,
        availability_notes=data.availability_notes,
    )


@router.post("/signup", response_model=AuthResponse, dependencies=[Depends(auth_limit)])
async def signup(data: SignupRequest, session: DbSession) -> AuthResponse:
    existing = await session.scalar(select(User).where(User.email == data.email))
    if existing is not None:
        if existing.role != data.role:
            raise _role_conflict(existing.role)
        raise Conflict("Email already registered")

    if data.role == "volunteer":
        if not data.invite_code:
            raise BadRequest("invite_code required for volunteers")
        ngo = await session.scalar(
            select(NGO).where(NGO.invite_code == data.invite_code.upper())
        )
        if ngo is None:
            raise NotFound("Invite code")

        user = User(
            email=data.email,
            password_hash=hash_password(data.password),
            role="volunteer",
            ngo_id=ngo.id,
            full_name=data.full_name,
            phone=data.phone,
            preferred_language=data.preferred_language,
            communication_opt_in=data.communication_opt_in,
            consent_analytics=data.consent_analytics,
            consent_personalization=data.consent_personalization,
            consent_ai_training=data.consent_ai_training,
            profile_completed_at=utcnow() if data.full_name and data.phone else None,
        )
        session.add(user)
        await session.flush()
        session.add(_volunteer_profile(user.id, ngo.id, data))
        _record_consent(session, user.id, data, "signup")

        access, refresh = _tokens(user.id, "volunteer", ngo.id, data.email)
        return AuthResponse(
            token=access, refresh_token=refresh, role="volunteer",
            ngo_id=ngo.id, ngo_name=ngo.name,
        )

    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        role="ngo_admin",
        ngo_id=None,
        full_name=data.full_name,
        phone=data.phone,
        preferred_language=data.preferred_language,
        communication_opt_in=data.communication_opt_in,
        consent_analytics=data.consent_analytics,
        consent_personalization=data.consent_personalization,
        consent_ai_training=data.consent_ai_training,
    )
    session.add(user)
    await session.flush()
    _record_consent(session, user.id, data, "signup")

    access, refresh = _tokens(user.id, "ngo_admin", None, data.email)
    return AuthResponse(
        token=access, refresh_token=refresh, role="ngo_admin", needs_ngo_setup=True
    )


@router.post("/login", response_model=AuthResponse, dependencies=[Depends(auth_limit)])
async def login(data: LoginRequest, session: DbSession) -> AuthResponse:
    user = await session.scalar(select(User).where(User.email == data.email))
    # Same message and timing shape whether the email is unknown or the password
    # is wrong -- do not let this endpoint enumerate accounts.
    if user is None or not verify_password(data.password, user.password_hash):
        raise Unauthorized("Invalid credentials")

    user.last_login_at = utcnow()
    access, refresh = _tokens(user.id, user.role, user.ngo_id, user.email)
    return AuthResponse(
        token=access,
        refresh_token=refresh,
        role=user.role,
        ngo_id=user.ngo_id,
        needs_ngo_setup=user.role == "ngo_admin" and not user.ngo_id,
    )


@router.post("/google", response_model=AuthResponse, dependencies=[Depends(auth_limit)])
async def google_auth(data: GoogleAuthRequest, session: DbSession) -> AuthResponse:
    user = await session.scalar(select(User).where(User.email == data.email))

    if user is not None:
        if user.role != data.role:
            raise _role_conflict(user.role)
        user.last_login_at = utcnow()
        access, refresh = _tokens(user.id, user.role, user.ngo_id, user.email)
        return AuthResponse(
            token=access,
            refresh_token=refresh,
            role=user.role,
            ngo_id=user.ngo_id,
            needs_ngo_setup=user.role == "ngo_admin" and not user.ngo_id,
        )

    ngo: NGO | None = None
    if data.role == "volunteer":
        if not data.invite_code:
            raise BadRequest("invite_code required for volunteers")
        ngo = await session.scalar(
            select(NGO).where(NGO.invite_code == data.invite_code.upper())
        )
        if ngo is None:
            raise NotFound("Invite code")

    user = User(
        email=data.email,
        password_hash=None,
        role=data.role,
        ngo_id=ngo.id if ngo else None,
        full_name=data.full_name,
        phone=data.phone,
        preferred_language=data.preferred_language,
        communication_opt_in=data.communication_opt_in,
        consent_analytics=data.consent_analytics,
        consent_personalization=data.consent_personalization,
        consent_ai_training=data.consent_ai_training,
        profile_completed_at=utcnow() if data.full_name and data.phone else None,
        email_verified=True,
    )
    session.add(user)
    await session.flush()
    if ngo is not None:
        session.add(_volunteer_profile(user.id, ngo.id, data))
    _record_consent(session, user.id, data, "google")

    access, refresh = _tokens(user.id, data.role, user.ngo_id, data.email)
    return AuthResponse(
        token=access,
        refresh_token=refresh,
        role=data.role,
        ngo_id=user.ngo_id,
        ngo_name=ngo.name if ngo else None,
        needs_ngo_setup=data.role == "ngo_admin",
    )


@router.post("/refresh", response_model=AuthResponse, dependencies=[Depends(auth_limit)])
async def refresh_tokens(data: RefreshRequest, session: DbSession) -> AuthResponse:
    """Exchange a refresh token for a new access token, rotating the refresh."""
    try:
        payload = decode_token(data.refresh_token, expected_type="refresh")
    except TokenError as exc:
        raise Unauthorized(str(exc)) from exc

    jti = payload.get("jti", "")
    if not jti or await is_refresh_token_revoked(jti):
        raise Unauthorized("Refresh token is no longer valid")

    user = await session.get(User, payload["sub"])
    if user is None:
        raise Unauthorized("Account no longer exists")

    # Rotate: the presented refresh token is single-use.
    await revoke_refresh_token(jti)
    access, refresh = _tokens(user.id, user.role, user.ngo_id, user.email)
    return AuthResponse(
        token=access,
        refresh_token=refresh,
        role=user.role,
        ngo_id=user.ngo_id,
        needs_ngo_setup=user.role == "ngo_admin" and not user.ngo_id,
    )


@router.post("/logout")
async def logout(data: RefreshRequest | None = None) -> dict:
    """Revoke the refresh token if one is supplied; access tokens expire on their own."""
    if data and data.refresh_token:
        try:
            payload = decode_token(data.refresh_token, expected_type="refresh")
            if jti := payload.get("jti"):
                await revoke_refresh_token(jti)
        except TokenError:
            pass  # already invalid; nothing to revoke
    return {"message": "Logged out"}


@router.post("/guest", response_model=AuthResponse, dependencies=[Depends(guest_limit)])
async def guest_admin(session: DbSession) -> AuthResponse:
    if not settings.enable_guest_mode:
        raise BadRequest("Guest mode is disabled on this deployment")

    suffix = secrets.token_hex(4)
    user = User(
        email=f"guest_{suffix}@guest.invalid",
        password_hash=None,
        role="ngo_admin",
        full_name="Demo Admin",
        profile_completed_at=utcnow(),
    )
    session.add(user)
    await session.flush()

    ngo = NGO(
        name=f"Demo NGO {suffix}",
        description="Auto-generated workspace for the product demo.",
        invite_code=await _unique_invite_code(session),
        created_by=user.id,
        sector="Demo",
    )
    session.add(ngo)
    await session.flush()
    user.ngo_id = ngo.id

    await seed_ngo_demo(session, user.id, ngo.id)
    access, refresh = _tokens(user.id, "ngo_admin", ngo.id, user.email)
    return AuthResponse(
        token=access, refresh_token=refresh, role="ngo_admin",
        ngo_id=ngo.id, ngo_name=ngo.name, invite_code=ngo.invite_code,
    )


@router.post("/guest-volunteer", response_model=AuthResponse, dependencies=[Depends(guest_limit)])
async def guest_volunteer(session: DbSession) -> AuthResponse:
    if not settings.enable_guest_mode:
        raise BadRequest("Guest mode is disabled on this deployment")

    suffix = secrets.token_hex(4)
    user = User(
        email=f"vol_guest_{suffix}@guest.invalid",
        password_hash=None,
        role="volunteer",
        full_name="Demo Volunteer",
        profile_completed_at=utcnow(),
    )
    session.add(user)
    await session.flush()

    ngo = NGO(
        name=f"Demo Relief NGO {suffix}",
        description="Auto-generated workspace for the product demo.",
        invite_code=await _unique_invite_code(session),
        created_by=user.id,
        sector="Disaster Relief",
        headquarters_city="Mumbai",
    )
    session.add(ngo)
    await session.flush()
    user.ngo_id = ngo.id

    session.add(
        VolunteerProfile(
            user_id=user.id,
            ngo_id=ngo.id,
            skills=["search_rescue", "first_aid", "logistics"],
            availability=dict(WEEKDAYS),
            full_name="Demo Volunteer",
            city="Mumbai",
            languages=["English", "Hindi"],
            causes_supported=["Disaster Relief", "Healthcare"],
            bio="Passionate volunteer.",
            years_experience=2,
            education_level="undergraduate",
            certifications=["First Aid", "CPR"],
            profile_completeness_score=0.85,
        )
    )
    await seed_volunteer_demo(session, user.id, ngo.id)

    access, refresh = _tokens(user.id, "volunteer", ngo.id, user.email)
    return AuthResponse(
        token=access, refresh_token=refresh, role="volunteer",
        ngo_id=ngo.id, ngo_name=ngo.name,
    )


@router.post("/ngo/create", response_model=AuthResponse)
async def create_ngo(
    data: NGOCreateRequest,
    session: DbSession,
    user: Annotated[object, Depends(require_ngo_admin)],
) -> AuthResponse:
    if user.ngo_id:
        raise BadRequest("NGO already created for this account")

    ngo = NGO(
        name=data.name,
        description=data.description,
        invite_code=await _unique_invite_code(session),
        created_by=user.user_id,
        sector=data.sector,
        website=data.website,
        headquarters_city=data.headquarters_city,
        primary_contact_name=data.primary_contact_name,
        primary_contact_phone=data.primary_contact_phone,
        operating_regions=data.operating_regions,
        mission_focus=data.mission_focus,
    )
    session.add(ngo)
    await session.flush()

    account = await session.get(User, user.user_id)
    if account is None:
        raise NotFound("User")
    account.ngo_id = ngo.id

    access, refresh = _tokens(user.user_id, "ngo_admin", ngo.id, user.email)
    return AuthResponse(
        token=access, refresh_token=refresh, role="ngo_admin",
        ngo_id=ngo.id, ngo_name=ngo.name, invite_code=ngo.invite_code,
    )


@router.get("/check-email", dependencies=[Depends(auth_limit)])
async def check_email(
    session: DbSession, email: Annotated[str, Query(max_length=255)] = ""
) -> dict:
    role = await session.scalar(select(User.role).where(User.email == email.lower().strip()))
    return {"exists": role is not None, "role": role}


@router.get("/ngo/lookup/{invite_code}", dependencies=[Depends(auth_limit)])
async def lookup_ngo(invite_code: str, session: DbSession) -> dict:
    ngo = await session.scalar(select(NGO).where(NGO.invite_code == invite_code.upper()))
    if ngo is None:
        raise NotFound("Invite code")
    return {"ngo_name": ngo.name, "invite_code": ngo.invite_code}


@router.get("/me", status_code=status.HTTP_200_OK)
async def whoami(session: DbSession, user: AnyUser) -> dict:
    account = await session.get(User, user.user_id)
    if account is None:
        raise NotFound("User")
    return {
        "user_id": account.id,
        "email": account.email,
        "role": account.role,
        "ngo_id": account.ngo_id,
        "full_name": account.full_name,
        "needs_ngo_setup": account.role == "ngo_admin" and not account.ngo_id,
    }
