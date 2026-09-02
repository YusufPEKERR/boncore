from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from datetime import datetime
from app.database import get_db
from app.models.product import Ingredient, Recipe, Product
from app.models.inventory import Warehouse, WarehouseStock, StockMovement
from app.schemas.all import StockTransferRequest, PurchaseInvoiceRequest

router = APIRouter(prefix="/inventory", tags=["Inventory & Recipes"])

@router.get("/ingredients")
async def get_ingredients(db: AsyncSession = Depends(get_db)):
    """
    Returns list of all raw ingredients, current stock levels, and critical alert warnings.
    """
    stmt = select(Ingredient).order_by(Ingredient.name.asc())
    res = await db.execute(stmt)
    ingredients = res.scalars().all()

    return [
        {
            "id": ing.id,
            "name": ing.name,
            "unit": ing.unit,
            "cost_per_unit": ing.cost_per_unit,
            "current_stock": ing.current_stock,
            "min_stock_alert": ing.min_stock_alert,
            "warehouse_id": ing.warehouse_id,
            "is_critical": ing.current_stock <= ing.min_stock_alert
        } for ing in ingredients
    ]

@router.get("/recipes")
async def get_all_recipes(db: AsyncSession = Depends(get_db)):
    """
    Returns Bill of Materials (BOM) recipes for all menu items.
    """
    stmt = select(Product).options(
        selectinload(Product.recipes).selectinload(Recipe.ingredient)
    ).order_by(Product.name.asc())
    res = await db.execute(stmt)
    products = res.scalars().all()

    output = []
    for p in products:
        recipes_data = []
        estimated_cost = 0.0
        for r in p.recipes:
            cost = r.amount * (r.ingredient.cost_per_unit if r.ingredient else 0.0)
            estimated_cost += cost
            recipes_data.append({
                "id": r.id,
                "ingredient_id": r.ingredient_id,
                "ingredient_name": r.ingredient.name if r.ingredient else "Hammadde",
                "amount": r.amount,
                "unit": r.ingredient.unit if r.ingredient else "gr",
                "waste_percentage": r.waste_percentage,
                "cost": round(cost, 2)
            })

        output.append({
            "product_id": p.id,
            "product_name": p.name,
            "base_price": p.base_price,
            "estimated_cost": round(estimated_cost, 2),
            "profit_margin": round(((p.base_price - estimated_cost) / p.base_price) * 100, 1) if p.base_price > 0 else 0,
            "recipes": recipes_data
        })

    return output

@router.post("/transfer")
async def transfer_stock(payload: StockTransferRequest, db: AsyncSession = Depends(get_db)):
    """
    Transfers raw ingredient stock between warehouses (e.g. Ana Depo -> Mutfak Deposu).
    """
    stmt = select(Ingredient).where(Ingredient.id == payload.ingredient_id)
    res = await db.execute(stmt)
    ing = res.scalar_one_or_none()
    if not ing:
        raise HTTPException(status_code=404, detail="Hammadde bulunamadı.")

    movement = StockMovement(
        movement_type="transfer",
        ingredient_id=ing.id,
        source_warehouse_id=payload.source_warehouse_id,
        target_warehouse_id=payload.target_warehouse_id,
        amount=payload.amount,
        unit=ing.unit,
        cost_price=ing.cost_per_unit,
        notes=payload.notes or "Depolar arası transfer",
        created_by=payload.created_by,
        created_at=datetime.utcnow()
    )
    db.add(movement)
    await db.commit()

    return {"status": "success", "message": f"{payload.amount} {ing.unit} {ing.name} transfer edildi."}

@router.post("/purchase-invoice")
async def enter_purchase_invoice(payload: PurchaseInvoiceRequest, db: AsyncSession = Depends(get_db)):
    """
    Enters supplier purchase invoice and increments stock levels.
    """
    for item in payload.items:
        stmt = select(Ingredient).where(Ingredient.id == item.ingredient_id)
        res = await db.execute(stmt)
        ing = res.scalar_one_or_none()
        if ing:
            ing.current_stock += item.quantity
            ing.cost_per_unit = item.unit_price

            movement = StockMovement(
                movement_type="purchase_invoice",
                ingredient_id=ing.id,
                target_warehouse_id=item.target_warehouse_id,
                amount=item.quantity,
                unit=ing.unit,
                cost_price=item.unit_price,
                reference_no=payload.invoice_no,
                notes=f"Tedarikçi: {payload.supplier_name}",
                created_by=payload.created_by,
                created_at=datetime.utcnow()
            )
            db.add(movement)

    await db.commit()
    return {"status": "success", "message": f"{payload.invoice_no} no'lu irsaliye stoğa işlendi."}
