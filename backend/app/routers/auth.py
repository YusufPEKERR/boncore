from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.database import get_db
from app.models.user import StaffUser
from app.schemas.all import PinAuthRequest, StaffUserResponse
from app.config import settings

router = APIRouter(prefix="/auth", tags=["Auth & PIN"])

@router.post("/login-pin", response_model=StaffUserResponse)
async def login_by_pin(payload: PinAuthRequest, db: AsyncSession = Depends(get_db)):
    """
    Authenticate staff user by 4-digit PIN code.
    Fast sub-millisecond response.
    """
    stmt = select(StaffUser).where(StaffUser.pin_code == payload.pin_code, StaffUser.is_active == True)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        # Fallback for default master manager override
        if payload.pin_code == settings.MANAGER_OVERRIDE_PIN:
            return StaffUserResponse(id=999, name="Yönetici (Master)", role="manager", is_active=True)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Geçersiz PIN Kodu!"
        )

    return StaffUserResponse(
        id=user.id,
        name=user.name,
        role=user.role,
        is_active=user.is_active
    )

@router.get("/staff")
async def list_staff(db: AsyncSession = Depends(get_db)):
    stmt = select(StaffUser)
    result = await db.execute(stmt)
    users = result.scalars().all()
    return [
        {
            "id": u.id,
            "name": u.name,
            "role": u.role,
            "pin_code": u.pin_code,
            "is_active": u.is_active,
            "created_at": u.created_at.strftime("%d.%m.%Y") if u.created_at else None
        } for u in users
    ]

@router.post("/staff")
async def create_staff(payload: dict, db: AsyncSession = Depends(get_db)):
    stmt = select(StaffUser).where(StaffUser.pin_code == payload.get("pin_code"))
    res = await db.execute(stmt)
    if res.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Bu PIN kodu başka bir personele atanmış!")

    new_user = StaffUser(
        name=payload.get("name"),
        role=payload.get("role", "waiter"),
        pin_code=payload.get("pin_code", "1234"),
        is_active=payload.get("is_active", True)
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return {"status": "success", "user": {"id": new_user.id, "name": new_user.name, "role": new_user.role, "pin_code": new_user.pin_code, "is_active": new_user.is_active}}

@router.put("/staff/{user_id}")
async def update_staff(user_id: int, payload: dict, db: AsyncSession = Depends(get_db)):
    stmt = select(StaffUser).where(StaffUser.id == user_id)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Personel bulunamadı.")

    if "name" in payload: user.name = payload["name"]
    if "role" in payload: user.role = payload["role"]
    if "pin_code" in payload: user.pin_code = payload["pin_code"]
    if "is_active" in payload: user.is_active = payload["is_active"]

    await db.commit()
    return {"status": "success", "message": "Personel güncellendi."}

@router.delete("/staff/{user_id}")
async def delete_staff(user_id: int, db: AsyncSession = Depends(get_db)):
    stmt = select(StaffUser).where(StaffUser.id == user_id)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Personel bulunamadı.")

    await db.delete(user)
    await db.commit()
    return {"status": "success", "message": "Personel silindi."}
