"""Authentication and role dependencies."""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.errors import Forbidden, Unauthorized
from app.core.security import TokenError, decode_token

bearer = HTTPBearer(auto_error=False)

DbSession = Annotated[AsyncSession, Depends(get_session)]


@dataclass(frozen=True, slots=True)
class CurrentUser:
    user_id: str
    role: str
    ngo_id: str | None
    email: str = ""

    @property
    def is_ngo_admin(self) -> bool:
        return self.role == "ngo_admin"

    @property
    def is_volunteer(self) -> bool:
        return self.role == "volunteer"


async def get_current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> CurrentUser:
    if credentials is None or not credentials.credentials:
        raise Unauthorized("Authentication required")
    try:
        payload = decode_token(credentials.credentials, expected_type="access")
    except TokenError as exc:
        raise Unauthorized(str(exc)) from exc

    user = CurrentUser(
        user_id=payload["sub"],
        role=payload.get("role", ""),
        ngo_id=payload.get("ngo_id"),
        email=payload.get("email", ""),
    )
    request.state.user = user
    return user


async def get_optional_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> CurrentUser | None:
    if credentials is None or not credentials.credentials:
        return None
    try:
        return await get_current_user(request, credentials)
    except Unauthorized:
        return None


async def require_ngo_admin(
    user: Annotated[CurrentUser, Depends(get_current_user)],
) -> CurrentUser:
    if not user.is_ngo_admin:
        raise Forbidden("NGO admin access required")
    return user


async def require_ngo_admin_with_ngo(
    user: Annotated[CurrentUser, Depends(require_ngo_admin)],
) -> CurrentUser:
    if not user.ngo_id:
        raise Forbidden("NGO admin access required - complete NGO setup first")
    return user


async def require_volunteer_with_ngo(
    user: Annotated[CurrentUser, Depends(get_current_user)],
) -> CurrentUser:
    if not user.is_volunteer:
        raise Forbidden("Volunteer access required")
    if not user.ngo_id:
        raise Forbidden("Volunteer NGO not configured")
    return user


async def get_guest_id(request: Request) -> str:
    return getattr(request.state, "guest_id", None) or str(uuid.uuid4())


AdminUser = Annotated[CurrentUser, Depends(require_ngo_admin_with_ngo)]
VolunteerUser = Annotated[CurrentUser, Depends(require_volunteer_with_ngo)]
AnyUser = Annotated[CurrentUser, Depends(get_current_user)]
MaybeUser = Annotated[CurrentUser | None, Depends(get_optional_user)]
GuestId = Annotated[str, Depends(get_guest_id)]
