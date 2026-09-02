from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from datetime import datetime
from app.database import get_db
from app.models.order import Order, OrderItem
from app.models.table import Table
from app.websocket_hub import ws_hub

router = APIRouter(prefix="/kds", tags=["Kitchen Display System (KDS)"])

@router.get("/orders")
async def get_kds_orders(station: str = Query("all"), db: AsyncSession = Depends(get_db)):
    """
    Returns active orders for the KDS screen with elapsed duration timers and station filtering.
    """
    stmt = select(Order).where(Order.status.in_(["open", "bill_requested"])).options(
        selectinload(Order.items),
        selectinload(Order.table)
    ).order_by(Order.created_at.asc())

    res = await db.execute(stmt)
    orders = res.scalars().all()

    output = []
    now = datetime.utcnow()

    for o in orders:
        items_data = []
        for it in o.items:
            if it.is_voided or it.is_hold:
                continue
            if station != "all" and it.station != station:
                continue

            items_data.append({
                "id": it.id,
                "product_name": it.product_name,
                "variant_name": it.variant_name,
                "quantity": it.quantity,
                "selected_modifiers": it.selected_modifiers,
                "negative_modifiers": it.negative_modifiers,
                "kitchen_note": it.kitchen_note,
                "course_stage": it.course_stage,
                "status": it.status,
                "station": it.station,
                "created_at": it.created_at.isoformat() if it.created_at else None,
            })

        if not items_data:
            continue

        # Calculate elapsed minutes since order creation
        elapsed_sec = (now - o.created_at).total_seconds() if o.created_at else 0
        elapsed_min = int(elapsed_sec // 60)

        # Color alert level: green (0-8m), yellow (8-15m), red (>15m)
        alert_color = "green"
        if elapsed_min >= 15:
            alert_color = "red"
        elif elapsed_min >= 8:
            alert_color = "yellow"

        output.append({
            "order_id": o.id,
            "order_no": o.order_no,
            "table_id": o.table_id,
            "table_name": o.table.name if o.table else "Paket",
            "order_type": o.order_type,
            "waiter_name": o.waiter_name,
            "created_at": o.created_at.isoformat() if o.created_at else None,
            "elapsed_minutes": elapsed_min,
            "alert_color": alert_color,
            "items": items_data
        })

    return output

@router.post("/item/{item_id}/progress")
async def progress_item_status(item_id: int, status: str = Query(..., regex="^(pending|preparing|ready|served)$"), db: AsyncSession = Depends(get_db)):
    """
    Progresses status of an individual item on KDS (e.g. from preparing to ready).
    """
    stmt = select(OrderItem).where(OrderItem.id == item_id).options(selectinload(OrderItem.order))
    res = await db.execute(stmt)
    item = res.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Kalem bulunamadı.")

    item.status = status
    if status == "ready":
        item.ready_at = datetime.utcnow()
    elif status == "served":
        item.served_at = datetime.utcnow()

    await db.commit()

    await ws_hub.broadcast_to_channel("kds", "KDS_STATUS_CHANGED", {
        "order_id": item.order_id,
        "item_id": item.id,
        "new_status": status
    })
    await ws_hub.broadcast_all("ORDER_ITEM_STATUS", {
        "order_id": item.order_id,
        "item_id": item.id,
        "status": status
    })

    return {"status": "success", "item_id": item.id, "new_status": status}

@router.post("/order/{order_id}/ready-all")
async def mark_all_order_items_ready(order_id: int, db: AsyncSession = Depends(get_db)):
    """
    Marks all items in the order as ready and triggers the kitchen bell sound.
    """
    stmt = select(OrderItem).where(OrderItem.order_id == order_id, OrderItem.is_voided == False, OrderItem.is_hold == False)
    res = await db.execute(stmt)
    items = res.scalars().all()

    for it in items:
        it.status = "ready"
        it.ready_at = datetime.utcnow()

    await db.commit()

    await ws_hub.broadcast_to_channel("pos", "KITCHEN_ORDER_READY_ALERT", {
        "order_id": order_id,
        "message": f"Sipariş hazır! Garson çağrısı yapıldı."
    })
    await ws_hub.broadcast_to_channel("kds", "KDS_ORDER_READY_ALL", {"order_id": order_id})

    return {"status": "success", "message": "Tüm ürünler hazır olarak işaretlendi."}
