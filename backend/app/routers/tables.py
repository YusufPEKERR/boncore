from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from datetime import datetime
from app.database import get_db
from app.models.table import Area, Table
from app.models.order import Order, OrderItem
from app.models.audit import AuditLog
from app.schemas.all import (
    TablePositionUpdate, TableMoveRequest, TableMergeRequest, 
    TableItemTransferRequest, TableKuverRequest, WaiterCallRequest,
    AreaCreate, TableCreateSchema, TableBulkCreateSchema
)
from app.websocket_hub import ws_hub
from app.cache import cache_manager

router = APIRouter(prefix="/tables", tags=["Tables & Floor"])

@router.get("/areas")
async def get_areas_with_tables(db: AsyncSession = Depends(get_db)):
    """
    Returns all areas (Salon, Bahçe, Teras, VIP) with their tables, active orders, and status colors.
    """
    stmt = select(Area).options(
        selectinload(Area.tables).selectinload(Table.orders).selectinload(Order.items)
    ).order_by(Area.order_index)
    result = await db.execute(stmt)
    areas = result.scalars().all()

    output = []
    for area in areas:
        tables_data = []
        for table in area.tables:
            # Active open order
            active_order = None
            if table.orders:
                for o in sorted(table.orders, key=lambda x: x.id, reverse=True):
                    if o.status in ["open", "bill_requested"]:
                        active_order = {
                            "id": o.id,
                            "order_no": o.order_no,
                            "status": o.status,
                            "grand_total": o.grand_total,
                            "subtotal": o.subtotal,
                            "discount_amount": o.discount_amount,
                            "kuver_count": o.kuver_count,
                            "waiter_name": o.waiter_name,
                            "items_count": len([i for i in o.items if not i.is_voided]),
                            "created_at": o.created_at.isoformat() if o.created_at else None,
                        }
                        break

            # Eğer aktif açık sipariş yoksa ve rezerve değilse masa kesinlikle BOŞ'tur
            if not active_order and table.status not in ["reserved"]:
                table.status = "empty"
                table.opened_at = None
                table.kuver_count = 0
                table.waiter_name = None
                table.current_order_id = None
                table.waiter_call_reason = None

            # Calculate seated duration in minutes
            duration_minutes = 0
            if table.opened_at:
                delta = datetime.utcnow() - table.opened_at
                duration_minutes = int(delta.total_seconds() // 60)

            tables_data.append({
                "id": table.id,
                "area_id": table.area_id,
                "name": table.name,
                "shape": table.shape,
                "x": table.x,
                "y": table.y,
                "width": table.width,
                "height": table.height,
                "seats": table.seats,
                "status": table.status,
                "opened_at": table.opened_at.isoformat() if table.opened_at else None,
                "duration_minutes": duration_minutes,
                "kuver_count": table.kuver_count,
                "waiter_name": table.waiter_name,
                "reservation_name": table.reservation_name,
                "reservation_time": table.reservation_time,
                "waiter_call_reason": table.waiter_call_reason,
                "is_merged_to": table.is_merged_to,
                "active_order": active_order
            })

        output.append({
            "id": area.id,
            "name": area.name,
            "order_index": area.order_index,
            "tables": tables_data
        })

    return output

@router.put("/layout/positions")
async def update_table_positions(positions: list[TablePositionUpdate], db: AsyncSession = Depends(get_db)):
    """
    Saves drag & drop floor plan layout positions and table dimensions.
    """
    for pos in positions:
        stmt = select(Table).where(Table.id == pos.id)
        result = await db.execute(stmt)
        table = result.scalar_one_or_none()
        if table:
            table.x = pos.x
            table.y = pos.y
            if pos.width: table.width = pos.width
            if pos.height: table.height = pos.height
            if pos.shape: table.shape = pos.shape

    await db.commit()
    await ws_hub.broadcast_all("FLOOR_LAYOUT_UPDATED", {"updated_count": len(positions)})
    return {"status": "success", "message": "Kroki yerleşimi güncellendi."}

@router.post("/move")
async def move_table(payload: TableMoveRequest, db: AsyncSession = Depends(get_db)):
    """
    Moves all orders and state from source table to target table.
    """
    src_res = await db.execute(select(Table).where(Table.id == payload.source_table_id).options(selectinload(Table.orders)))
    target_res = await db.execute(select(Table).where(Table.id == payload.target_table_id).options(selectinload(Table.orders)))
    src_table = src_res.scalar_one_or_none()
    target_table = target_res.scalar_one_or_none()

    if not src_table or not target_table:
        raise HTTPException(status_code=404, detail="Masa bulunamadı.")

    if target_table.status != "empty" and target_table.status != "reserved":
        raise HTTPException(status_code=400, detail="Hedef masa boş değil! Masa birleştirme özelliğini kullanınız.")

    # Move active orders
    for order in src_table.orders:
        if order.status in ["open", "bill_requested"]:
            order.table_id = target_table.id

    # Transfer state
    target_table.status = src_table.status
    target_table.opened_at = src_table.opened_at
    target_table.kuver_count = src_table.kuver_count
    target_table.waiter_name = src_table.waiter_name
    target_table.current_order_id = src_table.current_order_id

    # Clear source
    src_table.status = "empty"
    src_table.opened_at = None
    src_table.kuver_count = 0
    src_table.waiter_name = None
    src_table.current_order_id = None
    src_table.waiter_call_reason = None

    # Audit log
    audit = AuditLog(
        action_type="TABLE_MOVE",
        operator_name=payload.operator_name,
        target_ref=f"{src_table.name} -> {target_table.name}",
        reason_code="MASA_TASIMA",
        reason_text=f"Masa {src_table.name}, Masa {target_table.name}'ye taşındı.",
        details={"source": src_table.name, "target": target_table.name}
    )
    db.add(audit)
    await db.commit()

    await ws_hub.broadcast_all("TABLE_MOVED", {"source_id": src_table.id, "target_id": target_table.id})
    return {"status": "success", "message": f"{src_table.name} masası {target_table.name} masasına taşındı."}

@router.post("/merge")
async def merge_tables(payload: TableMergeRequest, db: AsyncSession = Depends(get_db)):
    """
    Merges source table's active order into target table's active order.
    """
    src_res = await db.execute(select(Table).where(Table.id == payload.source_table_id).options(selectinload(Table.orders).selectinload(Order.items)))
    target_res = await db.execute(select(Table).where(Table.id == payload.target_table_id).options(selectinload(Table.orders).selectinload(Order.items)))
    src_table = src_res.scalar_one_or_none()
    target_table = target_res.scalar_one_or_none()

    if not src_table or not target_table:
        raise HTTPException(status_code=404, detail="Masalar bulunamadı.")

    src_order = next((o for o in src_table.orders if o.status in ["open", "bill_requested"]), None)
    target_order = next((o for o in target_table.orders if o.status in ["open", "bill_requested"]), None)

    if not src_order or not target_order:
        raise HTTPException(status_code=400, detail="Her iki masada da aktif açık adisyon olmalıdır.")

    # Transfer items from src_order to target_order
    for item in src_order.items:
        item.order_id = target_order.id

    # Recalculate target order totals
    target_order.subtotal += src_order.subtotal
    target_order.discount_amount += src_order.discount_amount
    target_order.kuver_count += src_order.kuver_count
    target_order.kuver_total += src_order.kuver_total
    target_order.grand_total += src_order.grand_total
    target_order.remaining_total += src_order.grand_total

    # Cancel/Close source order
    src_order.status = "cancelled"
    src_order.notes = f"Masa {target_table.name} ile birleştirildi."

    # Mark source table as merged or empty
    src_table.status = "empty"
    src_table.is_merged_to = target_table.id
    src_table.opened_at = None
    src_table.kuver_count = 0
    src_table.current_order_id = None

    # Audit log
    audit = AuditLog(
        action_type="TABLE_MERGE",
        operator_name=payload.operator_name,
        target_ref=f"{src_table.name} + {target_table.name}",
        reason_code="MASA_BIRLESTIRME",
        reason_text=f"Masa {src_table.name} adisyonu Masa {target_table.name} ile birleştirildi.",
        details={"source": src_table.name, "target": target_table.name, "target_order": target_order.order_no}
    )
    db.add(audit)
    await db.commit()

    await ws_hub.broadcast_all("TABLE_MERGED", {"source_id": src_table.id, "target_id": target_table.id})
    return {"status": "success", "message": f"{src_table.name} masası {target_table.name} ile birleştirildi."}

@router.post("/transfer-items")
async def transfer_items_between_tables(payload: TableItemTransferRequest, db: AsyncSession = Depends(get_db)):
    """
    Transfers specific individual items from source table to target table.
    Creates an order on target table if it doesn't have an active one.
    """
    src_res = await db.execute(select(Table).where(Table.id == payload.source_table_id).options(selectinload(Table.orders).selectinload(Order.items)))
    target_res = await db.execute(select(Table).where(Table.id == payload.target_table_id).options(selectinload(Table.orders).selectinload(Order.items)))
    src_table = src_res.scalar_one_or_none()
    target_table = target_res.scalar_one_or_none()

    if not src_table or not target_table:
        raise HTTPException(status_code=404, detail="Masalar bulunamadı.")

    src_order = next((o for o in src_table.orders if o.status in ["open", "bill_requested"]), None)
    if not src_order:
        raise HTTPException(status_code=400, detail="Kaynak masada aktif adisyon yok.")

    target_order = next((o for o in target_table.orders if o.status in ["open", "bill_requested"]), None)
    if not target_order:
        # Create new order on target table
        order_no = f"ORD-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{target_table.id}"
        target_order = Order(
            order_no=order_no,
            table_id=target_table.id,
            order_type="dine_in",
            status="open",
            waiter_name=payload.operator_name,
            created_at=datetime.utcnow()
        )
        db.add(target_order)
        await db.flush()
        target_table.status = "occupied"
        target_table.opened_at = datetime.utcnow()
        target_table.current_order_id = target_order.id
        target_table.waiter_name = payload.operator_name

    transferred_amount = 0.0
    for item_id in payload.order_item_ids:
        item_stmt = select(OrderItem).where(OrderItem.id == item_id, OrderItem.order_id == src_order.id)
        i_res = await db.execute(item_stmt)
        item = i_res.scalar_one_or_none()
        if item:
            item.order_id = target_order.id
            transferred_amount += item.total_price

    # Recalculate totals
    src_order.subtotal = max(0.0, src_order.subtotal - transferred_amount)
    src_order.grand_total = max(0.0, src_order.subtotal - src_order.discount_amount - src_order.treat_amount + src_order.kuver_total)
    src_order.remaining_total = src_order.grand_total

    target_order.subtotal += transferred_amount
    target_order.grand_total = target_order.subtotal - target_order.discount_amount - target_order.treat_amount + target_order.kuver_total
    target_order.remaining_total = target_order.grand_total

    # Audit log
    audit = AuditLog(
        action_type="ITEM_TRANSFER",
        operator_name=payload.operator_name,
        target_ref=f"{src_table.name} -> {target_table.name}",
        reason_code="URUN_AKTARIMI",
        reason_text=f"{len(payload.order_item_ids)} adet ürün {src_table.name}'den {target_table.name}'ye aktarıldı.",
        details={"items_count": len(payload.order_item_ids), "amount": transferred_amount}
    )
    db.add(audit)
    await db.commit()

    await ws_hub.broadcast_all("TABLE_ITEMS_TRANSFERRED", {
        "source_table_id": src_table.id,
        "target_table_id": target_table.id
    })
    return {"status": "success", "message": f"Ürünler başarıyla {target_table.name} masasına aktarıldı."}

@router.post("/{table_id}/kuver")
async def update_table_kuver(table_id: int, payload: TableKuverRequest, db: AsyncSession = Depends(get_db)):
    """
    Updates kuver (cover charge / person count) for the table and active order.
    """
    stmt = select(Table).where(Table.id == table_id).options(selectinload(Table.orders))
    res = await db.execute(stmt)
    table = res.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Masa bulunamadı.")

    table.kuver_count = payload.kuver_count
    active_order = next((o for o in table.orders if o.status in ["open", "bill_requested"]), None)
    
    from app.config import settings
    from app.models.setting import RestaurantSetting
    import json

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

    if active_order:
        active_order.kuver_count = payload.kuver_count if kuver_enabled else 0
        active_order.kuver_total = (payload.kuver_count * kuver_unit_price) if kuver_enabled else 0.0
        active_order.grand_total = max(0.0, active_order.subtotal - active_order.discount_amount - active_order.treat_amount + active_order.kuver_total)
        active_order.remaining_total = max(0.0, active_order.grand_total - active_order.paid_total)

    await db.commit()
    await ws_hub.broadcast_all("TABLE_UPDATED", {"table_id": table_id, "kuver_count": payload.kuver_count})
    return {"status": "success", "kuver_count": payload.kuver_count}

@router.post("/{table_id}/call-waiter")
async def trigger_waiter_call(table_id: int, payload: WaiterCallRequest, db: AsyncSession = Depends(get_db)):
    """
    Triggered when customer clicks "Garson Çağır" or "Hesap İste" from their mobile QR menu.
    Broadcasts instant sound and alert toast to all POS/waiter devices.
    """
    stmt = select(Table).where(Table.id == table_id)
    res = await db.execute(stmt)
    table = res.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Masa bulunamadı.")

    table.waiter_call_reason = payload.reason
    if payload.reason == "Hesap İste":
        table.status = "bill_requested"
    else:
        table.status = "waiter_call"

    await db.commit()
    await ws_hub.broadcast_to_channel("waiter", "WAITER_CALL_ALERT", {
        "table_id": table.id,
        "table_name": table.name,
        "reason": payload.reason,
        "timestamp": datetime.now().strftime("%H:%M:%S")
    })
    return {"status": "success", "message": f"{payload.reason} talebiniz garsona iletildi!"}

@router.post("/{table_id}/clear-call")
async def clear_waiter_call(table_id: int, db: AsyncSession = Depends(get_db)):
    """
    Waiter acknowledges and clears the buzzer call.
    """
    stmt = select(Table).where(Table.id == table_id)
    res = await db.execute(stmt)
    table = res.scalar_one_or_none()
    if table:
        table.waiter_call_reason = None
        if table.status == "waiter_call":
            table.status = "occupied" if table.current_order_id else "empty"
        await db.commit()
        await ws_hub.broadcast_all("WAITER_CALL_CLEARED", {"table_id": table_id})
    return {"status": "success"}

# --- Area & Table Management / Definitions CRUD ---

@router.post("/areas")
async def create_area(payload: AreaCreate, db: AsyncSession = Depends(get_db)):
    """
    Creates a new Area (e.g. Kasap, Salon, Bahçe, Loca).
    """
    new_area = Area(name=payload.name, order_index=payload.order_index or 0)
    db.add(new_area)
    await db.commit()
    await db.refresh(new_area)
    await ws_hub.broadcast_all("AREAS_UPDATED", {"area_id": new_area.id})
    return {"status": "success", "area": {"id": new_area.id, "name": new_area.name}}

@router.put("/areas/{area_id}")
async def update_area(area_id: int, payload: AreaCreate, db: AsyncSession = Depends(get_db)):
    """
    Updates an Area's name and order index.
    """
    stmt = select(Area).where(Area.id == area_id)
    res = await db.execute(stmt)
    area = res.scalar_one_or_none()
    if not area:
        raise HTTPException(status_code=404, detail="Bölge bulunamadı.")
    area.name = payload.name
    if payload.order_index is not None:
        area.order_index = payload.order_index
    await db.commit()
    await ws_hub.broadcast_all("AREAS_UPDATED", {"area_id": area_id})
    return {"status": "success", "message": "Bölge güncellendi."}

@router.delete("/areas/{area_id}")
async def delete_area(area_id: int, db: AsyncSession = Depends(get_db)):
    """
    Deletes an area and associated empty tables.
    """
    stmt = select(Area).where(Area.id == area_id).options(selectinload(Area.tables))
    res = await db.execute(stmt)
    area = res.scalar_one_or_none()
    if not area:
        raise HTTPException(status_code=404, detail="Bölge bulunamadı.")
    
    # Check if any table is occupied
    for t in area.tables:
        if t.status in ["occupied", "bill_requested"]:
            raise HTTPException(status_code=400, detail="Bu bölgede aktif dolu masa bulunmaktadır. Önce masaları kapatınız.")
        await db.delete(t)

    await db.delete(area)
    await db.commit()
    await ws_hub.broadcast_all("AREAS_UPDATED", {"deleted_area_id": area_id})
    return {"status": "success", "message": "Bölge silindi."}

@router.post("/single")
async def create_single_table(payload: TableCreateSchema, db: AsyncSession = Depends(get_db)):
    """
    Creates a single table in a specific area.
    """
    new_table = Table(
        area_id=payload.area_id,
        name=payload.name,
        seats=payload.seats or 4,
        shape=payload.shape or "square",
        status="empty",
        x=50.0,
        y=50.0,
        width=120.0,
        height=120.0
    )
    db.add(new_table)
    await db.commit()
    await db.refresh(new_table)
    await ws_hub.broadcast_all("AREAS_UPDATED", {"table_id": new_table.id})
    return {"status": "success", "table_id": new_table.id}

@router.put("/single/{table_id}")
async def update_single_table(table_id: int, payload: TableCreateSchema, db: AsyncSession = Depends(get_db)):
    """
    Updates table name, seats, shape, or area.
    """
    stmt = select(Table).where(Table.id == table_id)
    res = await db.execute(stmt)
    table = res.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Masa bulunamadı.")
    table.name = payload.name
    table.area_id = payload.area_id
    if payload.seats: table.seats = payload.seats
    if payload.shape: table.shape = payload.shape
    await db.commit()
    await ws_hub.broadcast_all("AREAS_UPDATED", {"table_id": table_id})
    return {"status": "success", "message": "Masa güncellendi."}

@router.delete("/single/{table_id}")
async def delete_single_table(table_id: int, db: AsyncSession = Depends(get_db)):
    """
    Deletes a table if it is empty.
    """
    stmt = select(Table).where(Table.id == table_id)
    res = await db.execute(stmt)
    table = res.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Masa bulunamadı.")
    if table.status in ["occupied", "bill_requested"]:
        raise HTTPException(status_code=400, detail="Masa şu anda dolu! Önce hesabı kapatınız.")
    
    await db.delete(table)
    await db.commit()
    await ws_hub.broadcast_all("AREAS_UPDATED", {"deleted_table_id": table_id})
    return {"status": "success", "message": "Masa silindi."}

@router.post("/bulk-create")
async def bulk_create_tables(payload: TableBulkCreateSchema, db: AsyncSession = Depends(get_db)):
    """
    Bulk creates tables for an area.
    Example: Prefix 'Masa ', start 1, count 10 -> Masa 1 ... Masa 10
    """
    created_count = 0
    for i in range(payload.start_num, payload.start_num + payload.count):
        table_name = f"{payload.prefix}{i}".strip()
        t = Table(
            area_id=payload.area_id,
            name=table_name,
            seats=payload.seats,
            shape=payload.shape,
            status="empty",
            x=50.0 + (created_count % 5) * 140.0,
            y=50.0 + (created_count // 5) * 140.0,
            width=120.0,
            height=120.0
        )
        db.add(t)
        created_count += 1

    await db.commit()
    await ws_hub.broadcast_all("AREAS_UPDATED", {"created_count": created_count})
    return {"status": "success", "created_count": created_count}

