import random
import string
import logging
from fastapi import APIRouter, Depends, HTTPException

logger = logging.getLogger(__name__)
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from datetime import datetime, date

from api.schemas import AuthResponse
from db.base import get_db
from db.models import User, NGO, VolunteerProfile, ConsentEvent
from utils.auth_utils import hash_password, verify_password, create_token
from middleware.rbac import get_current_user, CurrentUser

router = APIRouter()


def _random_code(length: int = 8) -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=length))


# ── Pydantic models ──────────────────────────────────────────────────────────

class SignupReq(BaseModel):
    email:       EmailStr
    password:    str = Field(..., min_length=8, max_length=128)
    role:        str = Field(..., pattern="^(ngo_admin|volunteer)$")
    invite_code: str | None = None
    full_name:   str | None = Field(None, max_length=200)
    phone:       str | None = Field(None, max_length=30)
    city:        str | None = Field(None, max_length=100)
    preferred_language: str = Field("en", max_length=32)
    communication_opt_in: bool = True
    consent_analytics: bool = True
    consent_personalization: bool = True
    consent_ai_training: bool = False
    motivation_statement: str | None = Field(None, max_length=2000)
    languages: list[str] = Field(default_factory=list)
    causes_supported: list[str] = Field(default_factory=list)
    education_level: str | None = Field(None, max_length=80)
    years_experience: int | None = Field(None, ge=0, le=80)
    skills: list[str] = Field(default_factory=list)
    bio: str | None = Field(None, max_length=2000)
    date_of_birth: date | None = None
    emergency_contact_name: str | None = Field(None, max_length=200)
    emergency_contact_phone: str | None = Field(None, max_length=30)
    preferred_roles: list[str] = Field(default_factory=list)
    certifications: list[str] = Field(default_factory=list)
    availability_notes: str | None = Field(None, max_length=1000)

class NGOCreateReq(BaseModel):
    name:        str = Field(..., min_length=2, max_length=200)
    description: str = Field("", max_length=1000)
    sector:      str | None = Field(None, max_length=120)
    website:     str | None = Field(None, max_length=300)
    headquarters_city: str | None = Field(None, max_length=120)
    primary_contact_name: str | None = Field(None, max_length=200)
    primary_contact_phone: str | None = Field(None, max_length=30)
    operating_regions: list[str] = Field(default_factory=list)
    mission_focus: list[str] = Field(default_factory=list)


class CheckEmailResponse(BaseModel):
    exists: bool
    role: str | None = None
    ngo_id: str | None = None


class LoginReq(BaseModel):
    email:    EmailStr
    password: str


class GoogleAuthReq(BaseModel):
    email:        EmailStr
    firebase_uid: str
    role:         str = Field(..., pattern="^(ngo_admin|volunteer)$")
    invite_code:  str | None = None
    full_name:   str | None = Field(None, max_length=200)
    phone:       str | None = Field(None, max_length=30)
    city:        str | None = Field(None, max_length=100)
    preferred_language: str = Field("en", max_length=32)
    communication_opt_in: bool = True
    consent_analytics: bool = True
    consent_personalization: bool = True
    consent_ai_training: bool = False
    motivation_statement: str | None = Field(None, max_length=2000)
    languages: list[str] = Field(default_factory=list)
    causes_supported: list[str] = Field(default_factory=list)
    education_level: str | None = Field(None, max_length=80)
    years_experience: int | None = Field(None, ge=0, le=80)
    skills: list[str] = Field(default_factory=list)
    bio: str | None = Field(None, max_length=2000)
    date_of_birth: date | None = None
    emergency_contact_name: str | None = Field(None, max_length=200)
    emergency_contact_phone: str | None = Field(None, max_length=30)
    preferred_roles: list[str] = Field(default_factory=list)
    certifications: list[str] = Field(default_factory=list)
    availability_notes: str | None = Field(None, max_length=1000)


def _record_consent_events(user_id: str, req: SignupReq | GoogleAuthReq, db: AsyncSession) -> None:
    db.add(ConsentEvent(user_id=user_id, scope="analytics", granted=req.consent_analytics, source="signup"))
    db.add(ConsentEvent(user_id=user_id, scope="personalization", granted=req.consent_personalization, source="signup"))
    db.add(ConsentEvent(user_id=user_id, scope="ai_training", granted=req.consent_ai_training, source="signup"))


# ── Routes ───────────────────────────────────────────────────────────────────

@router.post("/signup", response_model=AuthResponse)
async def signup(req: SignupReq, db: AsyncSession = Depends(get_db)):
    # Duplicate email check
    existing = await db.execute(select(User).where(User.email == req.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    if req.role == "volunteer":
        if not req.invite_code:
            raise HTTPException(status_code=400, detail="invite_code required for volunteers")
        ngo = (await db.execute(select(NGO).where(NGO.invite_code == req.invite_code))).scalar_one_or_none()
        if not ngo:
            raise HTTPException(status_code=404, detail="Invalid invite code")

        user = User(
            email=req.email,
            password_hash=hash_password(req.password),
            role="volunteer",
            ngo_id=ngo.id,
            full_name=req.full_name,
            phone=req.phone,
            preferred_language=req.preferred_language,
            communication_opt_in=req.communication_opt_in,
            consent_analytics=req.consent_analytics,
            consent_personalization=req.consent_personalization,
            consent_ai_training=req.consent_ai_training,
            profile_completed_at=datetime.utcnow() if req.full_name and req.phone and req.city else None,
        )
        db.add(user)
        await db.flush()  # get user.id before commit

        profile = VolunteerProfile(
            user_id=user.id,
            ngo_id=ngo.id,
            skills=req.skills,
            availability={"mon": True, "tue": True, "wed": True, "thu": True, "fri": True, "sat": False, "sun": False},
            full_name=req.full_name,
            phone=req.phone,
            city=req.city,
            motivation_statement=req.motivation_statement,
            languages=req.languages,
            causes_supported=req.causes_supported,
            education_level=req.education_level,
            years_experience=req.years_experience,
            bio=req.bio,
            date_of_birth=req.date_of_birth,
            emergency_contact_name=req.emergency_contact_name,
            emergency_contact_phone=req.emergency_contact_phone,
            preferred_roles=req.preferred_roles,
            certifications=req.certifications,
            availability_notes=req.availability_notes,
        )
        db.add(profile)
        _record_consent_events(user.id, req, db)
        await db.commit()
        token = create_token(user.id, "volunteer", ngo.id, req.email)
        return {"token": token, "role": "volunteer", "ngo_id": ngo.id, "ngo_name": ngo.name}

    # ngo_admin — no ngo_id yet; must call /ngo/create next
    user = User(
        email=req.email,
        password_hash=hash_password(req.password),
        role="ngo_admin",
        ngo_id=None,
        full_name=req.full_name,
        phone=req.phone,
        preferred_language=req.preferred_language,
        communication_opt_in=req.communication_opt_in,
        consent_analytics=req.consent_analytics,
        consent_personalization=req.consent_personalization,
        consent_ai_training=req.consent_ai_training,
    )
    db.add(user)
    await db.flush()
    _record_consent_events(user.id, req, db)
    await db.commit()
    token = create_token(user.id, "ngo_admin", None, req.email)
    return {"token": token, "role": "ngo_admin", "ngo_id": None, "needs_ngo_setup": True}


@router.post("/guest", response_model=AuthResponse)
async def guest_login(db: AsyncSession = Depends(get_db)):
    """
    Guest Mode (for Hackathon Admin)
    Creates a temporary user and a temporary NGO to grant immediate full-platform access.
    """
    import uuid
    unique_suffix = str(uuid.uuid4())[:8]
    guest_email = f"guest_{unique_suffix}@synapseai.hackathon"
    
    # 1. Create the dummy NGO
    ngo_code = _random_code()
    from db.models import NGO, User
    
    # Needs a dummy user_id for created_by in NGO constraint, but User needs ngo_id
    # We create user first with no ngo_id, then ngo, then update user.
    user = User(
        email=guest_email,
        password_hash=hash_password("guest_password123"),
        role="ngo_admin",
        ngo_id=None,
        full_name="Hackathon Guest",
        phone="555-0000",
        profile_completed_at=datetime.utcnow()
    )
    db.add(user)
    await db.flush()
    
    ngo = NGO(
        name=f"Guest NGO {unique_suffix}",
        description="Auto-generated NGO for hackathon guest.",
        invite_code=ngo_code,
        created_by=user.id,
        sector="Hackathon",
    )
    db.add(ngo)
    await db.flush()
    
    user.ngo_id = ngo.id
    
    db.add(ConsentEvent(user_id=user.id, scope="analytics", granted=True, source="guest"))
    db.add(ConsentEvent(user_id=user.id, scope="personalization", granted=True, source="guest"))
    db.add(ConsentEvent(user_id=user.id, scope="ai_training", granted=True, source="guest"))
    await db.commit()
    
    token = create_token(user.id, "ngo_admin", ngo.id, guest_email)
    return {"token": token, "role": "ngo_admin", "ngo_id": ngo.id, "ngo_name": ngo.name}


@router.post("/ngo/create", response_model=AuthResponse)
async def create_ngo(
    req: NGOCreateReq,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.role != "ngo_admin":
        raise HTTPException(status_code=403, detail="Only ngo_admin can create an NGO")
    if user.ngo_id:
        raise HTTPException(status_code=400, detail="NGO already created for this account")

    # Ensure unique invite code
    code = _random_code()
    while (await db.execute(select(NGO).where(NGO.invite_code == code))).scalar_one_or_none():
        code = _random_code()

    ngo = NGO(
        name=req.name,
        description=req.description,
        invite_code=code,
        created_by=user.user_id,
        sector=req.sector,
        website=req.website,
        headquarters_city=req.headquarters_city,
        primary_contact_name=req.primary_contact_name,
        primary_contact_phone=req.primary_contact_phone,
        operating_regions=req.operating_regions,
        mission_focus=req.mission_focus,
    )
    db.add(ngo)
    await db.flush()

    await db.execute(update(User).where(User.id == user.user_id).values(ngo_id=ngo.id))
    await db.commit()
    token = create_token(user.user_id, "ngo_admin", ngo.id, user.email)

    return {"token": token, "role": "ngo_admin", "ngo_id": ngo.id, "invite_code": code, "ngo_name": ngo.name}


@router.post("/login", response_model=AuthResponse)
async def login(req: LoginReq, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(select(User).where(User.email == req.email))).scalar_one_or_none()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user.last_login_at = datetime.utcnow()
    await db.commit()
    token = create_token(user.id, user.role, user.ngo_id, user.email)
    return {
        "token":  token,
        "role":   user.role,
        "ngo_id": user.ngo_id,
        "needs_ngo_setup": user.role == "ngo_admin" and not user.ngo_id,
    }


@router.post("/google", response_model=AuthResponse)
async def google_auth(req: GoogleAuthReq, db: AsyncSession = Depends(get_db)):
    """Google Sign-In: find or create user by email, return JWT. No password needed."""
    try:
        return await _google_auth_inner(req, db)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("google_auth unexpected error: %s", exc, exc_info=True)
        raise HTTPException(status_code=503, detail=f"Service unavailable: {exc}")


async def _google_auth_inner(req: GoogleAuthReq, db: AsyncSession):
    user = (await db.execute(select(User).where(User.email == req.email))).scalar_one_or_none()

    if user:
        # Existing user — return token regardless of how they originally signed up
        user.last_login_at = datetime.utcnow()
        token = create_token(user.id, user.role, user.ngo_id, user.email)
        return {
            "token": token,
            "role": user.role,
            "ngo_id": user.ngo_id,
            "needs_ngo_setup": user.role == "ngo_admin" and not user.ngo_id,
        }

    # New user via Google
    if req.role == "volunteer":
        if not req.invite_code:
            raise HTTPException(status_code=400, detail="invite_code required for volunteers")
        ngo = (await db.execute(select(NGO).where(NGO.invite_code == req.invite_code))).scalar_one_or_none()
        if not ngo:
            raise HTTPException(status_code=404, detail="Invalid invite code")

        try:
            user = User(
                email=req.email,
                password_hash=None,
                role="volunteer",
                ngo_id=ngo.id,
                full_name=req.full_name,
                phone=req.phone,
                preferred_language=req.preferred_language,
                communication_opt_in=req.communication_opt_in,
                consent_analytics=req.consent_analytics,
                consent_personalization=req.consent_personalization,
                consent_ai_training=req.consent_ai_training,
                profile_completed_at=datetime.utcnow() if req.full_name and req.phone and req.city else None,
            )
            db.add(user)
            await db.flush()

            profile = VolunteerProfile(
                user_id=user.id,
                ngo_id=ngo.id,
                skills=req.skills,
                availability={"mon": True, "tue": True, "wed": True, "thu": True, "fri": True, "sat": False, "sun": False},
                full_name=req.full_name,
                phone=req.phone,
                city=req.city,
                motivation_statement=req.motivation_statement,
                languages=req.languages,
                causes_supported=req.causes_supported,
                education_level=req.education_level,
                years_experience=req.years_experience,
                bio=req.bio,
                date_of_birth=req.date_of_birth,
                emergency_contact_name=req.emergency_contact_name,
                emergency_contact_phone=req.emergency_contact_phone,
                preferred_roles=req.preferred_roles,
                certifications=req.certifications,
                availability_notes=req.availability_notes,
            )
            db.add(profile)
            _record_consent_events(user.id, req, db)
            await db.commit()
            token = create_token(user.id, "volunteer", ngo.id, req.email)
            return {"token": token, "role": "volunteer", "ngo_id": ngo.id, "ngo_name": ngo.name}
        except IntegrityError:
            await db.rollback()
            existing_user = (await db.execute(select(User).where(User.email == req.email))).scalar_one_or_none()
            if existing_user:
                token = create_token(existing_user.id, existing_user.role, existing_user.ngo_id, existing_user.email)
                return {
                    "token": token,
                    "role": existing_user.role,
                    "ngo_id": existing_user.ngo_id,
                    "needs_ngo_setup": existing_user.role == "ngo_admin" and not existing_user.ngo_id,
                }
            raise

    # ngo_admin — NGO created separately via /ngo/create
    try:
        user = User(
            email=req.email,
            password_hash=None,
            role="ngo_admin",
            ngo_id=None,
            full_name=req.full_name,
            phone=req.phone,
            preferred_language=req.preferred_language,
            communication_opt_in=req.communication_opt_in,
            consent_analytics=req.consent_analytics,
            consent_personalization=req.consent_personalization,
            consent_ai_training=req.consent_ai_training,
        )
        db.add(user)
        await db.flush()
        _record_consent_events(user.id, req, db)
        await db.commit()
        token = create_token(user.id, "ngo_admin", None, req.email)
        return {"token": token, "role": "ngo_admin", "ngo_id": None, "needs_ngo_setup": True}
    except IntegrityError:
        await db.rollback()
        existing_user = (await db.execute(select(User).where(User.email == req.email))).scalar_one_or_none()
        if existing_user:
            token = create_token(existing_user.id, existing_user.role, existing_user.ngo_id, existing_user.email)
            return {
                "token": token,
                "role": existing_user.role,
                "ngo_id": existing_user.ngo_id,
                "needs_ngo_setup": existing_user.role == "ngo_admin" and not existing_user.ngo_id,
            }
        raise


@router.get("/check-email", response_model=CheckEmailResponse)
async def check_email(email: str, db: AsyncSession = Depends(get_db)):
    """Public — no auth. Returns whether email is registered and their role/ngo_id."""
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if not user:
        return CheckEmailResponse(exists=False)
    return CheckEmailResponse(exists=True, role=user.role, ngo_id=str(user.ngo_id) if user.ngo_id else None)


@router.post("/logout")
async def logout():
    return {"message": "Logged out — delete token client-side"}


@router.get("/ngo/lookup/{invite_code}")
async def lookup_ngo(invite_code: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(NGO).where(NGO.invite_code == invite_code.upper()))
    ngo = result.scalar_one_or_none()
    if not ngo:
        raise HTTPException(status_code=404, detail="Invalid invite code")
    return {"ngo_name": ngo.name, "invite_code": ngo.invite_code}
