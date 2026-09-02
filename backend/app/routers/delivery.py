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
    Simulates incoming phone call detection with customer details and past orders.
    """
    mock_customers = {
        "05321234567": {
            "name": "Ahmet Yılmaz",
            "phone": "0532 123 45 67",
            "addresses": [
                "Bağdat Cad. No:142 D:8 Kadıköy / İstanbul (Ev)",
                "Maslak Plaza B Blok Kat:12 Sarıyer / İstanbul (İş)"
            ],
            "past_orders_count": 14,
            "favorite_items": ["Bon Burger", "Truffle Fries", "Coca Cola Zero"]
        },
        "05429876543": {
            "name": "Zeynep Kaya",
            "phone": "0542 987 65 43",
            "addresses": ["Fenerbahçe Mah. Lale Sok. No:5 D:3 Kadıköy"],
            "past_orders_count": 6,
            "favorite_items": ["Margherita Pizza", "San Sebastian Cheesecake"]
        }
    }

    cust = mock_customers.get(phone.replace(" ", ""), {
        "name": "Yeni Müşteri",
        "phone": phone,
        "addresses": ["Henüz kayıtlı adres bulunmuyor."],
        "past_orders_count": 0,
        "favorite_items": []
    })

    # Broadcast incoming call popup to POS
    await ws_hub.broadcast_to_channel("pos", "CALLER_ID_INCOMING", cust)
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
    return {"status": "success", "message": "Kurye atandı ve yola çıktı."}

@router.post("/courier-mutabakat")
async def courier_mutabakat(payload: CourierMutabakatRequest, db: AsyncSession = Depends(get_db)):
    """
    Courier cash & POS card slip settlement at cash register.
    """
    stmt = select(Courier).where(Courier.id == payload.courier_id)
    res = await db.execute(stmt)
    courier = res.scalar_one_or_none()
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı.")

    courier.cash_collected = 0.0
    courier.card_slips_collected = 0.0
    await db.commit()

    return {
        "status": "success",
        "message": f"{courier.name} kurye mutabakatı tamamlandı. Toplam Alınan: ₺{payload.collected_cash + payload.collected_card:.2f}"
    }

@router.post("/ingest-online-order")
async def ingest_online_platform_order(payload: OnlineOrderIngestRequest, db: AsyncSession = Depends(get_db)):
    """
    Simulates incoming order from Yemeksepeti / Getir / Trendyol Yemek.
    Auto-accepts, creates Order, and broadcasts to Kitchen/KDS & printer.
    """
    order_no = f"{payload.platform.upper()[:3]}-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
    order = Order(
        order_no=order_no,
        order_type="online_delivery",
        status="open",
        waiter_name=payload.platform.capitalize(),
        notes=f"[{payload.platform.upper()}] {payload.notes or ''}",
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
            course_stage=1,
            is_hold=False,
            status="pending",
            station=station,
            created_at=datetime.utcnow()
        )
        db.add(order_item)
        await StockService.deduct_order_ingredients(db, it.product_id, it.quantity, order_no)

    order.subtotal = subtotal
    order.grand_total = subtotal
    order.remaining_total = subtotal

    delivery_order = DeliveryOrder(
        order_id=order.id,
        platform=payload.platform,
        platform_order_id=f"EXT-{int(datetime.utcnow().timestamp())%100000}",
        customer_name=payload.customer_name,
        customer_phone=payload.customer_phone,
        delivery_address=payload.delivery_address,
        payment_type=payload.payment_type,
        notes=payload.notes
    )
    db.add(delivery_order)
    await db.commit()

    # Trigger audio & visual alerts
    await ws_hub.broadcast_to_channel("pos", "ONLINE_ORDER_INCOMING", {
        "platform": payload.platform,
        "order_no": order_no,
        "customer": payload.customer_name,
        "total": subtotal
    })
    await ws_hub.broadcast_to_channel("kds", "KDS_NEW_ORDER", {"order_id": order.id, "order_no": order_no})

    return {"status": "success", "order_id": order.id, "order_no": order_no}
