import logging
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, update, delete
from sqlalchemy.orm import selectinload

from app.database import get_master_db as get_db, get_master_db, get_tenant_sessionmaker, clean_tenant_code, _tenant_engines, Base
from app.models.tenant import RestaurantTenant, TenantLead, TenantInvoice
from app.models.user import StaffUser
from app.models.order import Order
from app.security import hash_password, verify_password, create_access_token

logger = logging.getLogger("boncore.master_admin")
router = APIRouter(prefix="/master", tags=["Master SaaS Administration"])

# Master Admin Credentials
MASTER_ADMIN_USERNAMES = ["master", "superadmin", "admin"]
MASTER_ADMIN_PASSWORDS = ["masteradmin2026", "boncore2026master", "123456"]

# --- Pydantic Schemas ---
class MasterLoginRequest(BaseModel):
    username: str
    password: str

class TenantCreateRequest(BaseModel):
    name: str
    code: Optional[str] = None
    owner_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    city: Optional[str] = "İstanbul"
    tax_number: Optional[str] = None
    tax_office: Optional[str] = None
    address: Optional[str] = None
    plan: Optional[str] = "pro"
    monthly_price: Optional[float] = 1490.0
    billing_cycle: Optional[str] = "monthly"
    status: Optional[str] = "active"
    notes: Optional[str] = None
    admin_username: Optional[str] = None
    admin_password: Optional[str] = "123456"

class TenantUpdateRequest(BaseModel):
    name: Optional[str] = None
    owner_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    city: Optional[str] = None
    tax_number: Optional[str] = None
    tax_office: Optional[str] = None
    address: Optional[str] = None
    plan: Optional[str] = None
    monthly_price: Optional[float] = None
    billing_cycle: Optional[str] = None
    status: Optional[str] = None
    payment_method: Optional[str] = None
    payment_status: Optional[str] = None
    notes: Optional[str] = None

class TenantUserCreateRequest(BaseModel):
    name: str
    username: str
    password: str
    role: str = "waiter" # manager, cashier, waiter, chef, kitchen
    pin_code: Optional[str] = None

class TenantUserPasswordRequest(BaseModel):
    new_password: Optional[str] = None
    new_pin: Optional[str] = None

class TenantUserUpdateRequest(BaseModel):
    name: Optional[str] = None
    username: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None

class LeadCreateRequest(BaseModel):
    full_name: str
    phone: str
    company_name: str
    business_type: Optional[str] = "restoran"
    city: Optional[str] = "İstanbul"
    notes: Optional[str] = None

class LeadStatusRequest(BaseModel):
    status: str # yeni, arandi, demo_yapildi, musteri_oldu, iptal
    notes: Optional[str] = None

class InvoiceCreateRequest(BaseModel):
    tenant_id: int
    amount: float
    period: str
    plan: Optional[str] = "pro"
    payment_method: Optional[str] = "credit_card"
    status: Optional[str] = "paid"


# --- Master Admin Authentication ---
@router.post("/login")
async def master_admin_login(req: MasterLoginRequest):
    """
    SaaS Platform SuperAdmin Login.
    """
    user_clean = req.username.strip().lower()
    pass_clean = req.password.strip()

    is_user_valid = user_clean in [u.lower() for u in MASTER_ADMIN_USERNAMES]
    is_pass_valid = pass_clean in MASTER_ADMIN_PASSWORDS

    if not (is_user_valid and is_pass_valid):
        raise HTTPException(status_code=401, detail="Sistem yöneticisi kullanıcı adı veya şifre geçersiz.")

    token_str, _ = create_access_token(user_id=999999, role="master_admin", remember=True)

    return {
        "access_token": token_str,
        "token_type": "bearer",
        "user": {
            "username": "master",
            "name": "SaaS Platform Yöneticisi",
            "role": "master_admin",
            "is_master": True
        }
    }


# --- Platform Dashboard Stats ---
@router.get("/stats")
async def get_master_stats(db: AsyncSession = Depends(get_db)):
    """
    Returns high-level SaaS business KPIs: MRR, ARR, Tenants, Leads.
    """
    # Auto-seed initial demo tenants if none exist
    await _ensure_demo_tenants_and_leads(db)

    # 1. Tenants count by status
    stmt_tenants = select(RestaurantTenant)
    res_tenants = await db.execute(stmt_tenants)
    all_tenants = res_tenants.scalars().all()

    total_tenants = len(all_tenants)
    active_tenants = sum(1 for t in all_tenants if t.status == "active")
    trial_tenants = sum(1 for t in all_tenants if t.status == "trial")
    suspended_tenants = sum(1 for t in all_tenants if t.status == "suspended")

    # MRR (Monthly Recurring Revenue)
    total_mrr = sum(t.monthly_price or 0.0 for t in all_tenants if t.status == "active")
    total_arr = total_mrr * 12

    # Plan counts
    plan_counts = {
        "starter": sum(1 for t in all_tenants if t.plan == "starter"),
        "pro": sum(1 for t in all_tenants if t.plan == "pro"),
        "enterprise": sum(1 for t in all_tenants if t.plan == "enterprise"),
    }

    # 2. Leads count
    stmt_leads = select(TenantLead)
    res_leads = await db.execute(stmt_leads)
    all_leads = res_leads.scalars().all()

    total_leads = len(all_leads)
    new_leads = sum(1 for l in all_leads if l.status == "yeni")
    converted_leads = sum(1 for l in all_leads if l.status == "musteri_oldu")

    # 3. Invoices sum this month
    stmt_invoices = select(TenantInvoice)
    res_inv = await db.execute(stmt_invoices)
    all_inv = res_inv.scalars().all()
    paid_invoices_sum = sum(i.amount for i in all_inv if i.status == "paid")
    pending_invoices_sum = sum(i.amount for i in all_inv if i.status in ["pending", "overdue"])

    return {
        "total_tenants": total_tenants,
        "active_tenants": active_tenants,
        "trial_tenants": trial_tenants,
        "suspended_tenants": suspended_tenants,
        "total_mrr": total_mrr,
        "total_arr": total_arr,
        "plan_counts": plan_counts,
        "total_leads": total_leads,
        "new_leads": new_leads,
        "converted_leads": converted_leads,
        "paid_invoices_sum": paid_invoices_sum,
        "pending_invoices_sum": pending_invoices_sum,
        "currency": "TRY",
        "last_updated": datetime.utcnow().isoformat()
    }


# --- Tenants Management ---
@router.get("/tenants")
async def list_tenants(db: AsyncSession = Depends(get_db)):
    """
    Returns list of all restaurant tenants with their user count and active status.
    """
    await _ensure_demo_tenants_and_leads(db)
    stmt = select(RestaurantTenant).order_by(RestaurantTenant.id.asc())
    res = await db.execute(stmt)
    tenants = res.scalars().all()

    # Get user counts per tenant
    user_counts_stmt = select(StaffUser.restaurant_id, func.count(StaffUser.id)).group_by(StaffUser.restaurant_id)
    res_uc = await db.execute(user_counts_stmt)
    uc_map = {row[0]: row[1] for row in res_uc.all() if row[0] is not None}

    output = []
    for t in tenants:
        output.append({
            "id": t.id,
            "code": t.code,
            "name": t.name,
            "owner_name": t.owner_name,
            "phone": t.phone,
            "email": t.email,
            "city": t.city,
            "tax_number": t.tax_number,
            "tax_office": t.tax_office,
            "address": t.address,
            "plan": t.plan,
            "monthly_price": t.monthly_price,
            "billing_cycle": t.billing_cycle,
            "status": t.status,
            "trial_ends_at": t.trial_ends_at.isoformat() if t.trial_ends_at else None,
            "renewal_date": t.renewal_date.isoformat() if t.renewal_date else None,
            "payment_method": t.payment_method,
            "payment_status": t.payment_status,
            "notes": t.notes,
            "user_count": uc_map.get(t.id, 0),
            "created_at": t.created_at.isoformat() if t.created_at else None
        })
    return output


@router.post("/tenants")
async def create_tenant(req: TenantCreateRequest, db: AsyncSession = Depends(get_db)):
    """
    Creates a new restaurant tenant and provisions default manager credentials.
    """
    clean_code = req.code.strip().lower() if req.code else req.name.lower().replace(" ", "-").replace("ç", "c").replace("ğ", "g").replace("ı", "i").replace("ö", "o").replace("ş", "s").replace("ü", "u")
    clean_code = "".join(c for c in clean_code if c.isalnum() or c == "-")

    # Check code unique
    existing = await db.execute(select(RestaurantTenant).where(RestaurantTenant.code == clean_code))
    if existing.scalar_one_or_none():
        clean_code = f"{clean_code}-{int(datetime.utcnow().timestamp()) % 1000}"

    new_tenant = RestaurantTenant(
        code=clean_code,
        name=req.name.strip(),
        owner_name=req.owner_name.strip() if req.owner_name else None,
        phone=req.phone.strip() if req.phone else None,
        email=req.email.strip() if req.email else None,
        city=req.city or "İstanbul",
        tax_number=req.tax_number,
        tax_office=req.tax_office,
        address=req.address,
        plan=req.plan or "pro",
        monthly_price=req.monthly_price or 1490.0,
        billing_cycle=req.billing_cycle or "monthly",
        status=req.status or "active",
        trial_ends_at=datetime.utcnow() + timedelta(days=14) if req.status == "trial" else None,
        renewal_date=datetime.utcnow() + timedelta(days=30),
        notes=req.notes
    )
    db.add(new_tenant)
    await db.commit()
    await db.refresh(new_tenant)

    # Provision default admin user for this new restaurant
    admin_uname = (req.admin_username or f"{clean_code}_admin").lower()
    # Check username collision
    u_exist = await db.execute(select(StaffUser).where(StaffUser.username == admin_uname))
    if u_exist.scalar_one_or_none():
        admin_uname = f"{admin_uname}{new_tenant.id}"

    # Generate random unique 4-digit PIN
    pin_candidate = f"{(new_tenant.id * 137 + 1000) % 9000 + 1000}"

    new_user = StaffUser(
        name=f"{req.owner_name or req.name} (Yönetici)",
        username=admin_uname,
        password_hash=hash_password(req.admin_password or "123456"),
        pin_code=pin_candidate,
        role="manager",
        restaurant_id=new_tenant.id,
        is_active=True
    )
    db.add(new_user)

    # Create initial invoice record
    inv_no = f"BON{datetime.utcnow().strftime('%Y%m')}-{new_tenant.id:04d}"
    new_inv = TenantInvoice(
        tenant_id=new_tenant.id,
        invoice_no=inv_no,
        tenant_name=new_tenant.name,
        period=datetime.utcnow().strftime("%B %Y"),
        amount=new_tenant.monthly_price,
        plan=new_tenant.plan,
        status="paid" if new_tenant.status == "active" else "pending",
        paid_at=datetime.utcnow() if new_tenant.status == "active" else None
    )
    db.add(new_inv)

    await db.commit()

    return {
        "success": True,
        "message": f"{new_tenant.name} başarıyla oluşturuldu.",
        "tenant_id": new_tenant.id,
        "code": new_tenant.code,
        "admin_username": admin_uname,
        "admin_password": req.admin_password or "123456",
        "pin_code": pin_candidate
    }


@router.put("/tenants/{tenant_id}")
async def update_tenant(tenant_id: int, req: TenantUpdateRequest, db: AsyncSession = Depends(get_db)):
    """
    Updates tenant details, subscription plan, status, pricing.
    """
    tenant = await db.get(RestaurantTenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı.")

    for field, val in req.dict(exclude_unset=True).items():
        if val is not None:
            setattr(tenant, field, val)

    tenant.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(tenant)

    return {"success": True, "tenant": tenant}


@router.delete("/tenants/{tenant_id}")
async def delete_tenant(tenant_id: int, db: AsyncSession = Depends(get_db)):
    """
    Removes or deactivates a restaurant tenant.
    """
    tenant = await db.get(RestaurantTenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı.")

    # Instead of hard delete, suspend or delete
    await db.delete(tenant)
    await db.commit()
    return {"success": True, "message": "Restoran kaydı silindi."}


# --- Tenant Staff Users & Password Management ---
@router.get("/tenants/{tenant_id}/users")
async def list_tenant_users(tenant_id: int, db: AsyncSession = Depends(get_db)):
    """
    Lists all staff users for a given restaurant tenant from its isolated database.
    """
    tenant = await db.get(RestaurantTenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı.")

    t_sm = get_tenant_sessionmaker(tenant.code)
    async with t_sm() as t_db:
        stmt = select(StaffUser).order_by(StaffUser.id.asc())
        res = await t_db.execute(stmt)
        users = res.scalars().all()

        return [
            {
                "id": u.id,
                "name": u.name,
                "username": u.username,
                "pin_code": u.pin_code,
                "role": u.role,
                "is_active": u.is_active,
                "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
                "created_at": u.created_at.isoformat() if u.created_at else None
            }
            for u in users
        ]


@router.post("/tenants/{tenant_id}/users")
async def create_tenant_user(tenant_id: int, req: TenantUserCreateRequest, db: AsyncSession = Depends(get_db)):
    """
    Creates a new user under the specified restaurant tenant's isolated database.
    """
    tenant = await db.get(RestaurantTenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı.")

    t_sm = get_tenant_sessionmaker(tenant.code)
    async with t_sm() as t_db:
        clean_username = req.username.strip().lower()
        exist = await t_db.execute(select(StaffUser).where(StaffUser.username == clean_username))
        if exist.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Bu kullanıcı adı bu restoranda zaten kullanılıyor.")

        pin = req.pin_code or str((tenant_id * 179 + len(clean_username) * 31 + 1000) % 9000 + 1000)

        new_user = StaffUser(
            name=req.name.strip(),
            username=clean_username,
            password_hash=hash_password(req.password.strip()),
            pin_code=pin,
            role=req.role or "waiter",
            restaurant_id=tenant_id,
            is_active=True
        )
        t_db.add(new_user)
        await t_db.commit()
        await t_db.refresh(new_user)

        return {
            "success": True,
            "message": f"Kullanıcı {new_user.name} oluşturuldu.",
            "user_id": new_user.id,
            "username": new_user.username,
            "pin_code": new_user.pin_code
        }


@router.put("/tenants/{tenant_id}/users/{user_id}/password")
async def change_tenant_user_password(
    tenant_id: int, 
    user_id: int, 
    req: TenantUserPasswordRequest, 
    db: AsyncSession = Depends(get_db)
):
    """
    Master Admin can directly change/reset password or PIN of any restaurant's staff member!
    """
    tenant = await db.get(RestaurantTenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı.")

    t_sm = get_tenant_sessionmaker(tenant.code)
    async with t_sm() as t_db:
        user = await t_db.get(StaffUser, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")

        if req.new_password and req.new_password.strip():
            user.password_hash = hash_password(req.new_password.strip())

        if req.new_pin and req.new_pin.strip():
            clean_pin = req.new_pin.strip()
            pin_exist = await t_db.execute(select(StaffUser).where(StaffUser.pin_code == clean_pin, StaffUser.id != user_id))
            if pin_exist.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Bu PIN kodu bu restoranda başka bir kullanıcıya ait.")
            user.pin_code = clean_pin

        await t_db.commit()
        logger.info(f"Master Admin changed password/PIN for user {user.username} (ID: {user_id}) in tenant {tenant.code}")

        return {
            "success": True,
            "message": f"{user.name} kullanıcısının şifresi/PIN kodu başarıyla güncellendi."
        }


@router.put("/tenants/{tenant_id}/users/{user_id}")
async def update_tenant_user(
    tenant_id: int,
    user_id: int,
    req: TenantUserUpdateRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Update username, role or active status for a tenant user.
    """
    tenant = await db.get(RestaurantTenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı.")

    t_sm = get_tenant_sessionmaker(tenant.code)
    async with t_sm() as t_db:
        user = await t_db.get(StaffUser, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")

        if req.username:
            clean_uname = req.username.strip().lower()
            if clean_uname != user.username:
                exist = await t_db.execute(select(StaffUser).where(StaffUser.username == clean_uname, StaffUser.id != user_id))
                if exist.scalar_one_or_none():
                    raise HTTPException(status_code=400, detail="Bu kullanıcı adı zaten mevcut.")
                user.username = clean_uname

        if req.name is not None:
            user.name = req.name.strip()
        if req.role is not None:
            user.role = req.role
        if req.is_active is not None:
            user.is_active = req.is_active

        await t_db.commit()
        return {"success": True, "message": f"{user.name} güncellendi."}
async def update_tenant_user(
    tenant_id: int,
    user_id: int,
    req: TenantUserUpdateRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Update username, role or active status for a tenant user.
    """
    user = await db.get(StaffUser, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")

    if req.username:
        clean_uname = req.username.strip().lower()
        if clean_uname != user.username:
            exist = await db.execute(select(StaffUser).where(StaffUser.username == clean_uname, StaffUser.id != user_id))
            if exist.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Bu kullanıcı adı zaten mevcut.")
            user.username = clean_uname

    if req.name is not None:
        user.name = req.name.strip()
    if req.role is not None:
        user.role = req.role
    if req.is_active is not None:
        user.is_active = req.is_active

    await db.commit()
    return {"success": True, "message": f"{user.name} güncellendi."}


# --- Leads (Gelen Müşteri / Demo Talepleri) ---
@router.get("/leads")
async def list_leads(status_filter: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    """
    Lists incoming customer leads from landing page demo requests.
    """
    await _ensure_demo_tenants_and_leads(db)
    stmt = select(TenantLead).order_by(TenantLead.id.desc())
    if status_filter:
        stmt = stmt.where(TenantLead.status == status_filter)

    res = await db.execute(stmt)
    leads = res.scalars().all()

    return [
        {
            "id": l.id,
            "full_name": l.full_name,
            "phone": l.phone,
            "company_name": l.company_name,
            "business_type": l.business_type,
            "city": l.city,
            "status": l.status,
            "notes": l.notes,
            "created_at": l.created_at.isoformat() if l.created_at else None
        }
        for l in leads
    ]


@router.post("/leads")
async def create_lead(req: LeadCreateRequest, db: AsyncSession = Depends(get_db)):
    """
    Public endpoint: Saves incoming lead when visitor submits demo request on landing page.
    """
    new_lead = TenantLead(
        full_name=req.full_name.strip(),
        phone=req.phone.strip(),
        company_name=req.company_name.strip(),
        business_type=req.business_type or "restoran",
        city=req.city or "İstanbul",
        status="yeni",
        notes=req.notes
    )
    db.add(new_lead)
    await db.commit()
    await db.refresh(new_lead)
    logger.info(f"New SaaS Demo Lead captured: {new_lead.full_name} ({new_lead.company_name}) - {new_lead.phone}")

    return {
        "success": True,
        "message": "Demo talebiniz başarıyla alındı. Satış ekibimiz en kısa sürede sizinle iletişime geçecektir.",
        "lead_id": new_lead.id
    }


@router.put("/leads/{lead_id}/status")
async def update_lead_status(lead_id: int, req: LeadStatusRequest, db: AsyncSession = Depends(get_db)):
    """
    Updates lead status: yeni, arandi, demo_yapildi, musteri_oldu, iptal.
    """
    lead = await db.get(TenantLead, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Müşteri talebi bulunamadı.")

    lead.status = req.status
    if req.notes:
        lead.notes = req.notes
    await db.commit()
    return {"success": True, "lead_id": lead.id, "status": lead.status}


@router.post("/leads/{lead_id}/convert")
async def convert_lead_to_tenant(lead_id: int, db: AsyncSession = Depends(get_db)):
    """
    One-click conversion: Turns a lead into an active restaurant tenant and creates an admin user!
    """
    lead = await db.get(TenantLead, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Talep bulunamadı.")

    clean_code = lead.company_name.lower().replace(" ", "-").replace("ç", "c").replace("ğ", "g").replace("ı", "i").replace("ö", "o").replace("ş", "s").replace("ü", "u")
    clean_code = "".join(c for c in clean_code if c.isalnum() or c == "-")[:30]
    if not clean_code:
        clean_code = f"restoran-{lead_id}"

    # Unique check
    ex = await db.execute(select(RestaurantTenant).where(RestaurantTenant.code == clean_code))
    if ex.scalar_one_or_none():
        clean_code = f"{clean_code}-{lead_id}"

    new_tenant = RestaurantTenant(
        code=clean_code,
        name=lead.company_name,
        owner_name=lead.full_name,
        phone=lead.phone,
        city=lead.city,
        plan="pro",
        monthly_price=1490.0,
        billing_cycle="monthly",
        status="trial",
        trial_ends_at=datetime.utcnow() + timedelta(days=14),
        renewal_date=datetime.utcnow() + timedelta(days=14),
        notes=f"Demo talebinden dönüştürüldü (Talep #{lead_id})."
    )
    db.add(new_tenant)
    await db.commit()
    await db.refresh(new_tenant)

    # Create admin user
    admin_uname = f"{clean_code}_admin"
    admin_pass = "123456"
    pin = f"{(new_tenant.id * 149 + 1000) % 9000 + 1000}"

    new_user = StaffUser(
        name=f"{lead.full_name} (Yönetici)",
        username=admin_uname,
        password_hash=hash_password(admin_pass),
        pin_code=pin,
        role="manager",
        restaurant_id=new_tenant.id,
        is_active=True
    )
    db.add(new_user)

    # Mark lead as converted
    lead.status = "musteri_oldu"
    await db.commit()

    return {
        "success": True,
        "message": f"Müşteri adayı başarıyla restorana dönüştürüldü! 14 günlük deneme başlatıldı.",
        "tenant_id": new_tenant.id,
        "tenant_name": new_tenant.name,
        "admin_username": admin_uname,
        "admin_password": admin_pass,
        "pin_code": pin
    }


# --- Invoices & Subscriptions ---
@router.get("/invoices")
async def list_invoices(db: AsyncSession = Depends(get_db)):
    """
    Lists SaaS invoices across all tenants.
    """
    await _ensure_demo_tenants_and_leads(db)
    stmt = select(TenantInvoice).order_by(TenantInvoice.id.desc())
    res = await db.execute(stmt)
    invoices = res.scalars().all()

    return [
        {
            "id": i.id,
            "tenant_id": i.tenant_id,
            "invoice_no": i.invoice_no,
            "tenant_name": i.tenant_name,
            "period": i.period,
            "amount": i.amount,
            "plan": i.plan,
            "payment_method": i.payment_method,
            "status": i.status,
            "paid_at": i.paid_at.isoformat() if i.paid_at else None,
            "created_at": i.created_at.isoformat() if i.created_at else None
        }
        for i in invoices
    ]


@router.put("/invoices/{invoice_id}/pay")
async def mark_invoice_paid(invoice_id: int, db: AsyncSession = Depends(get_db)):
    """
    Marks an invoice as paid.
    """
    inv = await db.get(TenantInvoice, invoice_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Fatura bulunamadı.")

    inv.status = "paid"
    inv.paid_at = datetime.utcnow()
    await db.commit()
    return {"success": True, "message": f"{inv.invoice_no} ödendi olarak işaretlendi."}


@router.post("/invoices")
async def create_invoice(req: InvoiceCreateRequest, db: AsyncSession = Depends(get_db)):
    """
    Manually creates a new SaaS invoice for a tenant.
    """
    tenant = await db.get(RestaurantTenant, req.tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı.")

    inv_no = f"BON{datetime.utcnow().strftime('%Y%m')}-{tenant.id:02d}{int(datetime.utcnow().timestamp()) % 1000:03d}"
    new_inv = TenantInvoice(
        tenant_id=tenant.id,
        invoice_no=inv_no,
        tenant_name=tenant.name,
        period=req.period,
        amount=req.amount,
        plan=req.plan or tenant.plan,
        payment_method=req.payment_method or "credit_card",
        status=req.status or "paid",
        paid_at=datetime.utcnow() if req.status == "paid" else None
    )
    db.add(new_inv)
    await db.commit()
    await db.refresh(new_inv)
    return {"success": True, "invoice": new_inv}


# --- Internal Helper: Seed initial demo tenants & leads if table empty ---
async def _ensure_demo_tenants_and_leads(db: AsyncSession):
    check_t = await db.execute(select(func.count(RestaurantTenant.id)))
    if (check_t.scalar() or 0) == 0:
        logger.info("Seeding initial SaaS tenants, leads and invoices...")
        demo_tenants = [
            RestaurantTenant(
                id=1,
                code="boncore-kadikoy",
                name="BonCore Restoran (Kadıköy Merkez)",
                owner_name="Ahmet Yılmaz",
                phone="+90 216 444 37 79",
                email="kadikoy@boncore.com",
                city="İstanbul",
                tax_number="3779901422",
                tax_office="Kadıköy",
                address="Moda Cad. No:84 D:4 Kadıköy / İstanbul",
                plan="enterprise",
                monthly_price=2990.0,
                billing_cycle="yearly",
                status="active",
                renewal_date=datetime.utcnow() + timedelta(days=240),
                payment_method="credit_card",
                payment_status="paid",
                notes="Ana bayrak işletme. 4 POS terminali, 2 KDS aktif."
            ),
            RestaurantTenant(
                id=2,
                code="moda-meyhane",
                name="Moda Meyhane & Ocakbaşı",
                owner_name="Murat Yılmaz",
                phone="0532 234 56 78",
                email="iletisim@modameyhane.com",
                city="İstanbul",
                tax_number="1234567890",
                tax_office="Kadıköy",
                address="Moda Cad. No:112",
                plan="pro",
                monthly_price=1490.0,
                billing_cycle="monthly",
                status="active",
                renewal_date=datetime.utcnow() + timedelta(days=12),
                payment_method="credit_card",
                payment_status="paid",
                notes="Masa krokisi ve parçalı tahsilat aktif kullanılıyor."
            ),
            RestaurantTenant(
                id=3,
                code="roast-brew",
                name="Roast & Brew Specialty Coffee",
                owner_name="Selin Aksoy",
                phone="0533 345 67 89",
                email="info@roastbrew.com",
                city="İstanbul",
                tax_number="9876543210",
                tax_office="Beşiktaş",
                address="Sinanpaşa Mah. Şair Nedim Cad. No:22",
                plan="starter",
                monthly_price=790.0,
                billing_cycle="monthly",
                status="active",
                renewal_date=datetime.utcnow() + timedelta(days=18),
                payment_method="bank_transfer",
                payment_status="paid",
                notes="QR menü ve tezgah hızlı satış."
            ),
            RestaurantTenant(
                id=4,
                code="etiler-steak",
                name="Etiler Steak & Lounge",
                owner_name="Cemil Demir",
                phone="0542 456 78 90",
                email="cemil@etilersteak.com",
                city="İstanbul",
                tax_number="5647382910",
                tax_office="Zincirlikuyu",
                address="Nisbetiye Cad. No:45 Etiler",
                plan="enterprise",
                monthly_price=2990.0,
                billing_cycle="monthly",
                status="active",
                renewal_date=datetime.utcnow() + timedelta(days=5),
                payment_method="credit_card",
                payment_status="paid",
                notes="GİB resmi e-Adisyon ve çoklu kasa."
            ),
            RestaurantTenant(
                id=5,
                code="alacati-bistro",
                name="Alaçatı Butik Kafe & Bistro",
                owner_name="Burak Özdemir",
                phone="0530 567 89 01",
                email="alacati@butikbistro.com",
                city="İzmir",
                tax_number="3456789012",
                tax_office="Çeşme",
                address="Hacımemiş Mah. 2012 Sok. No:8",
                plan="pro",
                monthly_price=1490.0,
                billing_cycle="monthly",
                status="trial",
                trial_ends_at=datetime.utcnow() + timedelta(days=9),
                renewal_date=datetime.utcnow() + timedelta(days=9),
                payment_method="credit_card",
                payment_status="pending",
                notes="14 günlük deneme sürümünde. Memnuniyet anketi gönderilecek."
            ),
            RestaurantTenant(
                id=6,
                code="bursa-iskender",
                name="Tarihi Bursa İskender Evi",
                owner_name="Fatih Çelik",
                phone="0544 678 90 12",
                email="bursaiskender@gmail.com",
                city="Bursa",
                tax_number="7890123456",
                tax_office="Osmangazi",
                address="Atatürk Cad. No:34",
                plan="starter",
                monthly_price=790.0,
                billing_cycle="monthly",
                status="suspended",
                renewal_date=datetime.utcnow() - timedelta(days=4),
                payment_method="credit_card",
                payment_status="overdue",
                notes="Kredi kartı limit yetersizliği nedeniyle askıya alındı. İletişime geçilecek."
            )
        ]
        db.add_all(demo_tenants)

        demo_leads = [
            TenantLead(
                full_name="Mehmet Taşkın",
                phone="0532 998 87 76",
                company_name="Boğaz Balık & Meze",
                business_type="restoran",
                city="İstanbul",
                status="yeni",
                notes="Web sitesinden 14 gün ücretsiz deneme formu doldurdu. Acil kurulum istiyor."
            ),
            TenantLead(
                full_name="Gizem Şahin",
                phone="0542 332 21 10",
                company_name="Chopstick Asya Mutfağı",
                business_type="fastfood",
                city="Ankara",
                status="arandi",
                notes="Görüşüldü, Yemeksepeti ve GetirYemek paket servis entegrasyonu hakkında bilgi verildi."
            ),
            TenantLead(
                full_name="Serdar Yurt",
                phone="0535 776 65 54",
                company_name="Sunset Beach Club & Lounge",
                business_type="otel",
                city="Antalya",
                status="demo_yapildi",
                notes="Online canlı demo yapıldı. Şezlong hesabı ve döviz tahsilatını çok beğendi. Fiyat teklifi bekliyor."
            )
        ]
        db.add_all(demo_leads)

        demo_invoices = [
            TenantInvoice(
                tenant_id=1,
                invoice_no="BON202610-0001",
                tenant_name="BonCore Restoran (Kadıköy Merkez)",
                period="Ekim 2026",
                amount=2990.0,
                plan="enterprise",
                status="paid",
                paid_at=datetime.utcnow() - timedelta(days=20)
            ),
            TenantInvoice(
                tenant_id=2,
                invoice_no="BON202610-0002",
                tenant_name="Moda Meyhane & Ocakbaşı",
                period="Ekim 2026",
                amount=1490.0,
                plan="pro",
                status="paid",
                paid_at=datetime.utcnow() - timedelta(days=18)
            ),
            TenantInvoice(
                tenant_id=3,
                invoice_no="BON202610-0003",
                tenant_name="Roast & Brew Specialty Coffee",
                period="Ekim 2026",
                amount=790.0,
                plan="starter",
                status="paid",
                paid_at=datetime.utcnow() - timedelta(days=12)
            ),
            TenantInvoice(
                tenant_id=4,
                invoice_no="BON202610-0004",
                tenant_name="Etiler Steak & Lounge",
                period="Ekim 2026",
                amount=2990.0,
                plan="enterprise",
                status="paid",
                paid_at=datetime.utcnow() - timedelta(days=25)
            ),
            TenantInvoice(
                tenant_id=6,
                invoice_no="BON202610-0005",
                tenant_name="Tarihi Bursa İskender Evi",
                period="Ekim 2026",
                amount=790.0,
                plan="starter",
                status="overdue",
                paid_at=None
            )
        ]
        db.add_all(demo_invoices)
        await db.commit()

    # Her demo restoranın en az bir yönetici ve personeli olduğundan emin ol
    demo_staff_defs = [
        (2, "Murat Yılmaz (Müdür)", "moda_admin", "123456", "2001", "manager"),
        (2, "Caner Demir (Kasiyer)", "moda_kasiyer", "123456", "2002", "cashier"),
        (2, "Ali Kaya (Garson)", "moda_garson", "123456", "2003", "waiter"),
        (3, "Selin Aksoy (Yönetici)", "roast_admin", "123456", "3001", "manager"),
        (3, "Ece Barista", "roast_barista", "123456", "3002", "cashier"),
        (4, "Cemil Demir (Müdür)", "etiler_admin", "123456", "4001", "manager"),
        (4, "Burak Şef", "etiler_chef", "123456", "4002", "chef"),
        (5, "Burak Özdemir (Yönetici)", "alacati_admin", "123456", "5001", "manager"),
        (6, "Fatih Çelik (Müdür)", "bursa_admin", "123456", "6001", "manager"),
    ]
    has_new_staff = False
    for t_id, s_name, s_uname, s_pwd, s_pin, s_role in demo_staff_defs:
        exist = await db.execute(select(StaffUser).where(StaffUser.restaurant_id == t_id, StaffUser.role == s_role))
        if not exist.scalar_one_or_none():
            p_check = await db.execute(select(StaffUser).where(StaffUser.pin_code == s_pin))
            effective_pin = s_pin if not p_check.scalar_one_or_none() else f"{t_id}{s_pin[:3]}"
            u_check = await db.execute(select(StaffUser).where(StaffUser.username == s_uname))
            effective_uname = s_uname if not u_check.scalar_one_or_none() else f"{s_uname}_{t_id}"
            new_s = StaffUser(
                name=s_name,
                username=effective_uname,
                password_hash=hash_password(s_pwd),
                pin_code=effective_pin,
                role=s_role,
                restaurant_id=t_id,
                is_active=True
            )
            db.add(new_s)
            has_new_staff = True

    if has_new_staff:
        await db.commit()
