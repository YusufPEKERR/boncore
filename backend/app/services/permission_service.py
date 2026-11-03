import json
from urllib.parse import unquote
from fastapi import Request, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.models.setting import RestaurantSetting
from app.models.user import StaffUser


def normalize_role_key(raw_role: str | None) -> str:
    if not raw_role:
        return "waiter"
    r = unquote(str(raw_role)).strip().lower()
    if r in ("admin", "müdür", "mudur", "manager"):
        return "manager"
    if r in ("kasa", "kasiyer", "cashier"):
        return "cashier"
    if r in ("mutfak", "kitchen"):
        return "kitchen"
    if r in ("kurye", "courier"):
        return "courier"
    if r in ("garson", "waiter"):
        return "waiter"
    return r


async def resolve_operator_role(
    db: AsyncSession,
    request: Request | None = None,
    operator_name: str | None = None,
) -> str | None:
    if request is not None:
        header_role = request.headers.get("X-User-Role")
        if header_role:
            return normalize_role_key(header_role)

    if operator_name:
        clean_name = operator_name.strip()
        user_stmt = select(StaffUser).where(
            StaffUser.name == clean_name,
            StaffUser.is_active == True,
        )
        user_res = await db.execute(user_stmt)
        staff_user = user_res.scalars().first()
        if staff_user and staff_user.role:
            return normalize_role_key(staff_user.role)
        if "garson" in clean_name.lower():
            return "waiter"

    return None


async def check_role_permission(
    db: AsyncSession,
    role_key: str,
    perm_ids: list[str] | tuple[str, ...],
    default_value: bool = True,
) -> bool:
    if role_key == "manager":
        return True

    perm_stmt = select(RestaurantSetting).where(
        RestaurantSetting.key == "role_permissions"
    )
    perm_res = await db.execute(perm_stmt)
    perm_setting = perm_res.scalar_one_or_none()
    if perm_setting and perm_setting.value:
        try:
            perms = json.loads(perm_setting.value)
            if isinstance(perms, list):
                matched = [
                    p
                    for p in perms
                    if isinstance(p, dict) and p.get("id") in perm_ids
                ]
                if matched:
                    return any(
                        bool((p.get("roles") or {}).get(role_key, False))
                        for p in matched
                    )
        except Exception:
            pass

    return default_value


async def require_permission(
    db: AsyncSession,
    request: Request | None,
    operator_name: str | None,
    perm_ids: list[str] | tuple[str, ...],
    default_value: bool = True,
    error_detail: str = "Bu işlem için rol yetkiniz bulunmamaktadır.",
) -> None:
    role_key = await resolve_operator_role(db, request, operator_name)
    if not role_key or role_key == "manager":
        return

    allowed = await check_role_permission(db, role_key, perm_ids, default_value)
    if not allowed:
        raise HTTPException(status_code=403, detail=error_detail)
