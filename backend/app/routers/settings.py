from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, update
from typing import Dict, Any, List
import json
import re
from app.database import get_db
from app.models.setting import RestaurantSetting
from app.models.product import Product
from app.models.order import Order, OrderItem
from app.websocket_hub import ws_hub

router = APIRouter(prefix="/settings", tags=["Settings & Definitions"])

DEFAULT_KITCHEN_GROUPS: List[Dict[str, Any]] = [
    {
        "id": "kitchen",
        "name": "Mutfak",
        "description": "Ana sıcak mutfak, kahvaltı ve yemek hazırlama istasyonu",
        "icon": "utensils",
        "color": "red",
        "printer_name": "Mutfak Yazıcısı",
        "target_prep_minutes": 15,
        "sound_alert": True,
        "auto_print": True,
        "is_active": True,
        "display_order": 0,
    },
    {
        "id": "grill",
        "name": "Izgara",
        "description": "Izgara, kebap, mangal ve et ürünleri istasyonu",
        "icon": "flame",
        "color": "amber",
        "printer_name": "Izgara Yazıcısı",
        "target_prep_minutes": 20,
        "sound_alert": True,
        "auto_print": True,
        "is_active": True,
        "display_order": 1,
    },
    {
        "id": "bar",
        "name": "Bar",
        "description": "Soğuk ve sıcak içecekler, kahve ve bar istasyonu",
        "icon": "wine",
        "color": "blue",
        "printer_name": "Bar Yazıcısı",
        "target_prep_minutes": 5,
        "sound_alert": True,
        "auto_print": True,
        "is_active": True,
        "display_order": 2,
    },
    {
        "id": "pastry",
        "name": "Tatlı",
        "description": "Tatlı, pasta, dondurma ve fırın ürünleri istasyonu",
        "icon": "cake",
        "color": "purple",
        "printer_name": "Tatlı / Fırın Yazıcısı",
        "target_prep_minutes": 10,
        "sound_alert": True,
        "auto_print": False,
        "is_active": True,
        "display_order": 3,
    },
]

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
    ],
    "kitchen_groups": DEFAULT_KITCHEN_GROUPS,
    "receipt_design": {
        "header_title": "BONCORE RESTORAN",
        "header_sub": "Lezzet & Keyif Noktası",
        "show_logo": True,
        "paper_width": "80mm",
        "font_size": "medium",
        "show_order_no": True,
        "show_table_name": True,
        "show_waiter_name": True,
        "show_date_time": True,
        "show_vat_breakdown": True,
        "show_payment_details": True,
        "show_qr_code": True,
        "show_address_phone": True,
        "footer_message": "TEŞEKKÜR EDERİZ • AFİYET OLSUN!",
        "footer_sub": "Mali değeri yoktur, bilgi fişidir.",
        "wifi_name": "BonCore_Misafir",
        "wifi_password": "afiyetolsun",
        "instagram": "@boncore_restoran",
        "custom_note": ""
    },
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


@router.get("/time")
async def get_current_system_time():
    """
    Returns live system time, local Turkey date, day name, and timezone.
    """
    from app.services.time_service import get_live_time_info
    return get_live_time_info()


async def _load_raw_kitchen_groups(db: AsyncSession) -> List[Dict[str, Any]]:
    stmt = select(RestaurantSetting).where(RestaurantSetting.key == "kitchen_groups")
    res = await db.execute(stmt)
    setting = res.scalar_one_or_none()
    if setting and setting.value:
        try:
            parsed = json.loads(setting.value)
            if isinstance(parsed, list) and len(parsed) > 0:
                return sorted(parsed, key=lambda g: int(g.get("display_order", 0)))
        except Exception:
            pass
    return [dict(g) for g in DEFAULT_KITCHEN_GROUPS]


async def _save_raw_kitchen_groups(db: AsyncSession, groups: List[Dict[str, Any]]) -> None:
    for idx, g in enumerate(groups):
        g["display_order"] = idx
    stmt = select(RestaurantSetting).where(RestaurantSetting.key == "kitchen_groups")
    res = await db.execute(stmt)
    existing = res.scalar_one_or_none()
    str_val = json.dumps(groups, ensure_ascii=False)
    if existing:
        existing.value = str_val
    else:
        db.add(RestaurantSetting(key="kitchen_groups", value=str_val))
    await db.commit()
    await ws_hub.broadcast_all("KITCHEN_GROUPS_UPDATED", {"kitchen_groups": groups})


def _slugify_station_id(name: str) -> str:
    tr_map = str.maketrans("çğıöşüÇĞİÖŞÜ ", "cgiosuCGIOSU_")
    cleaned = name.translate(tr_map).lower()
    cleaned = re.sub(r"[^a-z0-9_]", "", cleaned)
    cleaned = re.sub(r"_+", "_", cleaned).strip("_")
    return cleaned or "station"


@router.get("/kitchen-groups")
async def get_kitchen_groups(db: AsyncSession = Depends(get_db)):
    """
    Returns all defined KDS kitchen groups/stations with product counts and active KDS item counts.
    """
    groups = await _load_raw_kitchen_groups(db)

    # Count products per station
    prod_stmt = select(Product.station, func.count(Product.id)).group_by(Product.station)
    prod_res = await db.execute(prod_stmt)
    prod_counts = { (row[0] or "kitchen"): int(row[1] or 0) for row in prod_res.all() }

    # Count active KDS items per station
    kds_stmt = (
        select(OrderItem.station, func.count(OrderItem.id))
        .join(Order, OrderItem.order_id == Order.id)
        .where(
            Order.status.in_(["open", "bill_requested"]),
            OrderItem.is_voided == False,
            OrderItem.is_hold == False,
            OrderItem.status.in_(["pending", "preparing"]),
        )
        .group_by(OrderItem.station)
    )
    kds_res = await db.execute(kds_stmt)
    kds_counts = { (row[0] or "kitchen"): int(row[1] or 0) for row in kds_res.all() }

    enriched = []
    for idx, g in enumerate(groups):
        gid = g.get("id", "kitchen")
        enriched.append({
            **g,
            "display_order": int(g.get("display_order", idx)),
            "product_count": prod_counts.get(gid, 0),
            "active_kds_count": kds_counts.get(gid, 0),
        })
    return enriched


@router.post("/kitchen-groups")
async def create_kitchen_group(payload: Dict[str, Any], db: AsyncSession = Depends(get_db)):
    """
    Creates a new KDS kitchen group / station.
    """
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Mutfak grubu adı boş olamaz.")

    groups = await _load_raw_kitchen_groups(db)
    raw_id = (payload.get("id") or "").strip()
    station_id = _slugify_station_id(raw_id if raw_id else name)

    existing_ids = {g.get("id") for g in groups}
    if station_id in existing_ids or station_id == "all":
        suffix = 2
        while f"{station_id}_{suffix}" in existing_ids:
            suffix += 1
        station_id = f"{station_id}_{suffix}"

    new_group = {
        "id": station_id,
        "name": name,
        "description": (payload.get("description") or "").strip(),
        "icon": payload.get("icon") or "utensils",
        "color": payload.get("color") or "red",
        "printer_name": (payload.get("printer_name") or "").strip(),
        "target_prep_minutes": int(payload.get("target_prep_minutes") or 15),
        "sound_alert": bool(payload.get("sound_alert", True)),
        "auto_print": bool(payload.get("auto_print", True)),
        "is_active": bool(payload.get("is_active", True)),
        "display_order": len(groups),
    }
    groups.append(new_group)
    await _save_raw_kitchen_groups(db, groups)
    return {"status": "success", "group": new_group, "kitchen_groups": groups}


@router.put("/kitchen-groups-reorder")
async def reorder_kitchen_groups(payload: Dict[str, Any], db: AsyncSession = Depends(get_db)):
    """
    Reorders kitchen groups according to ordered_ids list.
    """
    ordered_ids: List[str] = payload.get("ordered_ids") or []
    groups = await _load_raw_kitchen_groups(db)
    group_map = {g.get("id"): g for g in groups}

    new_groups: List[Dict[str, Any]] = []
    for gid in ordered_ids:
        if gid in group_map:
            new_groups.append(group_map.pop(gid))
    for remaining in groups:
        if remaining.get("id") in group_map:
            new_groups.append(remaining)

    await _save_raw_kitchen_groups(db, new_groups)
    return {"status": "success", "kitchen_groups": new_groups}


@router.put("/kitchen-groups/{group_id}")
async def update_kitchen_group(group_id: str, payload: Dict[str, Any], db: AsyncSession = Depends(get_db)):
    """
    Updates an existing KDS kitchen group / station.
    """
    groups = await _load_raw_kitchen_groups(db)
    target = None
    for g in groups:
        if g.get("id") == group_id:
            target = g
            break

    if not target:
        raise HTTPException(status_code=404, detail="Mutfak grubu bulunamadı.")

    if "name" in payload and str(payload["name"]).strip():
        target["name"] = str(payload["name"]).strip()
    if "description" in payload:
        target["description"] = str(payload["description"] or "").strip()
    if "icon" in payload:
        target["icon"] = str(payload["icon"] or "utensils")
    if "color" in payload:
        target["color"] = str(payload["color"] or "red")
    if "printer_name" in payload:
        target["printer_name"] = str(payload["printer_name"] or "").strip()
    if "target_prep_minutes" in payload:
        target["target_prep_minutes"] = max(1, int(payload["target_prep_minutes"] or 15))
    if "sound_alert" in payload:
        target["sound_alert"] = bool(payload["sound_alert"])
    if "auto_print" in payload:
        target["auto_print"] = bool(payload["auto_print"])
    if "is_active" in payload:
        target["is_active"] = bool(payload["is_active"])

    await _save_raw_kitchen_groups(db, groups)
    return {"status": "success", "group": target, "kitchen_groups": groups}


@router.delete("/kitchen-groups/{group_id}")
async def delete_kitchen_group(group_id: str, db: AsyncSession = Depends(get_db)):
    """
    Deletes a KDS kitchen group and reassigns its products to the fallback kitchen group.
    """
    groups = await _load_raw_kitchen_groups(db)
    if len(groups) <= 1:
        raise HTTPException(status_code=400, detail="Sistemde en az 1 mutfak grubu bulunmalıdır.")

    remaining = [g for g in groups if g.get("id") != group_id]
    if len(remaining) == len(groups):
        raise HTTPException(status_code=404, detail="Silinecek mutfak grubu bulunamadı.")

    fallback_id = remaining[0].get("id", "kitchen")
    await db.execute(
        update(Product).where(Product.station == group_id).values(station=fallback_id)
    )
    await _save_raw_kitchen_groups(db, remaining)
    return {
        "status": "success",
        "fallback_station": fallback_id,
        "kitchen_groups": remaining,
    }


@router.post("/kitchen-groups/{group_id}/assign-categories")
async def assign_categories_to_kitchen_group(group_id: str, payload: Dict[str, Any], db: AsyncSession = Depends(get_db)):
    """
    Syncs products assigned to this kitchen group (adds selected products/categories and removes unchecked ones).
    """
    groups = await _load_raw_kitchen_groups(db)
    if not any(g.get("id") == group_id for g in groups):
        raise HTTPException(status_code=404, detail="Mutfak grubu bulunamadı.")

    # Normalize any legacy NULL or empty station to 'kitchen' first so unassigning from 'kitchen' works cleanly
    await db.execute(
        update(Product).where((Product.station == None) | (Product.station == "")).values(station="kitchen")
    )

    unassign_category_ids = payload.get("unassign_category_ids")
    if unassign_category_ids is not None:
        res = await db.execute(
            update(Product)
            .where(Product.station == group_id, Product.category_id.in_(unassign_category_ids))
            .values(station="unassigned")
        )
        await db.commit()
        await ws_hub.broadcast_all("MENU_UPDATED", {"station": group_id})
        await ws_hub.broadcast_all("KITCHEN_GROUPS_UPDATED", {})
        return {"status": "success", "updated_count": res.rowcount or 0}

    category_ids = payload.get("category_ids") or []
    has_product_ids = "product_ids" in payload
    product_ids = [int(pid) for pid in (payload.get("product_ids") or [])]

    updated_count = 0
    if has_product_ids:
        # Remove products that were in this group_id but are no longer in product_ids
        if len(product_ids) > 0:
            unassign_res = await db.execute(
                update(Product)
                .where(Product.station == group_id, ~Product.id.in_(product_ids))
                .values(station="unassigned")
            )
            updated_count += unassign_res.rowcount or 0

            assign_res = await db.execute(
                update(Product)
                .where(Product.id.in_(product_ids))
                .values(station=group_id)
            )
            updated_count += assign_res.rowcount or 0
        else:
            # All products were unchecked -> unassign all products from this group_id
            unassign_res = await db.execute(
                update(Product)
                .where(Product.station == group_id)
                .values(station="unassigned")
            )
            updated_count += unassign_res.rowcount or 0
    elif category_ids:
        res = await db.execute(
            update(Product).where(Product.category_id.in_(category_ids)).values(station=group_id)
        )
        updated_count += res.rowcount or 0

    await db.commit()
    await ws_hub.broadcast_all("MENU_UPDATED", {"station": group_id})
    await ws_hub.broadcast_all("KITCHEN_GROUPS_UPDATED", {})
    return {"status": "success", "updated_count": updated_count, "assigned_count": len(product_ids)}
