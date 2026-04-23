import uuid
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request, Response

class GuestSessionMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        guest_id = request.cookies.get("guest_id")
        is_new_guest = False
        
        # 1. Lazily Generate Token
        if not guest_id:
            guest_id = str(uuid.uuid4())
            is_new_guest = True
            
        # 2. Inject context (available as request.state.guest_id everywhere)
        request.state.guest_id = guest_id
        
        response = await call_next(request)
        
        # 3. Apply Cookie persistently
        if is_new_guest:
            response.set_cookie(
                key="guest_id",
                value=guest_id,
                max_age=365 * 24 * 60 * 60, # 1 Year
                httponly=True,
                secure=True,     # Must run on HTTPS
                samesite="lax",
            )
        
        return response
