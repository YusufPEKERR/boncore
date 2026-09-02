from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import Dict, Any
import json
from app.database import get_db
from app.models.setting import RestaurantSetting
from app.websocket_hub import ws_hub

router = APIRouter(prefix="/settings", tags=["Settings & Definitions"])

DEFAULT_SETTINGS: Dict[str, Any] = {
    "is_kuver_enabled": True,
    "kuver_price": 35.0,
    "kuver_title": "Kuver / Kişi Başı Hizmet",
    "auto_kuver_on_table_open": True,
    "is_service_charge_enabled": False,
    "service_charge_rate": 10.0,
    "service_charge_type": "percent",
    "service_charge_title": "Garsoniye / Servis Bedeli",
    "default_vat_rate": 10,
    "food_vat_rate": 10,
    "alcohol_vat_rate": 20,
    "beverage_vat_rate": 10,
    "prices_include_vat": True,
    "restaurant_name": "FATİH ÇİFTLİĞİ RESTORAN",
    "tax_office": "Kadıköy Vergi Dairesi",
    "tax_number": "3779901422",
    "city": "İstanbul",
    "district": "Kadıköy",
    "street": "Moda Cad. No:84 D:4",
    "phone": "+90 216 444 37 79",
    "usd_rate": 36.5,
    "eur_rate": 38.2,
    "gbp_rate": 45.8,
    "discounts": [
        {"id": 1, "name": "%10 Misafir Sadakat İndirimi", "type": "percent", "value": 10, "is_active": True, "requires_auth": False},
        {"id": 2, "name": "%15 Personel İndirimi", "type": "percent", "value": 15, "is_active": True, "requires_auth": False},
        {"id": 3, "name": "%20 VIP Müşteri İndirimi", "type": "percent", "value": 20, "is_active": True, "requires_auth": True},
        {"id": 4, "name": "%50 Yönetici / İkram İndirimi", "type": "percent", "value": 50, "is_active": True, "requires_auth": True},
        {"id": 5, "name": "₺50 Sabit İndirim", "type": "fixed", "value": 50, "is_active": True, "requires_auth": False}
    ],
    "payment_methods": [
        {"id": "cash", "name": "Nakit Türk Lirası (TRY)", "icon": "💵", "desc": "Kasada anlık nakit tahsilat", "is_active": True},
        {"id": "credit_card", "name": "Kredi Kartı / Banka Kartı", "icon": "💳", "desc": "Fiziki POS ve temassız çekim", "is_active": True},
        {"id": "sodexo", "name": "Sodexo Yemek Çeki", "icon": "🍱", "desc": "Yemek kartı entegrasyonu", "is_active": True},
        {"id": "multinet", "name": "Multinet", "icon": "💳", "desc": "Multinet kart ve karekod", "is_active": True},
        {"id": "ticket", "name": "Ticket Edenred", "icon": "🎫", "desc": "Edenred yemek kartı", "is_active": True},
        {"id": "open_account", "name": "Açık Hesap / Veresiye", "icon": "📋", "desc": "Cari müşteri borçlandırma", "is_active": True}
    ]
}

@router.get("/")
async def get_settings(db: AsyncSession = Depends(get_db)):
    """
    Returns all restaurant settings and parameters from the database.
    """
    result = await db.execute(select(RestaurantSetting))
    db_settings = result.scalars().all()

    output = dict(DEFAULT_SETTINGS)
    for s in db_settings:
        try:
            output[s.key] = json.loads(s.value)
        except Exception:
            output[s.key] = s.value

    return output

@router.put("/")
async def update_settings(payload: Dict[str, Any], db: AsyncSession = Depends(get_db)):
    """
    Saves and updates restaurant settings into the database.
    """
    for key, value in payload.items():
        stmt = select(RestaurantSetting).where(RestaurantSetting.key == key)
        result = await db.execute(stmt)
        existing = result.scalar_one_or_none()

        str_val = json.dumps(value, ensure_ascii=False)
        if existing:
            existing.value = str_val
        else:
            new_s = RestaurantSetting(key=key, value=str_val)
            db.add(new_s)

    # If Kuver was disabled or changed, update all currently open table orders immediately
    from app.models.order import Order
    is_kuver = payload.get("is_kuver_enabled", True)
    kuver_price = float(payload.get("kuver_price", 35.0))

    open_orders_res = await db.execute(select(Order).where(Order.status.in_(["open", "bill_requested"])))
    for ord in open_orders_res.scalars().all():
        if not is_kuver:
            ord.kuver_total = 0.0
        else:
            ord.kuver_total = (ord.kuver_count or 1) * kuver_price
        ord.grand_total = max(0.0, ord.subtotal - ord.discount_amount - ord.treat_amount + ord.kuver_total)
        ord.remaining_total = max(0.0, ord.grand_total - ord.paid_total)

    await db.commit()
    await ws_hub.broadcast_all("SETTINGS_UPDATED", payload)
    await ws_hub.broadcast_all("ORDER_UPDATED", {})
    return {"status": "success", "message": "Ayarlar veritabanına başarıyla kaydedildi."}
