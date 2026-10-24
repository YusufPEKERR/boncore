"""
BonCore POS - Kimlik doğrulama yardımcıları.

Harici bağımlılık gerektirmeden (yalnızca Python standart kütüphanesi):
- PBKDF2-SHA256 ile parola özetleme / doğrulama
- HMAC-SHA256 imzalı, süreli erişim token'ları (JWT benzeri)
- FastAPI bağımlılıkları: get_current_user, require_roles
"""
import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.database import get_db
from app.models.user import StaffUser

# Gizli anahtar: ortam değişkeninden alınır, yoksa sunucu başına kalıcı dosyada üretilir.
_SECRET_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".auth_secret")


def _load_secret() -> bytes:
    env_secret = os.getenv("BONCORE_SECRET_KEY")
    if env_secret:
        return env_secret.encode()
    if os.path.exists(_SECRET_FILE):
        with open(_SECRET_FILE, "rb") as f:
            data = f.read().strip()
            if data:
                return data
    new_secret = secrets.token_hex(32).encode()
    with open(_SECRET_FILE, "wb") as f:
        f.write(new_secret)
    return new_secret


SECRET_KEY = _load_secret()
TOKEN_TTL_SECONDS = int(os.getenv("BONCORE_TOKEN_TTL", str(12 * 60 * 60)))  # 12 saat (bir vardiya)
REMEMBER_TTL_SECONDS = 7 * 24 * 60 * 60  # "Beni hatırla" için 7 gün
PBKDF2_ITERATIONS = 200_000


# ---------------------------------------------------------------- Parola
def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode(), PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt}${digest.hex()}"


def verify_password(password: str, stored_hash: Optional[str]) -> bool:
    if not stored_hash:
        return False
    try:
        algo, iterations, salt, hex_digest = stored_hash.split("$")
        if algo != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode(), int(iterations))
        return hmac.compare_digest(digest.hex(), hex_digest)
    except Exception:
        return False


# ---------------------------------------------------------------- Token
def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _b64d(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def create_access_token(user_id: int, role: str, remember: bool = False) -> tuple[str, int]:
    ttl = REMEMBER_TTL_SECONDS if remember else TOKEN_TTL_SECONDS
    exp = int(time.time()) + ttl
    payload = _b64e(json.dumps({"sub": user_id, "role": role, "exp": exp}, separators=(",", ":")).encode())
    signature = _b64e(hmac.new(SECRET_KEY, payload.encode(), hashlib.sha256).digest())
    return f"{payload}.{signature}", exp


def decode_access_token(token: str) -> Optional[dict]:
    try:
        payload, signature = token.split(".")
        expected = _b64e(hmac.new(SECRET_KEY, payload.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            return None
        data = json.loads(_b64d(payload))
        if int(data.get("exp", 0)) < int(time.time()):
            return None
        return data
    except Exception:
        return None


# ---------------------------------------------------------------- Bağımlılıklar
_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> StaffUser:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Oturum geçersiz veya süresi dolmuş. Lütfen tekrar giriş yapın.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not credentials or credentials.scheme.lower() != "bearer":
        raise unauthorized
    data = decode_access_token(credentials.credentials)
    if not data:
        raise unauthorized
    res = await db.execute(select(StaffUser).where(StaffUser.id == data.get("sub")))
    user = res.scalar_one_or_none()
    if not user or not user.is_active:
        raise unauthorized
    return user


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> Optional[StaffUser]:
    if not credentials or credentials.scheme.lower() != "bearer":
        return None
    data = decode_access_token(credentials.credentials)
    if not data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Oturum geçersiz veya süresi dolmuş. Lütfen tekrar giriş yapın.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    res = await db.execute(select(StaffUser).where(StaffUser.id == data.get("sub")))
    user = res.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Oturum geçersiz veya kullanıcı pasif durumda.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def require_roles(*roles: str):
    async def _checker(user: Optional[StaffUser] = Depends(get_optional_user)) -> Optional[StaffUser]:
        if user and user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bu işlem için yetkiniz bulunmuyor.")
        return user

    return _checker
