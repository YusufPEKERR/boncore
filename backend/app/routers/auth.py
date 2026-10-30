import re
import time
from collections import defaultdict, deque
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.config import settings
from app.database import get_db, get_master_db, get_tenant_sessionmaker, clean_tenant_code
from app.models.user import StaffUser
from app.models.tenant import RestaurantTenant
from app.schemas.all import (
    ChangePasswordRequest,
    LoginRequest,
    PinAuthRequest,
    StaffUserCreate,
    StaffUserResponse,
    StaffUserUpdate,
)
from app.security import (
    create_access_token,
    get_current_user,
    get_optional_user,
    hash_password,
    require_roles,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["Auth"])

VALID_ROLES = {"waiter", "cashier", "chef", "kitchen", "manager"}

# --- Basit kaba kuvvet koruması: 5 dakikada en fazla 8 hatalı deneme (kullanıcı adı + IP) ---
_MAX_FAILED = 8
_WINDOW_SECONDS = 300
_failed_attempts: dict[str, deque] = defaultdict(deque)


def _attempt_key(request: Request, username: str) -> str:
    ip = request.client.host if request.client else "unknown"
    return f"{ip}:{username.lower()}"


def _prune(key: str) -> deque:
    q = _failed_attempts[key]
    now = time.time()
    while q and now - q[0] > _WINDOW_SECONDS:
        q.popleft()
    return q


def _slugify_username(name: str) -> str:
    tr_map = str.maketrans("çğıöşüÇĞİÖŞÜ", "cgiosuCGIOSU")
    cleaned = name.translate(tr_map).lower()
    cleaned = re.sub(r"[^a-z0-9]+", ".", cleaned).strip(".")
    return cleaned[:30] or "personel"


def _serialize_user(u: StaffUser, include_pin: bool = True) -> dict:
    data = {
        "id": u.id,
        "name": u.name,
        "username": u.username,
        "role": u.role,
        "is_active": u.is_active,
        "last_login_at": u.last_login_at.strftime("%d.%m.%Y %H:%M") if u.last_login_at else None,
        "created_at": u.created_at.strftime("%d.%m.%Y") if u.created_at else None,
    }
    if include_pin:
        data["pin_code"] = u.pin_code
    return data


@router.post("/login")
async def login(payload: LoginRequest, request: Request, master_db: AsyncSession = Depends(get_master_db)):
    """
    Restoran kullanıcı adı + personel şifresi/PIN kodu ile giriş.
    Restoran kullanıcı adı işletmeyi seçer, girilen şifre veya PIN ise o restorandaki
    personelin kim olduğunu (Müdür, Kasiyer, Garson, Şef) belirler.
    Her restoran tamamen izole kendi SQLite veritabanından doğrulanır.
    """
    username = payload.username.strip()
    clean_pwd = payload.password.strip()
    key = _attempt_key(request, username)
    attempts = _prune(key)
    if len(attempts) >= _MAX_FAILED:
        wait = int(_WINDOW_SECONDS - (time.time() - attempts[0])) + 1
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Çok fazla hatalı deneme. Lütfen {max(1, wait // 60)} dakika sonra tekrar deneyin.",
        )

    # 1. Aşama: Master Admin Kontrolü
    if username.lower() in ["master", "superadmin"] and clean_pwd in ["masteradmin2026", "boncore2026master", "123456"]:
        token, exp = create_access_token(999999, "master_admin", remember=payload.remember, restaurant_code="master")
        return {
            "access_token": token,
            "token_type": "bearer",
            "expires_at": exp,
            "user": {
                "id": 999999,
                "name": "SaaS Platform Yöneticisi",
                "username": "master",
                "role": "master_admin",
                "is_master": True
            },
            "is_master": True
        }

    # 2. Aşama: Restoran Kullanıcı Adı / Kodu ile Master DB Araması
    t_stmt = select(RestaurantTenant).where(
        (func.lower(RestaurantTenant.code) == username.lower()) |
        (func.replace(func.lower(RestaurantTenant.code), "-", "") == username.lower().replace("-", "").replace(" ", "")) |
        (func.lower(RestaurantTenant.name) == username.lower())
    )
    t_res = await master_db.execute(t_stmt)
    tenant = t_res.scalar_one_or_none()

    matched_user = None
    target_tenant = tenant

    # Eğer doğrudan restoran adı girilmediyse, doğrudan kullanıcı adı girilmiş olabilir (Örn: 'moda_admin', 'admin', 'roast_barista')
    if not target_tenant:
        all_tenants_res = await master_db.execute(select(RestaurantTenant).where(RestaurantTenant.status != "deleted"))
        all_tenants = all_tenants_res.scalars().all()

        # Önce kullanıcı adı prefix ipucuna bak (örn: moda_ -> moda-meyhane)
        sorted_tenants = list(all_tenants)
        clean_u = username.lower()
        if clean_u.startswith("moda_"):
            sorted_tenants = [t for t in all_tenants if t.code == "moda-meyhane"] + [t for t in all_tenants if t.code != "moda-meyhane"]
        elif clean_u.startswith("roast_"):
            sorted_tenants = [t for t in all_tenants if t.code == "roast-brew"] + [t for t in all_tenants if t.code != "roast-brew"]
        elif clean_u.startswith("etiler_"):
            sorted_tenants = [t for t in all_tenants if t.code == "etiler-steak"] + [t for t in all_tenants if t.code != "etiler-steak"]

        for cand_t in sorted_tenants:
            t_sm = get_tenant_sessionmaker(cand_t.code)
            try:
                async with t_sm() as t_session:
                    res = await t_session.execute(select(StaffUser).where(
                        (func.lower(StaffUser.username) == username.lower()) |
                        (StaffUser.pin_code == clean_pwd)
                    ))
                    users_cand = res.scalars().all()
                    for u in users_cand:
                        if func.lower(u.username) == username.lower() if u.username else False:
                            if verify_password(clean_pwd, u.password_hash) or (u.pin_code and str(u.pin_code).strip() == clean_pwd):
                                matched_user = u
                                target_tenant = cand_t
                                break
                    if matched_user:
                        break
            except Exception:
                pass

    if target_tenant and not matched_user:
        if target_tenant.status == "suspended":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"'{target_tenant.name}' restoranının aboneliği askıya alınmıştır. Lütfen platform yöneticisi ile iletişime geçin.",
            )

        # Bu restoranın İZOLE VERİTABANINA bağlan
        t_sm = get_tenant_sessionmaker(target_tenant.code)
        async with t_sm() as t_session:
            u_stmt = select(StaffUser).where(StaffUser.is_active == True)
            u_res = await t_session.execute(u_stmt)
            tenant_users = u_res.scalars().all()

            for u in tenant_users:
                if verify_password(clean_pwd, u.password_hash) or (u.pin_code and str(u.pin_code).strip() == clean_pwd):
                    matched_user = u
                    # Update last_login_at in tenant's own DB
                    u.last_login_at = datetime.utcnow()
                    await t_session.commit()
                    break

            if not matched_user:
                attempts.append(time.time())
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=f"Girilen şifre veya PIN kodu '{target_tenant.name}' restoranına kayıtlı hiçbir personele ait değil."
                )

    if not matched_user or not target_tenant:
        attempts.append(time.time())
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"'{username}' adına kayıtlı bir restoran veya kullanıcı bulunamadı. Lütfen restoran kullanıcı adını kontrol edin."
        )

    if not matched_user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Kullanıcı hesabı pasif durumda. Yöneticinize başvurun.")

    _failed_attempts.pop(key, None)

    token, exp = create_access_token(
        matched_user.id, 
        matched_user.role, 
        remember=payload.remember,
        restaurant_code=target_tenant.code,
        restaurant_id=target_tenant.id
    )
    
    resp_payload = {
        "access_token": token,
        "token_type": "bearer",
        "expires_at": exp,
        "user": _serialize_user(matched_user, include_pin=False),
        "restaurant": {
            "id": target_tenant.id,
            "name": target_tenant.name,
            "code": target_tenant.code,
            "plan": target_tenant.plan,
            "status": target_tenant.status
        }
    }

    return resp_payload


@router.post("/login-pin", response_model=StaffUserResponse)
async def login_by_pin(payload: PinAuthRequest, db: AsyncSession = Depends(get_db)):
    """
    Yönetici / hızlı vardiya PIN doğrulaması.
    """
    stmt = select(StaffUser).where(StaffUser.pin_code == payload.pin_code, StaffUser.is_active == True)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        if payload.pin_code == settings.MANAGER_OVERRIDE_PIN:
            token, _ = create_access_token(999, "manager")
            return StaffUserResponse(
                id=999,
                name="Yönetici (Master)",
                username="admin",
                role="manager",
                is_active=True,
                access_token=token,
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Geçersiz PIN Kodu!",
        )

    user.last_login_at = datetime.utcnow()
    await db.commit()
    token, _ = create_access_token(user.id, user.role)
    return StaffUserResponse(
        id=user.id,
        name=user.name,
        username=user.username,
        role=user.role,
        is_active=user.is_active,
        access_token=token,
    )


@router.get("/me")
async def me(user: StaffUser = Depends(get_current_user)):
    return _serialize_user(user, include_pin=False)


@router.post("/change-password")
async def change_password(
    payload: ChangePasswordRequest,
    user: StaffUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Mevcut parola hatalı.")
    user.password_hash = hash_password(payload.new_password)
    await db.commit()
    return {"status": "success", "message": "Parolanız başarıyla güncellendi."}


# ------------------------------------------------------------------ Personel yönetimi
@router.get("/staff")
async def list_staff(
    user: Optional[StaffUser] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(StaffUser).order_by(StaffUser.id))
    include_pin = user is None or user.role == "manager"
    return [_serialize_user(u, include_pin=include_pin) for u in res.scalars().all()]


async def _ensure_unique(db: AsyncSession, username: str | None, pin_code: str | None, exclude_id: int | None = None):
    if username:
        q = select(StaffUser).where(func.lower(StaffUser.username) == username.lower())
        if exclude_id:
            q = q.where(StaffUser.id != exclude_id)
        if (await db.execute(q)).scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Bu kullanıcı adı zaten kullanılıyor.")
    if pin_code:
        q = select(StaffUser).where(StaffUser.pin_code == pin_code)
        if exclude_id:
            q = q.where(StaffUser.id != exclude_id)
        if (await db.execute(q)).scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Bu PIN kodu başka bir personele atanmış!")


async def _active_manager_count(db: AsyncSession, exclude_id: int | None = None) -> int:
    q = select(func.count(StaffUser.id)).where(StaffUser.role == "manager", StaffUser.is_active == True)
    if exclude_id:
        q = q.where(StaffUser.id != exclude_id)
    return (await db.execute(q)).scalar_one()


@router.post("/staff")
async def create_staff(
    payload: StaffUserCreate,
    _: Optional[StaffUser] = Depends(require_roles("manager")),
    db: AsyncSession = Depends(get_db),
):
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Personel adı boş bırakılamaz.")
    if payload.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Geçersiz personel rolü.")

    username = (payload.username or "").strip()
    if not username:
        base = _slugify_username(payload.name)
        candidate, idx = base, 2
        while (await db.execute(select(StaffUser).where(func.lower(StaffUser.username) == candidate.lower()))).scalar_one_or_none():
            candidate = f"{base}{idx}"
            idx += 1
        username = candidate

    await _ensure_unique(db, username, payload.pin_code)

    new_user = StaffUser(
        name=payload.name.strip(),
        username=username,
        password_hash=hash_password(payload.password or "123456"),
        role=payload.role,
        pin_code=payload.pin_code,
        is_active=payload.is_active,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return {"status": "success", "user": _serialize_user(new_user, include_pin=True)}


@router.put("/staff/{user_id}")
async def update_staff(
    user_id: int,
    payload: StaffUserUpdate,
    _: Optional[StaffUser] = Depends(require_roles("manager")),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(StaffUser).where(StaffUser.id == user_id))
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Personel bulunamadı.")

    if payload.role is not None and payload.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Geçersiz personel rolü.")
    await _ensure_unique(db, payload.username, payload.pin_code, exclude_id=user_id)

    demoting = user.role == "manager" and (
        (payload.role is not None and payload.role != "manager") or payload.is_active is False
    )
    if demoting and await _active_manager_count(db, exclude_id=user_id) == 0:
        raise HTTPException(status_code=400, detail="Sistemde en az bir aktif yönetici kalmalıdır.")

    if payload.name is not None and payload.name.strip():
        user.name = payload.name.strip()
    if payload.username is not None and payload.username.strip():
        user.username = payload.username.strip()
    if payload.password:
        user.password_hash = hash_password(payload.password)
    if payload.role is not None:
        user.role = payload.role
    if payload.pin_code is not None:
        user.pin_code = payload.pin_code
    if payload.is_active is not None:
        user.is_active = payload.is_active

    await db.commit()
    return {"status": "success", "message": "Personel güncellendi."}


@router.delete("/staff/{user_id}")
async def delete_staff(
    user_id: int,
    current: Optional[StaffUser] = Depends(require_roles("manager")),
    db: AsyncSession = Depends(get_db),
):
    if current and user_id == current.id:
        raise HTTPException(status_code=400, detail="Kendi hesabınızı silemezsiniz.")
    res = await db.execute(select(StaffUser).where(StaffUser.id == user_id))
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Personel bulunamadı.")
    if user.role == "manager" and await _active_manager_count(db, exclude_id=user_id) == 0:
        raise HTTPException(status_code=400, detail="Sistemde en az bir aktif yönetici kalmalıdır.")

    await db.delete(user)
    await db.commit()
    return {"status": "success", "message": "Personel silindi."}
