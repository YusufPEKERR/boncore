from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from datetime import datetime
from app.database import get_db
from app.models.table import Table
from app.models.order import Order, OrderItem
from app.models.product import Category, Product, ModifierGroup
from app.schemas.all import CreateOrderRequest, AddItemsRequest, WaiterCallRequest
from app.services.stock_service import StockService
from app.websocket_hub import ws_hub

router = APIRouter(prefix="/qr", tags=["QR Menu & Customer Mobile"])

@router.get("/table/{table_id}/menu")
async def get_table_qr_menu(table_id: int, db: AsyncSession = Depends(get_db)):
    """
    Returns customer-facing digital menu with allergen filters, multi-lingual support, and active table cart status.
    """
    t_stmt = select(Table).where(Table.id == table_id).options(selectinload(Table.orders).selectinload(Order.items))
    t_res = await db.execute(t_stmt)
    table = t_res.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Masa bulunamadı.")

    # Fetch active order on table if any
    active_order = next((o for o in table.orders if o.status in ["open", "bill_requested"]), None)
    active_order_data = None
    if active_order:
        active_order_data = {
            "order_id": active_order.id,
            "order_no": active_order.order_no,
            "status": active_order.status,
            "subtotal": active_order.subtotal,
            "grand_total": active_order.grand_total,
            "items": [
                {
                    "id": it.id,
                    "product_name": it.product_name,
                    "quantity": it.quantity,
                    "total_price": it.total_price,
                    "status": it.status
                } for it in active_order.items if not it.is_voided
            ]
        }

    # Fetch all categories and available products
    cat_stmt = select(Category).options(
        selectinload(Category.products).selectinload(Product.variants),
        selectinload(Category.products).selectinload(Product.modifier_groups).selectinload(ModifierGroup.options)
    ).order_by(Category.order_index)
    c_res = await db.execute(cat_stmt)
    categories = c_res.scalars().all()

    menu_tree = []
    for cat in categories:
        prods = []
        for p in cat.products:
            if not p.is_available:
                continue
            prods.append({
                "id": p.id,
                "name": p.name,
                "description": p.description,
                "base_price": p.base_price,
                "image_url": p.image_url,
                "calories": p.calories,
                "allergens": p.allergens or [],
                "is_vegan": p.is_vegan,
                "is_spicy": p.is_spicy,
                "variants": [{"id": v.id, "name": v.name, "price_delta": v.price_delta} for v in p.variants],
                "modifier_groups": [
                    {
                        "id": mg.id,
                        "name": mg.name,
                        "is_required": mg.is_required,
                        "options": [{"id": opt.id, "name": opt.name, "price": opt.price} for opt in mg.options]
                    } for mg in p.modifier_groups
                ]
            })
        menu_tree.append({
            "id": cat.id,
            "name": cat.name,
            "icon": cat.icon,
            "products": prods
        })

    return {
        "table_id": table.id,
        "table_name": table.name,
        "status": table.status,
        "active_order": active_order_data,
        "menu": menu_tree
    }

@router.post("/table/{table_id}/order")
async def place_customer_table_order(table_id: int, payload: AddItemsRequest, db: AsyncSession = Depends(get_db)):
    """
    Customer places order directly from table QR menu.
    Automatically attaches to table order and broadcasts to POS & KDS.
    """
    t_stmt = select(Table).where(Table.id == table_id).options(selectinload(Table.orders).selectinload(Order.items))
    t_res = await db.execute(t_stmt)
    table = t_res.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Masa bulunamadı.")

    order = next((o for o in table.orders if o.status in ["open", "bill_requested"]), None)
    if not order:
        order_no = f"QR-{datetime.utcnow().strftime('%Y%m%d')}-{table.id}-{int(datetime.utcnow().timestamp())%1000}"
        order = Order(
            order_no=order_no,
            table_id=table.id,
            order_type="qr_order",
            status="open",
            waiter_name="QR Masadan Sipariş",
            created_at=datetime.utcnow()
        )
        db.add(order)
        await db.flush()
        table.status = "occupied"
        table.opened_at = datetime.utcnow()
        table.current_order_id = order.id
        table.waiter_name = "QR Sipariş"

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
            kitchen_note=f"[QR Müşteri Notu] {it.kitchen_note or ''}".strip(),
            course_stage=1,
            is_hold=False,
            status="pending",
            station=station,
            created_at=datetime.utcnow()
        )
        db.add(order_item)
        await StockService.deduct_order_ingredients(db, it.product_id, it.quantity, order.order_no)

    order.subtotal += added_amount
    order.grand_total = max(0.0, order.subtotal - order.discount_amount - order.treat_amount + order.kuver_total)
    order.remaining_total = max(0.0, order.grand_total - order.paid_total)

    await db.commit()

    # Alerts to POS and KDS
    await ws_hub.broadcast_to_channel("pos", "QR_ORDER_RECEIVED", {
        "table_name": table.name,
        "order_no": order.order_no,
        "total": added_amount
    })
    await ws_hub.broadcast_to_channel("kds", "KDS_NEW_ORDER", {"order_id": order.id, "order_no": order.order_no})
    await ws_hub.broadcast_to_table(table.id, "TABLE_ORDER_UPDATED", {"order_id": order.id})

    return {"status": "success", "message": "Siparişiniz mutfağa iletildi!", "order_id": order.id}
