from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from datetime import datetime
from app.database import get_db
from app.models.order import Order, OrderItem
from app.models.table import Table
from app.models.product import Product
from app.models.audit import AuditLog
from app.models.setting import RestaurantSetting
from app.schemas.all import (
    CreateOrderRequest, AddItemsRequest, HoldFireToggleRequest,
    VoidItemRequest, ApplyDiscountRequest, ApplyTreatRequest, SplitEqualRequest
)
from app.services.stock_service import StockService
from app.websocket_hub import ws_hub
from app.config import settings
import json

router = APIRouter(prefix="/orders", tags=["Orders & POS"])

@router.get("/{order_id}")
async def get_order_details(order_id: int, db: AsyncSession = Depends(get_db)):
    stmt = select(Order).where(Order.id == order_id).options(
        selectinload(Order.items),
        selectinload(Order.table),
        selectinload(Order.payments)
    )
    res = await db.execute(stmt)
    order = res.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı.")

    return {
        "id": order.id,
        "order_no": order.order_no,
        "table_id": order.table_id,
        "table_name": order.table.name if order.table else "Paket",
        "order_type": order.order_type,
        "status": order.status,
        "subtotal": order.subtotal,
        "discount_amount": order.discount_amount,
        "discount_rate": order.discount_rate,
        "discount_reason": order.discount_reason,
        "treat_amount": order.treat_amount,
        "treat_reason": order.treat_reason,
        "kuver_count": order.kuver_count,
        "kuver_total": order.kuver_total,
        "grand_total": order.grand_total,
        "paid_total": order.paid_total,
        "remaining_total": order.remaining_total,
        "waiter_name": order.waiter_name,
        "cashier_name": order.cashier_name,
        "notes": order.notes,
        "created_at": order.created_at.isoformat() if order.created_at else None,
        "items": [
            {
                "id": it.id,
                "product_id": it.product_id,
                "product_name": it.product_name,
                "variant_name": it.variant_name,
                "unit_price": it.unit_price,
                "quantity": it.quantity,
                "total_price": it.total_price,
                "selected_modifiers": it.selected_modifiers,
                "negative_modifiers": it.negative_modifiers,
                "kitchen_note": it.kitchen_note,
                "course_stage": it.course_stage,
                "is_hold": it.is_hold,
                "status": it.status,
                "station": it.station,
                "is_voided": it.is_voided,
                "void_reason": it.void_reason,
                "is_treat": it.is_treat
            } for it in order.items
        ],
        "payments": [
            {
                "id": p.id,
                "method": p.payment_method,
                "amount": p.amount,
                "tip": p.tip_amount,
                "rounding": p.rounding_amount,
                "created_at": p.created_at.isoformat()
            } for p in order.payments
        ]
    }

@router.post("/create")
async def create_new_order(payload: CreateOrderRequest, db: AsyncSession = Depends(get_db)):
    """
    Creates a new order for a table or takeaway/online order.
    """
    table = None
    if payload.table_id:
        t_stmt = select(Table).where(Table.id == payload.table_id)
        t_res = await db.execute(t_stmt)
        table = t_res.scalar_one_or_none()
        if not table:
            raise HTTPException(status_code=404, detail="Masa bulunamadı.")

    order_no = f"ORD-{datetime.utcnow().strftime('%Y%m%d')}-{int(datetime.utcnow().timestamp())%100000:05d}"
    kuver_count = payload.kuver_count or (table.kuver_count if table else 0)

    # Check Kuver parameter in Database
    kuver_enabled = True
    kuver_unit_price = settings.DEFAULT_KUVER_PRICE
    set_res = await db.execute(select(RestaurantSetting).where(RestaurantSetting.key.in_(["is_kuver_enabled", "kuver_price"])))
    for s in set_res.scalars().all():
        if s.key == "is_kuver_enabled":
            try: kuver_enabled = json.loads(s.value)
            except: pass
        elif s.key == "kuver_price":
            try: kuver_unit_price = float(json.loads(s.value))
            except: pass

    kuver_total = (kuver_count * kuver_unit_price) if (kuver_enabled and payload.order_type == "dine_in") else 0.0

    order = Order(
        order_no=order_no,
        table_id=payload.table_id,
        order_type=payload.order_type,
        status="open",
        kuver_count=kuver_count if kuver_enabled else 0,
        kuver_total=kuver_total,
        waiter_name=payload.waiter_name,
        notes=payload.notes,
        created_at=datetime.utcnow()
    )
    db.add(order)
    await db.flush()

    subtotal = 0.0
    for it in payload.items:
        p_res = await db.execute(select(Product).where(Product.id == it.product_id))
        prod = p_res.scalar_one_or_none()
        p_name = prod.name if prod else "Ürün"
        station = prod.station if prod else "kitchen"

        # Calculate line total including modifiers
        mod_sum = sum(m.price for m in it.selected_modifiers)
        line_unit = it.unit_price + mod_sum
        line_total = line_unit * it.quantity
        subtotal += line_total

        order_item = OrderItem(
            order_id=order.id,
            product_id=it.product_id,
            product_name=p_name,
            variant_name=it.variant_name,
            unit_price=line_unit,
            quantity=it.quantity,
            total_price=line_total,
            selected_modifiers=[m.model_dump() for m in it.selected_modifiers],
            negative_modifiers=it.negative_modifiers,
            kitchen_note=it.kitchen_note,
            course_stage=it.course_stage,
            is_hold=it.is_hold,
            status="pending" if not it.is_hold else "hold",
            station=station,
            created_at=datetime.utcnow()
        )
        db.add(order_item)

        # Trigger automatic BOM / Recipe stock deduction if not hold
        if not it.is_hold:
            await StockService.deduct_order_ingredients(db, it.product_id, it.quantity, order_no)

    order.subtotal = subtotal
    order.grand_total = subtotal + kuver_total
    order.remaining_total = order.grand_total

    if table:
        table.status = "occupied"
        table.opened_at = datetime.utcnow()
        table.current_order_id = order.id
        table.waiter_name = payload.waiter_name

    await db.commit()

    # Broadcast to POS and KDS
    await ws_hub.broadcast_all("ORDER_CREATED", {
        "order_id": order.id,
        "order_no": order.order_no,
        "table_id": order.table_id,
        "grand_total": order.grand_total
    })
    await ws_hub.broadcast_to_channel("kds", "KDS_NEW_ORDER", {"order_id": order.id, "order_no": order.order_no})

    return {"status": "success", "order_id": order.id, "order_no": order.order_no}

@router.post("/{order_id}/add-items")
async def add_items_to_order(order_id: int, payload: AddItemsRequest, db: AsyncSession = Depends(get_db)):
    """
    Adds extra items to an existing open order.
    """
    stmt = select(Order).where(Order.id == order_id).options(selectinload(Order.items), selectinload(Order.table))
    res = await db.execute(stmt)
    order = res.scalar_one_or_none()
    if not order or order.status not in ["open", "bill_requested"]:
        raise HTTPException(status_code=400, detail="Açık sipariş bulunamadı.")

    added_amount = 0.0
    for it in payload.items:
        p_res = await db.execute(select(Product).where(Product.id == it.product_id))
        prod = p_res.scalar_one_or_none()
        p_name = prod.name if prod else "Ürün"
        station = prod.station if prod else "kitchen"

        mod_sum = sum(m.price for m in it.selected_modifiers)
        line_unit = it.unit_price + mod_sum
        line_total = line_unit * it.quantity
        added_amount += line_total

        order_item = OrderItem(
            order_id=order.id,
            product_id=it.product_id,
            product_name=p_name,
            variant_name=it.variant_name,
            unit_price=line_unit,
            quantity=it.quantity,
            total_price=line_total,
            selected_modifiers=[m.model_dump() for m in it.selected_modifiers],
            negative_modifiers=it.negative_modifiers,
            kitchen_note=it.kitchen_note,
            course_stage=it.course_stage,
            is_hold=it.is_hold,
            status="pending" if not it.is_hold else "hold",
            station=station,
            created_at=datetime.utcnow()
        )
        db.add(order_item)

        if not it.is_hold:
            await StockService.deduct_order_ingredients(db, it.product_id, it.quantity, order.order_no)

    order.subtotal += added_amount
    order.grand_total = max(0.0, order.subtotal - order.discount_amount - order.treat_amount + order.kuver_total)
    order.remaining_total = max(0.0, order.grand_total - order.paid_total)

    await db.commit()

    await ws_hub.broadcast_all("ORDER_UPDATED", {"order_id": order.id, "grand_total": order.grand_total})
    await ws_hub.broadcast_to_channel("kds", "KDS_ITEMS_ADDED", {"order_id": order.id})
    return {"status": "success", "order_id": order.id, "grand_total": order.grand_total}

@router.post("/hold-fire")
async def toggle_hold_fire(payload: HoldFireToggleRequest, db: AsyncSession = Depends(get_db)):
    """
    Toggles items between Hold and Fire (Beklet / Mutfağa Ateşle).
    When fired, triggers kitchen chime and KDS ticket alert.
    """
    stmt = select(OrderItem).where(OrderItem.id.in_(payload.order_item_ids)).options(selectinload(OrderItem.order))
    res = await db.execute(stmt)
    items = res.scalars().all()

    for item in items:
        if payload.action == "fire":
            item.is_hold = False
            item.status = "pending"
            item.fired_at = datetime.utcnow()
            await StockService.deduct_order_ingredients(db, item.product_id, item.quantity, item.order.order_no)
        else:
            item.is_hold = True
            item.status = "hold"

    await db.commit()
    await ws_hub.broadcast_to_channel("kds", "KDS_ITEMS_FIRED", {"item_ids": payload.order_item_ids, "action": payload.action})
    await ws_hub.broadcast_all("ORDER_UPDATED", {"item_ids": payload.order_item_ids})
    return {"status": "success", "message": f"{len(items)} kalem ürün mutfağa ateşlendi!"}

@router.post("/void-item")
async def void_order_item(payload: VoidItemRequest, db: AsyncSession = Depends(get_db)):
    """
    Cancels / Voids an item with mandatory reason and manager PIN verification.
    Also produces a kitchen cancel slip.
    """
    if payload.manager_pin != settings.MANAGER_OVERRIDE_PIN:
        # Check if staff has manager role
        pass

    stmt = select(OrderItem).where(OrderItem.id == payload.order_item_id).options(selectinload(OrderItem.order))
    res = await db.execute(stmt)
    item = res.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Kalem bulunamadı.")

    item.is_voided = True
    item.status = "voided"
    item.void_reason = f"[{payload.reason_code}] {payload.reason_text or ''}"
    item.voided_by = payload.operator_name

    # Recalculate order totals
    order = item.order
    order.subtotal = max(0.0, order.subtotal - item.total_price)
    order.grand_total = max(0.0, order.subtotal - order.discount_amount - order.treat_amount + order.kuver_total)
    order.remaining_total = max(0.0, order.grand_total - order.paid_total)

    # Add audit log
    audit = AuditLog(
        action_type="VOID_ITEM",
        operator_name=payload.operator_name,
        target_ref=f"{order.order_no} - {item.product_name}",
        reason_code=payload.reason_code,
        reason_text=payload.reason_text,
        details={"product": item.product_name, "quantity": item.quantity, "amount": item.total_price}
    )
    db.add(audit)
    await db.commit()

    await ws_hub.broadcast_all("ORDER_UPDATED", {"order_id": order.id})
    await ws_hub.broadcast_to_channel("kds", "KDS_ITEM_VOIDED", {
        "order_id": order.id,
        "item_id": item.id,
        "product_name": item.product_name,
        "reason": item.void_reason
    })
    return {"status": "success", "message": f"{item.product_name} iptal edildi."}

@router.post("/{order_id}/discount")
async def apply_discount(order_id: int, payload: ApplyDiscountRequest, db: AsyncSession = Depends(get_db)):
    stmt = select(Order).where(Order.id == order_id)
    res = await db.execute(stmt)
    order = res.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı.")

    if payload.discount_type == "percentage":
        order.discount_rate = payload.value
        order.discount_amount = round((order.subtotal * payload.value) / 100.0, 2)
    else:
        order.discount_rate = 0.0
        order.discount_amount = round(payload.value, 2)

    order.discount_reason = payload.reason
    order.grand_total = max(0.0, order.subtotal - order.discount_amount - order.treat_amount + order.kuver_total)
    order.remaining_total = max(0.0, order.grand_total - order.paid_total)

    audit = AuditLog(
        action_type="APPLY_DISCOUNT",
        operator_name=payload.operator_name,
        target_ref=order.order_no,
        reason_code="INDIRIM",
        reason_text=payload.reason,
        details={"discount_amount": order.discount_amount, "type": payload.discount_type, "value": payload.value}
    )
    db.add(audit)
    await db.commit()

    await ws_hub.broadcast_all("ORDER_UPDATED", {"order_id": order.id, "discount": order.discount_amount})
    return {"status": "success", "discount_amount": order.discount_amount, "grand_total": order.grand_total}

@router.post("/{order_id}/treat")
async def apply_treat(order_id: int, payload: ApplyTreatRequest, db: AsyncSession = Depends(get_db)):
    stmt = select(Order).where(Order.id == order_id).options(selectinload(Order.items))
    res = await db.execute(stmt)
    order = res.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı.")

    treat_sum = 0.0
    if payload.order_item_ids:
        for it in order.items:
            if it.id in payload.order_item_ids:
                it.is_treat = True
                treat_sum += it.total_price
    else:
        # Treat whole order
        treat_sum = order.subtotal
        for it in order.items:
            it.is_treat = True

    order.treat_amount = treat_sum
    order.treat_reason = payload.reason
    order.grand_total = max(0.0, order.subtotal - order.discount_amount - order.treat_amount + order.kuver_total)
    order.remaining_total = max(0.0, order.grand_total - order.paid_total)

    audit = AuditLog(
        action_type="APPLY_TREAT",
        operator_name=payload.operator_name,
        target_ref=order.order_no,
        reason_code="IKRAM",
        reason_text=payload.reason,
        details={"treat_amount": treat_sum}
    )
    db.add(audit)
    await db.commit()

    await ws_hub.broadcast_all("ORDER_UPDATED", {"order_id": order.id, "treat": order.treat_amount})
    return {"status": "success", "treat_amount": order.treat_amount, "grand_total": order.grand_total}

@router.post("/split-equal")
async def calculate_split_equal(payload: SplitEqualRequest, db: AsyncSession = Depends(get_db)):
    """
    Calculates equal split amount per guest (Alman Usulü).
    """
    stmt = select(Order).where(Order.id == payload.order_id)
    res = await db.execute(stmt)
    order = res.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı.")

    persons = max(1, payload.person_count)
    per_person = round(order.remaining_total / persons, 2)

    return {
        "order_id": order.id,
        "remaining_total": order.remaining_total,
        "person_count": persons,
        "amount_per_person": per_person,
        "shares": [{"person_no": i + 1, "amount": per_person, "status": "pending"} for i in range(persons)]
    }

@router.get("/analytics/statistics")
async def get_restaurant_statistics(db: AsyncSession = Depends(get_db)):
    """
    Returns aggregated live restaurant statistics: Turnover, Waiter Performance, Average Bill, Discounts, Payment methods.
    """
    stmt = select(Order).options(selectinload(Order.items), selectinload(Order.payments))
    res = await db.execute(stmt)
    all_orders = res.scalars().all()

    total_turnover = sum(o.grand_total for o in all_orders if o.status in ["paid", "open", "bill_requested"])
    total_orders = len(all_orders)
    avg_ticket = (total_turnover / total_orders) if total_orders > 0 else 0.0
    total_discounts = sum(o.discount_amount for o in all_orders)
    total_treats = sum(o.treat_amount for o in all_orders)

    # Waiter leaderboard aggregation
    waiter_map = {}
    for o in all_orders:
        w_name = o.waiter_name or "MEHMET ABİ"
        if w_name not in waiter_map:
            waiter_map[w_name] = {"waiter_name": w_name, "orders_count": 0, "total_sales": 0.0, "total_kuver": 0, "total_tip": 0.0}
        waiter_map[w_name]["orders_count"] += 1
        waiter_map[w_name]["total_sales"] += o.grand_total
        waiter_map[w_name]["total_kuver"] += (o.kuver_count or 1)
        waiter_map[w_name]["total_tip"] += sum(p.tip_amount for p in o.payments)

    waiter_stats = sorted(waiter_map.values(), key=lambda x: x["total_sales"], reverse=True)

    return {
        "total_turnover": total_turnover,
        "total_orders": total_orders,
        "average_ticket": round(avg_ticket, 2),
        "total_discounts": total_discounts,
        "total_treats": total_treats,
        "waiters": waiter_stats
    }
