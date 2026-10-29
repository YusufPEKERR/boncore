from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
from datetime import datetime
import json
import time

from app.database import get_db
from app.models.setting import RestaurantSetting
from app.models.product import Product, Category, Ingredient, Recipe
from app.models.order import Order, OrderItem
from app.models.payment import Payment
from app.models.cashier import CashExpense
from app.websocket_hub import ws_hub

router = APIRouter(prefix="/modules", tags=["Adisyo Advanced Modules"])

async def _load_json_setting(db: AsyncSession, key: str, default_val: Any) -> Any:
    res = await db.execute(select(RestaurantSetting).where(RestaurantSetting.key == key))
    row = res.scalars().first()
    if row and row.value:
        try:
            return json.loads(row.value)
        except Exception:
            pass
    new_row = RestaurantSetting(key=key, value=json.dumps(default_val, ensure_ascii=False))
    db.add(new_row)
    await db.commit()
    return default_val

async def _save_json_setting(db: AsyncSession, key: str, val: Any):
    res = await db.execute(select(RestaurantSetting).where(RestaurantSetting.key == key))
    row = res.scalars().first()
    str_val = json.dumps(val, ensure_ascii=False)
    if row:
        row.value = str_val
    else:
        db.add(RestaurantSetting(key=key, value=str_val))
    await db.commit()


# ============================================================================
# 1. MÜŞTERİ SADAKAT (CRM), CARİ HESAP (VERESİYE) & KAMPANYA MODÜLÜ
# ============================================================================
DEFAULT_CUSTOMERS = [
    {
        "id": "cust_1",
        "name": "Ahmet Yılmaz",
        "phone": "0532 411 22 33",
        "email": "ahmet.yilmaz@sirket.com",
        "tier": "VIP",
        "points": 1480,
        "balance": -1250.0,
        "total_spent": 18450.0,
        "visit_count": 24,
        "last_visit": "2026-10-28 19:40",
        "notes": "Pencere kenarı masa tercih eder, şekersiz Türk kahvesi ikramı."
    },
    {
        "id": "cust_2",
        "name": "Zeynep Kaya (Kaya Mimarlık)",
        "phone": "0544 892 10 20",
        "email": "zeynep@kayamimarlik.com",
        "tier": "Kurumsal",
        "points": 2920,
        "balance": -3400.0,
        "total_spent": 46200.0,
        "visit_count": 42,
        "last_visit": "2026-10-29 11:20",
        "notes": "Kurumsal öğle yemeği aboneliği, ay sonu fatura kesilir."
    },
    {
        "id": "cust_3",
        "name": "Mehmet Demir",
        "phone": "0505 677 88 99",
        "email": "mehmetdemir@gmail.com",
        "tier": "Gold",
        "points": 650,
        "balance": 0.0,
        "total_spent": 8120.0,
        "visit_count": 12,
        "last_visit": "2026-10-25 21:00",
        "notes": "Acısız tercih eder."
    }
]

DEFAULT_CAMPAIGNS = [
    {
        "id": "camp_1",
        "title": "%5 Para Puan Kazanımı",
        "type": "points_cashback",
        "rule": "Tüm masa ve paket siparişlerinde geçerli",
        "reward": "Adisyon tutarının %5'i kadar harcanabilir Para Puan",
        "is_active": True,
        "usage_count": 142
    },
    {
        "id": "camp_2",
        "title": "10 Siparişe 1 Tatlı / Kahve Hediye",
        "type": "visit_reward",
        "rule": "10. ziyaretini tamamlayan sadakat üyelerine",
        "reward": "Seçili tatlı veya kahve ücretsiz ikram edilir",
        "is_active": True,
        "usage_count": 38
    },
    {
        "id": "camp_3",
        "title": "VIP & Kurumsal %10 Otomatik İndirim",
        "type": "tier_discount",
        "rule": "VIP ve Kurumsal Cari kart sahiplerine",
        "reward": "Adisyonda otomatik %10 sadakat indirimi",
        "is_active": True,
        "usage_count": 64
    },
    {
        "id": "camp_4",
        "title": "Happy Hour (15:00 - 18:00) %15 İndirim",
        "type": "happy_hour",
        "rule": "Hafta içi 15:00 - 18:00 arası içecek ve tatlılarda",
        "reward": "%15 Anında Sepet İndirimi",
        "is_active": False,
        "usage_count": 19
    }
]

class CustomerCreateSchema(BaseModel):
    name: str
    phone: str
    email: Optional[str] = ""
    tier: Optional[str] = "Standart"
    points: Optional[int] = 100
    balance: Optional[float] = 0.0
    notes: Optional[str] = ""

class CustomerTransactionSchema(BaseModel):
    type: str  # pay_debt, add_debt, earn_points, redeem_points
    amount: Optional[float] = 0.0
    points: Optional[int] = 0
    note: Optional[str] = ""

@router.get("/customers")
async def get_customers_and_loyalty(db: AsyncSession = Depends(get_db)):
    customers = await _load_json_setting(db, "adisyo_crm_customers_v2", DEFAULT_CUSTOMERS)
    campaigns = await _load_json_setting(db, "adisyo_crm_campaigns_v2", DEFAULT_CAMPAIGNS)
    total_receivable = round(sum(abs(float(c.get("balance", 0))) for c in customers if float(c.get("balance", 0)) < 0), 2)
    total_points = sum(int(c.get("points", 0)) for c in customers)
    return {
        "customers": customers,
        "campaigns": campaigns,
        "summary": {
            "total_customers": len(customers),
            "total_loyalty_points": total_points,
            "total_credit_receivable": total_receivable,
            "active_campaigns": len([c for c in campaigns if c.get("is_active")])
        }
    }

@router.post("/customers")
async def create_customer(payload: CustomerCreateSchema, db: AsyncSession = Depends(get_db)):
    customers = await _load_json_setting(db, "adisyo_crm_customers_v2", DEFAULT_CUSTOMERS)
    new_cust = {
        "id": f"cust_{int(time.time() * 1000)}",
        "name": payload.name.strip(),
        "phone": payload.phone.strip(),
        "email": payload.email or "",
        "tier": payload.tier or "Standart",
        "points": payload.points if payload.points is not None else 100,
        "balance": float(payload.balance or 0.0),
        "total_spent": 0.0,
        "visit_count": 1,
        "last_visit": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "notes": payload.notes or ""
    }
    customers.insert(0, new_cust)
    await _save_json_setting(db, "adisyo_crm_customers_v2", customers)
    return {"success": True, "customer": new_cust}

@router.post("/customers/{customer_id}/transaction")
async def customer_transaction(customer_id: str, payload: CustomerTransactionSchema, db: AsyncSession = Depends(get_db)):
    customers = await _load_json_setting(db, "adisyo_crm_customers_v2", DEFAULT_CUSTOMERS)
    target = next((c for c in customers if str(c.get("id")) == str(customer_id)), None)
    if not target:
        raise HTTPException(status_code=404, detail="Müşteri bulunamadı.")

    amt = float(payload.amount or 0.0)
    pts = int(payload.points or round(amt))
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M")

    if payload.type in ("pay_debt", "payment"):
        target["balance"] = round(float(target.get("balance", 0.0)) + amt, 2)
        db.add(CashExpense(
            category="Cari Tahsilat",
            amount=amt,
            expense_type="in",
            description=f"{target['name']} - Cari Tahsilat ({payload.note or 'Nakit/Kart'})",
            created_by="Kasiyer",
            created_at=datetime.utcnow()
        ))
    elif payload.type in ("add_debt", "debit"):
        target["balance"] = round(float(target.get("balance", 0.0)) - amt, 2)
        target["total_spent"] = round(float(target.get("total_spent", 0.0)) + amt, 2)
        target["visit_count"] = int(target.get("visit_count", 0)) + 1
        target["last_visit"] = now_str
    elif payload.type in ("earn_points", "add_points"):
        target["points"] = int(target.get("points", 0)) + pts
    elif payload.type == "redeem_points":
        target["points"] = max(0, int(target.get("points", 0)) - pts)

    await _save_json_setting(db, "adisyo_crm_customers_v2", customers)
    return {"success": True, "customer": target}

@router.delete("/customers/{customer_id}")
async def delete_customer(customer_id: str, db: AsyncSession = Depends(get_db)):
    customers = await _load_json_setting(db, "adisyo_crm_customers_v2", DEFAULT_CUSTOMERS)
    customers = [c for c in customers if str(c.get("id")) != str(customer_id)]
    await _save_json_setting(db, "adisyo_crm_customers_v2", customers)
    return {"success": True}

@router.post("/campaigns/{campaign_id}/toggle")
async def toggle_campaign(campaign_id: str, db: AsyncSession = Depends(get_db)):
    campaigns = await _load_json_setting(db, "adisyo_crm_campaigns_v2", DEFAULT_CAMPAIGNS)
    for c in campaigns:
        if str(c.get("id")) == str(campaign_id):
            c["is_active"] = not c.get("is_active", False)
    await _save_json_setting(db, "adisyo_crm_campaigns_v2", campaigns)
    return {"success": True, "campaigns": campaigns}


# ============================================================================
# 2. REZERVASYON & MASA PLANLAMA MODÜLÜ
# ============================================================================
DEFAULT_RESERVATIONS = [
    {
        "id": "res_1",
        "guest_name": "Selim Soydan",
        "phone": "0532 600 11 22",
        "date": datetime.now().strftime("%Y-%m-%d"),
        "time": "19:30",
        "guests_count": 4,
        "table_name": "Bahçe 3",
        "status": "confirmed",
        "notes": "Evlilik yıldönümü, çiçekli masa hazırlığı.",
        "deposit": 500.0
    },
    {
        "id": "res_2",
        "guest_name": "Elif Şahin (Grup Yemeği)",
        "phone": "0542 333 44 55",
        "date": datetime.now().strftime("%Y-%m-%d"),
        "time": "20:00",
        "guests_count": 8,
        "table_name": "Salon 5",
        "status": "confirmed",
        "notes": "2 adet bebek sandalyesi istendi.",
        "deposit": 1000.0
    },
    {
        "id": "res_3",
        "guest_name": "Burak Özkan",
        "phone": "0533 777 88 00",
        "date": datetime.now().strftime("%Y-%m-%d"),
        "time": "13:30",
        "guests_count": 2,
        "table_name": "Teras 1",
        "status": "seated",
        "notes": "Pencere kenarı.",
        "deposit": 0.0
    }
]

class ReservationCreateSchema(BaseModel):
    guest_name: str
    phone: str
    date: str
    time: str
    guests_count: int = 2
    table_name: str
    notes: Optional[str] = ""
    deposit: Optional[float] = 0.0

class ReservationStatusSchema(BaseModel):
    status: str

@router.get("/reservations")
async def get_reservations(db: AsyncSession = Depends(get_db)):
    reservations = await _load_json_setting(db, "adisyo_reservations_v2", DEFAULT_RESERVATIONS)
    return {
        "reservations": reservations,
        "summary": {
            "total_reservations": len(reservations),
            "confirmed_count": len([r for r in reservations if r.get("status") == "confirmed"]),
            "seated_count": len([r for r in reservations if r.get("status") == "seated"]),
            "expected_guests": sum(int(r.get("guests_count", 0)) for r in reservations if r.get("status") in ["confirmed", "seated"])
        }
    }

@router.post("/reservations")
async def create_reservation(payload: ReservationCreateSchema, db: AsyncSession = Depends(get_db)):
    reservations = await _load_json_setting(db, "adisyo_reservations_v2", DEFAULT_RESERVATIONS)
    new_res = {
        "id": f"res_{int(time.time() * 1000)}",
        "guest_name": payload.guest_name.strip(),
        "phone": payload.phone.strip(),
        "date": payload.date,
        "time": payload.time,
        "guests_count": payload.guests_count,
        "table_name": payload.table_name,
        "status": "confirmed",
        "notes": payload.notes or "",
        "deposit": float(payload.deposit or 0.0)
    }
    reservations.insert(0, new_res)
    await _save_json_setting(db, "adisyo_reservations_v2", reservations)
    return {"success": True, "reservation": new_res}

@router.put("/reservations/{res_id}/status")
async def update_reservation_status(res_id: str, payload: ReservationStatusSchema, db: AsyncSession = Depends(get_db)):
    reservations = await _load_json_setting(db, "adisyo_reservations_v2", DEFAULT_RESERVATIONS)
    target = next((r for r in reservations if str(r.get("id")) == str(res_id)), None)
    if not target:
        raise HTTPException(status_code=404, detail="Rezervasyon bulunamadı.")
    target["status"] = payload.status
    await _save_json_setting(db, "adisyo_reservations_v2", reservations)
    return {"success": True, "reservation": target}

@router.delete("/reservations/{res_id}")
async def delete_reservation(res_id: str, db: AsyncSession = Depends(get_db)):
    reservations = await _load_json_setting(db, "adisyo_reservations_v2", DEFAULT_RESERVATIONS)
    reservations = [r for r in reservations if str(r.get("id")) != str(res_id)]
    await _save_json_setting(db, "adisyo_reservations_v2", reservations)
    return {"success": True}


# ============================================================================
# 3. MALİYET & KÂRLILIK ANALİZİ VE RAPOR SİHİRBAZI MODÜLÜ
# ============================================================================
@router.get("/cost-profit")
async def get_cost_and_profit_analysis(db: AsyncSession = Depends(get_db)):
    cats_res = await db.execute(select(Category))
    cat_map = {c.id: c.name for c in cats_res.scalars().all()}

    prods_res = await db.execute(select(Product))
    products = prods_res.scalars().all()

    ing_res = await db.execute(select(Ingredient))
    ing_map = {i.id: float(i.cost_per_unit or 0.0) for i in ing_res.scalars().all()}

    rec_res = await db.execute(select(Recipe))
    prod_recipe_cost: Dict[int, float] = {}
    for r in rec_res.scalars().all():
        c_val = float(r.amount or 0.0) * ing_map.get(r.ingredient_id, 0.0)
        prod_recipe_cost[r.product_id] = prod_recipe_cost.get(r.product_id, 0.0) + c_val

    items_res = await db.execute(select(OrderItem).where(OrderItem.is_voided == False))
    sales_by_name: Dict[str, Dict[str, float]] = {}
    for it in items_res.scalars().all():
        pname = it.product_name
        if pname not in sales_by_name:
            sales_by_name[pname] = {"qty": 0.0, "rev": 0.0}
        sales_by_name[pname]["qty"] += float(it.quantity or 1.0)
        sales_by_name[pname]["rev"] += float(it.total_price or 0.0)

    exp_res = await db.execute(select(CashExpense).where(CashExpense.expense_type == "out"))
    total_expenses = round(sum(float(e.amount or 0.0) for e in exp_res.scalars().all()), 2)

    items_analysis = []
    total_revenue = 0.0
    total_cogs = 0.0

    for p in products:
        unit_price = float(p.base_price or 0.0)
        if unit_price <= 0:
            continue
        unit_cost = prod_recipe_cost.get(p.id, 0.0)
        has_recipe = unit_cost > 0
        if unit_cost <= 0 or unit_cost >= unit_price:
            unit_cost = round(unit_price * 0.35, 2)
        else:
            unit_cost = round(unit_cost, 2)

        unit_profit = round(unit_price - unit_cost, 2)
        margin_pct = round((unit_profit / unit_price) * 100, 1) if unit_price > 0 else 0.0

        s_info = sales_by_name.get(p.name, {"qty": 0.0, "rev": 0.0})
        sold_qty = round(s_info["qty"], 2)
        tot_rev = round(max(s_info["rev"], sold_qty * unit_price), 2)
        tot_cost = round(sold_qty * unit_cost, 2)
        tot_prof = round(tot_rev - tot_cost, 2)

        total_revenue += tot_rev
        total_cogs += tot_cost

        items_analysis.append({
            "id": p.id,
            "name": p.name,
            "category": cat_map.get(p.category_id, "Genel"),
            "unit_price": unit_price,
            "unit_cost": unit_cost,
            "unit_profit": unit_profit,
            "margin_percent": margin_pct,
            "has_recipe": has_recipe,
            "sold_qty": sold_qty,
            "total_revenue": tot_rev,
            "total_cost": tot_cost,
            "total_profit": tot_prof
        })

    items_analysis.sort(key=lambda x: (x["total_profit"], x["margin_percent"]), reverse=True)

    gross_profit = round(total_revenue - total_cogs, 2)
    gross_margin_pct = round((gross_profit / total_revenue) * 100, 1) if total_revenue > 0 else 65.0
    net_profit = round(gross_profit - total_expenses, 2)
    net_margin_pct = round((net_profit / total_revenue) * 100, 1) if total_revenue > 0 else 58.0

    return {
        "summary": {
            "total_revenue": round(total_revenue, 2),
            "total_cogs": round(total_cogs, 2),
            "gross_profit": gross_profit,
            "gross_margin_percent": gross_margin_pct,
            "total_expenses": total_expenses,
            "net_profit": net_profit,
            "net_margin_percent": net_margin_pct,
            "analyzed_products_count": len(items_analysis)
        },
        "products": items_analysis[:150]
    }


# ============================================================================
# 4. OTEL (PMS / ODA FOLYO HESABI) MODÜLÜ
# ============================================================================
DEFAULT_HOTEL_ROOMS = [
    {
        "room_no": "101",
        "guest_name": "Mr. & Mrs. Henderson",
        "package": "Oda Kahvaltı (BB)",
        "check_in": "2026-10-27",
        "check_out": "2026-11-01",
        "status": "checked_in",
        "folio_balance": 1450.0,
        "charges": [
            {"id": "ch_1", "date": "2026-10-28 20:15", "desc": "Adisyon #1038 - Akşam Yemeği", "amount": 1450.0}
        ]
    },
    {
        "room_no": "204",
        "guest_name": "Kaan & Pelin Yıldırım",
        "package": "Yarım Pansiyon (HB)",
        "check_in": "2026-10-28",
        "check_out": "2026-10-31",
        "status": "checked_in",
        "folio_balance": 680.0,
        "charges": [
            {"id": "ch_2", "date": "2026-10-29 11:00", "desc": "Teras Bar - İçecek & Tatlı", "amount": 680.0}
        ]
    },
    {
        "room_no": "305",
        "guest_name": "Dr. Emre Karahan",
        "package": "Tam Pansiyon (FB)",
        "check_in": "2026-10-29",
        "check_out": "2026-11-02",
        "status": "checked_in",
        "folio_balance": 0.0,
        "charges": []
    },
    {
        "room_no": "402",
        "guest_name": "Elena Rostova",
        "package": "Her Şey Dahil (AI)",
        "check_in": "2026-10-26",
        "check_out": "2026-11-03",
        "status": "checked_in",
        "folio_balance": 920.0,
        "charges": [
            {"id": "ch_3", "date": "2026-10-28 22:30", "desc": "Oda Servisi - Özel Sipariş", "amount": 920.0}
        ]
    }
]

class HotelChargeSchema(BaseModel):
    room_no: str
    amount: float
    description: Optional[str] = "Restoran Adisyon Harcaması"
    order_id: Optional[int] = None

@router.get("/hotel")
async def get_hotel_folios(db: AsyncSession = Depends(get_db)):
    folios = await _load_json_setting(db, "adisyo_hotel_folios_v2", DEFAULT_HOTEL_ROOMS)
    total_bal = round(sum(float(r.get("folio_balance", 0)) for r in folios), 2)
    return {
        "folios": folios,
        "summary": {
            "active_rooms": len(folios),
            "total_folio_balance": total_bal
        }
    }

@router.post("/hotel/charge")
async def add_hotel_room_charge(payload: HotelChargeSchema, db: AsyncSession = Depends(get_db)):
    folios = await _load_json_setting(db, "adisyo_hotel_folios_v2", DEFAULT_HOTEL_ROOMS)
    room = next((r for r in folios if str(r.get("room_no")) == str(payload.room_no)), None)
    if not room:
        raise HTTPException(status_code=404, detail="Oda bulunamadı.")
    room["folio_balance"] = round(float(room.get("folio_balance", 0)) + payload.amount, 2)
    room.setdefault("charges", []).insert(0, {
        "id": f"ch_{int(time.time() * 1000)}",
        "date": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "desc": payload.description or "Restoran Adisyon Harcaması",
        "amount": payload.amount
    })
    await _save_json_setting(db, "adisyo_hotel_folios_v2", folios)
    return {"success": True, "room": room}

@router.post("/hotel/{room_no}/settle")
async def settle_hotel_room_folio(room_no: str, db: AsyncSession = Depends(get_db)):
    folios = await _load_json_setting(db, "adisyo_hotel_folios_v2", DEFAULT_HOTEL_ROOMS)
    room = next((r for r in folios if str(r.get("room_no")) == str(room_no)), None)
    if not room:
        raise HTTPException(status_code=404, detail="Oda bulunamadı.")
    paid = float(room.get("folio_balance", 0))
    room["folio_balance"] = 0.0
    room.setdefault("charges", []).insert(0, {
        "id": f"ch_{int(time.time() * 1000)}",
        "date": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "desc": f"Resepsiyon Folyo Tahsilatı (-₺{paid:.2f})",
        "amount": 0.0
    })
    await _save_json_setting(db, "adisyo_hotel_folios_v2", folios)
    return {"success": True, "room": room}


# ============================================================================
# 5. SELF-SERVİS KİOSK & MÜŞTERİ ÇAĞRI EKRANI (CFD) MODÜLÜ
# ============================================================================
class KioskOrderItemInput(BaseModel):
    product_id: int
    quantity: float = 1.0
    notes: Optional[str] = ""

class KioskOrderCreateSchema(BaseModel):
    customer_name: Optional[str] = "Kiosk Misafiri"
    order_type: str = "dine_in"
    payment_method: str = "credit_card"
    items: List[KioskOrderItemInput]

@router.post("/kiosk-order")
async def create_kiosk_self_order(payload: KioskOrderCreateSchema, db: AsyncSession = Depends(get_db)):
    if not payload.items:
        raise HTTPException(status_code=400, detail="Sepet boş.")

    prod_ids = [i.product_id for i in payload.items]
    prods_res = await db.execute(select(Product).where(Product.id.in_(prod_ids)))
    prod_map = {p.id: p for p in prods_res.scalars().all()}

    subtotal = 0.0
    resolved_items = []
    for it in payload.items:
        p = prod_map.get(it.product_id)
        u_price = float(p.base_price if p else 100.0)
        p_name = p.name if p else f"Ürün #{it.product_id}"
        line_tot = round(u_price * float(it.quantity), 2)
        subtotal += line_tot
        resolved_items.append((it.product_id, p_name, float(it.quantity), u_price, line_tot))

    subtotal = round(subtotal, 2)
    queue_num = f"#K-{int(time.time()) % 900 + 100}"

    new_order = Order(
        order_no=f"KSK-{int(time.time())}",
        table_id=None,
        order_type="takeaway" if payload.order_type == "takeaway" else "dine_in",
        status="paid",
        waiter_name=f"KİOSK ({queue_num})",
        notes=f"Kiosk Sıra No: {queue_num} - {payload.customer_name}",
        kuver_count=0,
        kuver_total=0.0,
        subtotal=subtotal,
        grand_total=subtotal,
        paid_total=subtotal,
        remaining_total=0.0,
        created_at=datetime.utcnow()
    )
    db.add(new_order)
    await db.flush()

    for (pid, pname, qty, uprice, ltot) in resolved_items:
        db.add(OrderItem(
            order_id=new_order.id,
            product_id=pid,
            product_name=pname,
            quantity=qty,
            unit_price=uprice,
            total_price=ltot,
            station="kitchen",
            status="preparing",
            created_at=datetime.utcnow()
        ))

    db.add(Payment(
        order_id=new_order.id,
        amount=subtotal,
        payment_method=payload.payment_method,
        cashier_name="Self-Servis Kiosk",
        receipt_no=f"KSK-{queue_num}",
        created_at=datetime.utcnow()
    ))

    await db.commit()

    await ws_hub.broadcast_all("ORDER_CREATED", {
        "order_id": new_order.id,
        "queue_number": queue_num,
        "source": "kiosk"
    })

    return {
        "success": True,
        "order_id": new_order.id,
        "queue_number": queue_num,
        "total_amount": subtotal
    }
