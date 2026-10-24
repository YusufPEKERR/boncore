from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from datetime import datetime
from app.database import get_db
from app.models.delivery import Courier, DeliveryOrder
from app.models.order import Order, OrderItem
from app.models.product import Product
from app.schemas.all import AssignCourierRequest, CourierMutabakatRequest, OnlineOrderIngestRequest
from app.services.stock_service import StockService
from app.websocket_hub import ws_hub
import uuid

router = APIRouter(prefix="/delivery", tags=["Delivery & Aggregators"])

@router.get("/couriers")
async def get_couriers(db: AsyncSession = Depends(get_db)):
    stmt = select(Courier).where(Courier.is_active == True)
    res = await db.execute(stmt)
    couriers = res.scalars().all()
    return couriers

@router.get("/orders")
async def get_delivery_orders(db: AsyncSession = Depends(get_db)):
    stmt = select(DeliveryOrder).options(
        selectinload(DeliveryOrder.order).selectinload(Order.items),
        selectinload(DeliveryOrder.courier)
    ).order_by(DeliveryOrder.id.desc())
    res = await db.execute(stmt)
    orders = res.scalars().all()

    output = []
    for do in orders:
        output.append({
            "id": do.id,
            "order_id": do.order_id,
            "order_no": do.order.order_no if do.order else "",
            "platform": do.platform,
            "platform_order_id": do.platform_order_id,
            "customer_name": do.customer_name,
            "customer_phone": do.customer_phone,
            "delivery_address": do.delivery_address,
            "address_zone": do.address_zone,
            "courier_id": do.courier_id,
            "courier_name": do.courier.name if do.courier else None,
            "courier_status": do.courier_status,
            "payment_type": do.payment_type,
            "grand_total": do.order.grand_total if do.order else 0.0,
            "notes": do.notes,
            "created_at": do.order.created_at.strftime("%H:%M:%S") if do.order and do.order.created_at else None,
            "items": [
                {
                    "name": it.product_name,
                    "quantity": it.quantity,
                    "unit_price": it.unit_price,
                    "total_price": it.total_price,
                    "kitchen_note": it.kitchen_note
                } for it in (do.order.items if do.order else [])
            ]
        })
    return output

@router.get("/caller-id-simulate")
async def simulate_caller_id(phone: str = Query("05321234567"), db: AsyncSession = Depends(get_db)):
    """
    Looks up real customer details and past orders from DeliveryOrder database records by phone number,
    with fallback to known caller directory if new customer.
    """
    clean_phone = phone.replace(" ", "").strip()
    stmt = select(DeliveryOrder).options(
        selectinload(DeliveryOrder.order).selectinload(Order.items)
    ).order_by(DeliveryOrder.id.desc())
    res = await db.execute(stmt)
    all_deliveries = res.scalars().all()

    matched_orders = [
        d for d in all_deliveries
        if d.customer_phone and clean_phone in d.customer_phone.replace(" ", "")
    ]

    if matched_orders:
        latest = matched_orders[0]
        addresses = []
        fav_items = []
        for d in matched_orders:
            if d.delivery_address and d.delivery_address not in addresses:
                addresses.append(d.delivery_address)
            if d.order and d.order.items:
                for it in d.order.items:
                    if it.product_name and it.product_name not in fav_items:
                        fav_items.append(it.product_name)
        cust = {
            "name": latest.customer_name or "Kayıtlı Müşteri",
            "customer_name": latest.customer_name or "Kayıtlı Müşteri",
            "phone": phone,
            "address": addresses[0] if addresses else "Moda Cad. Kadıköy / İstanbul",
            "addresses": addresses if addresses else ["Moda Cad. Kadıköy / İstanbul"],
            "past_orders_count": len(matched_orders),
            "favorite_items": fav_items[:5]
        }
    else:
        known_customers = {
            "05321112233": {
                "name": "Ahmet Yılmaz",
                "customer_name": "Ahmet Yılmaz",
                "phone": "0532 111 22 33",
                "address": "Moda Cad. No:84 D:4 Kadıköy / İstanbul",
                "addresses": ["Moda Cad. No:84 D:4 Kadıköy / İstanbul"],
                "past_orders_count": 0,
                "favorite_items": []
            },
            "05321234567": {
                "name": "Ahmet Yılmaz",
                "customer_name": "Ahmet Yılmaz",
                "phone": "0532 123 45 67",
                "address": "Bağdat Cad. No:142 D:8 Kadıköy / İstanbul",
                "addresses": ["Bağdat Cad. No:142 D:8 Kadıköy / İstanbul"],
                "past_orders_count": 0,
                "favorite_items": []
            },
            "05429876543": {
                "name": "Zeynep Kaya",
                "customer_name": "Zeynep Kaya",
                "phone": "0542 987 65 43",
                "address": "Fenerbahçe Mah. Lale Sok. No:5 D:3 Kadıköy",
                "addresses": ["Fenerbahçe Mah. Lale Sok. No:5 D:3 Kadıköy"],
                "past_orders_count": 0,
                "favorite_items": []
            }
        }
        cust = known_customers.get(clean_phone, {
            "name": "Telefon Müşterisi",
            "customer_name": "Telefon Müşterisi",
            "phone": phone,
            "address": "Kadıköy Merkez / İstanbul",
            "addresses": ["Kadıköy Merkez / İstanbul"],
            "past_orders_count": 0,
            "favorite_items": []
        })

    await ws_hub.broadcast_all("CALLER_ID_INCOMING", cust)
    return cust

@router.post("/assign-courier")
async def assign_courier(payload: AssignCourierRequest, db: AsyncSession = Depends(get_db)):
    stmt = select(DeliveryOrder).where(DeliveryOrder.id == payload.delivery_order_id)
    res = await db.execute(stmt)
    do = res.scalar_one_or_none()
    if not do:
        raise HTTPException(status_code=404, detail="Paket siparişi bulunamadı.")

    do.courier_id = payload.courier_id
    do.courier_status = "on_the_way"
    do.dispatched_at = datetime.utcnow()
    await db.commit()

    await ws_hub.broadcast_all("DELIVERY_COURIER_ASSIGNED", {
        "delivery_order_id": do.id,
        "courier_id": payload.courier_id
    })
    await ws_hub.broadcast_all("ORDER_UPDATED", {"order_id": do.order_id})
    return {"status": "success", "message": "Kurye atandı ve yola çıktı."}

@router.post("/complete-delivery/{delivery_order_id}")
async def complete_delivery(delivery_order_id: int, db: AsyncSession = Depends(get_db)):
    """
    Marks a delivery order as delivered, settles its underlying Order and creates a Payment record,
    and updates the assigned courier's cash/card balance so Cashier, Delivery, and Statistics stay in sync.
    """
    from app.models.payment import Payment
    stmt = select(DeliveryOrder).where(DeliveryOrder.id == delivery_order_id).options(
        selectinload(DeliveryOrder.order).selectinload(Order.payments),
        selectinload(DeliveryOrder.courier)
    )
    res = await db.execute(stmt)
    do = res.scalar_one_or_none()
    if not do:
        raise HTTPException(status_code=404, detail="Paket siparişi bulunamadı.")

    do.courier_status = "delivered"
    do.delivered_at = datetime.utcnow()

    order = do.order
    amount = round(order.grand_total if order else 0.0, 2)
    pay_type = (do.payment_type or "nakit").lower()
    is_cash = "nakit" in pay_type or "cash" in pay_type

    if do.courier:
        if is_cash:
            do.courier.cash_collected = round((do.courier.cash_collected or 0.0) + amount, 2)
        else:
            do.courier.card_slips_collected = round((do.courier.card_slips_collected or 0.0) + amount, 2)

    if order and order.status != "paid":
        order.status = "paid"
        order.paid_total = amount
        order.remaining_total = 0.0
        order.closed_at = datetime.utcnow()
        order.cashier_name = do.courier.name if do.courier else "Paket Servis"

        if not order.payments:
            payment = Payment(
                order_id=order.id,
                amount=amount,
                payment_method="cash" if is_cash else ("online" if "online" in pay_type else "credit_card"),
                tip_amount=0.0,
                rounding_amount=0.0,
                cashier_name=do.courier.name if do.courier else "Paket Servis",
                receipt_no=f"PKT-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
                created_at=datetime.utcnow()
            )
            db.add(payment)

    await db.commit()

    await ws_hub.broadcast_all("ORDER_PAID", {
        "order_id": order.id if order else None,
        "delivery_order_id": do.id,
        "is_fully_paid": True
    })
    return {"status": "success", "message": "Paket teslim edildi ve tahsilat kasaya işlendi."}

@router.post("/courier-mutabakat")
async def courier_mutabakat(payload: CourierMutabakatRequest, db: AsyncSession = Depends(get_db)):
    """
    Courier cash & POS card slip settlement at cash register.
    """
    from app.models.audit import AuditLog
    stmt = select(Courier).where(Courier.id == payload.courier_id)
    res = await db.execute(stmt)
    courier = res.scalar_one_or_none()
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı.")

    settled_cash = courier.cash_collected or 0.0
    settled_card = courier.card_slips_collected or 0.0
    courier.cash_collected = 0.0
    courier.card_slips_collected = 0.0

    audit = AuditLog(
        action_type="COURIER_SETTLEMENT",
        operator_name=courier.name,
        operator_role="courier",
        target_ref=f"Kurye #{courier.id}",
        reason_code="KURYE_MUTABAKAT",
        reason_text=f"Kurye gün sonu kasa mutabakatı: Nakit ₺{settled_cash:.2f}, Kart ₺{settled_card:.2f}",
        details={"cash": settled_cash, "card": settled_card}
    )
    db.add(audit)
    await db.commit()

    await ws_hub.broadcast_all("ORDER_UPDATED", {"courier_id": courier.id})

    return {
        "status": "success",
        "message": f"{courier.name} kurye mutabakatı tamamlandı. Toplam Alınan: ₺{settled_cash + settled_card:.2f}"
    }

@router.post("/ingest-online-order")
async def ingest_online_platform_order(payload: OnlineOrderIngestRequest, db: AsyncSession = Depends(get_db)):
    """
    Creates a real delivery order from Telefon / Yemeksepeti / Getir / Trendyol Yemek,
    deducts recipe stock, creates Order & DeliveryOrder in DB, and broadcasts to all screens.
    """
    plat = (payload.platform or payload.channel or "paket").lower()
    order_no = f"{plat.upper()[:3]}-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:4].upper()}"
    order = Order(
        order_no=order_no,
        order_type="online_delivery",
        status="open",
        subtotal=0.0,
        discount_amount=0.0,
        discount_rate=0.0,
        treat_amount=0.0,
        kuver_count=0,
        kuver_total=0.0,
        grand_total=0.0,
        paid_total=0.0,
        remaining_total=0.0,
        waiter_name=plat.capitalize(),
        notes=f"[{plat.upper()}] {payload.notes or ''}",
        created_at=datetime.utcnow()
    )
    db.add(order)
    await db.flush()

    subtotal = 0.0
    for it in payload.items:
        prod = None
        if it.product_id:
            p_res = await db.execute(select(Product).where(Product.id == it.product_id))
            prod = p_res.scalar_one_or_none()
        if not prod and (it.name or it.product_name):
            search_name = it.name or it.product_name
            p_res = await db.execute(select(Product).where(Product.name.ilike(f"%{search_name}%")))
            prod = p_res.scalars().first()
        if not prod:
            p_res = await db.execute(select(Product).limit(1))
            prod = p_res.scalar_one_or_none()

        actual_pid = prod.id if prod else (it.product_id or 1)
        p_name = prod.name if prod else (it.name or it.product_name or "Ürün")
        station = prod.station if prod else "kitchen"
        unit_price = it.unit_price if it.unit_price > 0 else (prod.base_price if prod else 100.0)

        line_unit = unit_price
        line_total = it.total_price if it.total_price and it.total_price > 0 else (line_unit * it.quantity)
        subtotal += line_total

        order_item = OrderItem(
            order_id=order.id,
            product_id=actual_pid,
            product_name=p_name,
            variant_name=None,
            unit_price=line_unit,
            quantity=it.quantity,
            total_price=line_total,
            selected_modifiers=[],
            negative_modifiers=[],
            kitchen_note=it.kitchen_note,
            course_stage=1,
            is_hold=False,
            status="pending",
            station=station,
            created_at=datetime.utcnow()
        )
        db.add(order_item)
        if actual_pid:
            await StockService.deduct_order_ingredients(db, actual_pid, it.quantity, order_no)

    order.subtotal = subtotal
    order.grand_total = subtotal
    order.remaining_total = subtotal

    delivery_order = DeliveryOrder(
        order_id=order.id,
        platform=payload.platform or plat,
        platform_order_id=f"EXT-{int(datetime.utcnow().timestamp())%100000}",
        customer_name=payload.customer_name,
        customer_phone=payload.customer_phone,
        delivery_address=payload.delivery_address,
        payment_type=payload.payment_type,
        notes=payload.notes
    )
    db.add(delivery_order)
    await db.commit()

    # Trigger audio & visual alerts across all connected screens (POS, KDS, Dashboard, DeliveryHub, Statistics)
    await ws_hub.broadcast_all("ONLINE_ORDER_INCOMING", {
        "platform": payload.platform or plat,
        "order_no": order_no,
        "customer": payload.customer_name,
        "total": subtotal
    })
    await ws_hub.broadcast_to_channel("kds", "KDS_NEW_ORDER", {"order_id": order.id, "order_no": order_no})

    return {"status": "success", "order_id": order.id, "order_no": order_no}

