from passlib.context import CryptContext
from jose import jwt, JWTError
from datetime import datetime, timedelta
import os
import warnings

_DEV_SECRET = "synapse-dev-secret-change-in-prod-32chars!"
SECRET_KEY  = os.getenv("JWT_SECRET_KEY", _DEV_SECRET)
ALGORITHM   = "HS256"
EXPIRE_MINS = 60 * 24  # 24 hours

if SECRET_KEY == _DEV_SECRET:
    warnings.warn(
        "JWT_SECRET_KEY is using the insecure default — set a strong secret in production!",
        stacklevel=2,
    )

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return pwd_ctx.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_ctx.verify(plain, hashed)


def create_token(user_id: str, role: str, ngo_id: str | None, email: str = "") -> str:
    expire = datetime.utcnow() + timedelta(minutes=EXPIRE_MINS)
    payload = {
        "sub":    user_id,
        "role":   role,
        "ngo_id": ngo_id,
        "email":  email,
        "exp":    expire,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
