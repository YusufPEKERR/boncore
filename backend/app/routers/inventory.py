from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from datetime import datetime
from app.database import get_db
from app.models.product import Category, Ingredient, Recipe, Product
from app.models.order import OrderItem
from app.models.inventory import Warehouse, WarehouseStock, StockMovement
from app.schemas.all import StockTransferRequest, PurchaseInvoiceRequest
from app.websocket_hub import ws_hub

router = APIRouter(prefix="/inventory", tags=["Inventory & Recipes"])


def serialize_ingredient(ing: Ingredient) -> dict:
    stock = round(float(ing.current_stock or 0.0), 3)
    unit_cost = round(float(ing.cost_per_unit or 0.0), 2)
    min_alert = float(ing.min_stock_alert or 0.0)
    total_val = round(stock * unit_cost, 2)

    if min_alert > 0:
        crit_display = str(int(min_alert)) if min_alert.is_integer() else str(min_alert)
    else:
        crit_display = "-"

    is_out = stock <= 0
    is_crit = is_out or (min_alert > 0 and stock <= min_alert)

    return {
        "id": ing.id,
        "product_code": ing.product_code or "",
        "category": (ing.category_name or "DİĞER").strip(),
        "category_name": (ing.category_name or "DİĞER").strip(),
        "name": (ing.name or "").strip(),
        "kitchen_group": (ing.kitchen_group or "MUTFAK").strip(),
        "revenue_center": (ing.revenue_center or "Ana Kanal").strip(),
        "unit": ing.unit or "Adet",
        "cost_per_unit": unit_cost,
        "current_stock": stock,
        "min_stock_alert": min_alert,
        "critical_display": crit_display,
        "total_value": total_val,
        "warehouse_id": ing.warehouse_id or 1,
        "is_out_of_stock": is_out,
        "is_critical": is_crit,
    }


async def _find_or_create_category(db: AsyncSession, cat_name: str, k_group: str = "MUTFAK") -> Category:
    clean_cat = (cat_name or "DİĞER").strip().upper()
    res = await db.execute(select(Category).where(Category.name.ilike(clean_cat)))
    cat = res.scalars().first()
    if cat:
        return cat

    station = "bar" if k_group in ("BAR", "İÇECEK") else "kitchen"
    new_cat = Category(
        name=clean_cat,
        icon="Utensils",
        color="#f97316",
        order_index=99,
        target_station=station
    )
    db.add(new_cat)
    await db.flush()
    return new_cat


@router.get("/ingredients")
async def get_ingredients(db: AsyncSession = Depends(get_db)):
    """
    Returns list of all raw ingredients and products with their category, kitchen group,
    current stock levels, unit costs, total inventory value, and critical alert warnings.
    """
    stmt = select(Ingredient).order_by(Ingredient.name.asc())
    res = await db.execute(stmt)
    ingredients = res.scalars().all()
    return [serialize_ingredient(ing) for ing in ingredients]


@router.post("/ingredients")
async def create_ingredient(payload: dict, db: AsyncSession = Depends(get_db)):
    """
    Creates a new stock item in the inventory table and syncs it to POS products.
    """
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Ürün adı zorunludur.")

    k_group = (payload.get("kitchen_group") or "MUTFAK").strip().upper()
    cat_label = (payload.get("category_name") or payload.get("category") or "DİĞER").strip().upper()
    wh_id = payload.get("warehouse_id")
    if not wh_id:
        wh_id = 3 if k_group in ("BAR", "İÇECEK") else (1 if k_group in ("DEPO", "AMBALAJ", "DETERJAN", "KURU GIDA") else 2)

    crit_raw = payload.get("min_stock_alert", 0)
    if crit_raw in ("-", "", None):
        min_alert = 0.0
    else:
        try:
            min_alert = float(crit_raw)
        except Exception:
            min_alert = 0.0

    unit_cost = float(payload.get("cost_per_unit") or 0.0)
    unit_str = (payload.get("unit") or "Adet").strip()
    p_code = (payload.get("product_code") or "").strip()

    new_ing = Ingredient(
        product_code=p_code,
        category_name=cat_label,
        name=name,
        kitchen_group=k_group,
        revenue_center=(payload.get("revenue_center") or "Ana Kanal").strip(),
        unit=unit_str,
        cost_per_unit=unit_cost,
        current_stock=float(payload.get("current_stock") or 0.0),
        min_stock_alert=min_alert,
        warehouse_id=int(wh_id),
    )
    db.add(new_ing)
    await db.flush()

    # Sync to POS Category & Product
    cat_obj = await _find_or_create_category(db, cat_label, k_group)
    prod_chk = await db.execute(select(Product).where(Product.name.ilike(name)))
    existing_prod = prod_chk.scalars().first()
    if not existing_prod:
        station = "bar" if k_group in ("BAR", "İÇECEK") else "kitchen"
        new_prod = Product(
            category_id=cat_obj.id,
            name=name,
            description=f"{cat_label} • {k_group} ({unit_str})",
            base_price=unit_cost,
            plu_code=p_code or str(1000 + new_ing.id),
            barcode=f"869{10000 + new_ing.id}",
            vat_rate=10.0,
            station=station,
            is_available=True
        )
        db.add(new_prod)
        await db.flush()
        db.add(Recipe(product_id=new_prod.id, ingredient_id=new_ing.id, amount=1.0, waste_percentage=0.0))

    await db.commit()
    await db.refresh(new_ing)
    await ws_hub.broadcast_all("MENU_UPDATED", {"ingredient_id": new_ing.id})
    return {"status": "success", "item": serialize_ingredient(new_ing)}


@router.put("/ingredients/{ing_id}")
async def update_ingredient(ing_id: int, payload: dict, db: AsyncSession = Depends(get_db)):
    """
    Updates an existing stock item and syncs changes to the corresponding POS product.
    """
    stmt = select(Ingredient).where(Ingredient.id == ing_id)
    res = await db.execute(stmt)
    ing = res.scalar_one_or_none()
    if not ing:
        raise HTTPException(status_code=404, detail="Stok kalemi bulunamadı.")

    old_name = (ing.name or "").strip()

    if "product_code" in payload:
        ing.product_code = str(payload["product_code"] or "").strip()
    if "category_name" in payload or "category" in payload:
        ing.category_name = str(payload.get("category_name") or payload.get("category") or "DİĞER").strip().upper()
    if "name" in payload and str(payload["name"]).strip():
        ing.name = str(payload["name"]).strip()
    if "kitchen_group" in payload:
        ing.kitchen_group = str(payload["kitchen_group"] or "MUTFAK").strip().upper()
    if "revenue_center" in payload:
        ing.revenue_center = str(payload["revenue_center"] or "Ana Kanal").strip()
    if "unit" in payload and str(payload["unit"]).strip():
        ing.unit = str(payload["unit"]).strip()
    if "cost_per_unit" in payload:
        ing.cost_per_unit = float(payload["cost_per_unit"] or 0.0)
    if "current_stock" in payload:
        ing.current_stock = float(payload["current_stock"] or 0.0)
    if "min_stock_alert" in payload:
        crit_raw = payload["min_stock_alert"]
        if crit_raw in ("-", "", None):
            ing.min_stock_alert = 0.0
        else:
            try:
                ing.min_stock_alert = float(crit_raw)
            except Exception:
                ing.min_stock_alert = 0.0
    if "warehouse_id" in payload and payload["warehouse_id"]:
        ing.warehouse_id = int(payload["warehouse_id"])

    # Sync changes to linked POS Product
    rec_res = await db.execute(select(Recipe).where(Recipe.ingredient_id == ing.id))
    rec = rec_res.scalars().first()
    linked_prod = None
    if rec:
        p_res = await db.execute(select(Product).where(Product.id == rec.product_id))
        linked_prod = p_res.scalar_one_or_none()
    if not linked_prod and old_name:
        p_res = await db.execute(select(Product).where(Product.name.ilike(old_name)))
        linked_prod = p_res.scalars().first()

    if linked_prod:
        linked_prod.name = ing.name
        linked_prod.base_price = float(ing.cost_per_unit or 0.0)
        if ing.product_code:
            linked_prod.plu_code = ing.product_code
        cat_obj = await _find_or_create_category(db, ing.category_name, ing.kitchen_group)
        linked_prod.category_id = cat_obj.id

    await db.commit()
    await db.refresh(ing)
    await ws_hub.broadcast_all("MENU_UPDATED", {"ingredient_id": ing.id})
    return {"status": "success", "item": serialize_ingredient(ing)}


@router.delete("/ingredients/{ing_id}")
async def delete_ingredient(ing_id: int, db: AsyncSession = Depends(get_db)):
    stmt = select(Ingredient).where(Ingredient.id == ing_id)
    res = await db.execute(stmt)
    ing = res.scalar_one_or_none()
    if not ing:
        raise HTTPException(status_code=404, detail="Stok kalemi bulunamadı.")

    # Also remove or archive linked POS Product
    rec_res = await db.execute(select(Recipe).where(Recipe.ingredient_id == ing.id))
    recs = rec_res.scalars().all()
    for r in recs:
        p_res = await db.execute(select(Product).where(Product.id == r.product_id))
        p_obj = p_res.scalar_one_or_none()
        await db.delete(r)
        if p_obj:
            oi_chk = await db.execute(select(OrderItem.id).where(OrderItem.product_id == p_obj.id).limit(1))
            if oi_chk.scalar_one_or_none():
                p_obj.is_available = False
            else:
                await db.delete(p_obj)

    await db.delete(ing)
    await db.commit()
    await ws_hub.broadcast_all("MENU_UPDATED", {"ingredient_id": ing_id})
    return {"status": "success", "message": "Stok kalemi ve POS ürünü silindi."}


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


@router.get("/recipes/{product_id}")
async def get_product_recipe(product_id: int, db: AsyncSession = Depends(get_db)):
    """
    Returns recipe BOM for a specific product.
    """
    stmt = select(Product).options(
        selectinload(Product.recipes).selectinload(Recipe.ingredient)
    ).where(Product.id == product_id)
    res = await db.execute(stmt)
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Ürün bulunamadı.")

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

    return {
        "product_id": p.id,
        "product_name": p.name,
        "base_price": p.base_price,
        "estimated_cost": round(estimated_cost, 2),
        "profit_margin": round(((p.base_price - estimated_cost) / p.base_price) * 100, 1) if p.base_price > 0 else 0,
        "recipes": recipes_data
    }


@router.put("/recipes/{product_id}")
async def update_product_recipe(product_id: int, payload: dict, db: AsyncSession = Depends(get_db)):
    """
    Replaces/updates the recipe ingredients for a given product.
    Payload: { "items": [ { "ingredient_id": 1, "amount": 180, "waste_percentage": 10 } ] }
    """
    stmt = select(Product).where(Product.id == product_id)
    res = await db.execute(stmt)
    prod = res.scalar_one_or_none()
    if not prod:
        raise HTTPException(status_code=404, detail="Ürün bulunamadı.")

    # Remove old recipe entries for this product
    del_stmt = select(Recipe).where(Recipe.product_id == product_id)
    old_recipes = (await db.execute(del_stmt)).scalars().all()
    for r in old_recipes:
        await db.delete(r)

    # Insert new recipe items
    items = payload.get("items", [])
    for item in items:
        ing_id = item.get("ingredient_id")
        amount = float(item.get("amount") or 0.0)
        waste = float(item.get("waste_percentage") or 0.0)
        if ing_id and amount > 0:
            db.add(Recipe(
                product_id=product_id,
                ingredient_id=int(ing_id),
                amount=amount,
                waste_percentage=waste
            ))

    await db.commit()
    await ws_hub.broadcast_all("MENU_UPDATED", {"product_id": product_id})

    # Return refreshed recipe
    return await get_product_recipe(product_id, db)


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

    ing.warehouse_id = payload.target_warehouse_id

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
    await ws_hub.broadcast_all("MENU_UPDATED", {"ingredient_id": ing.id})

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
            price = item.get_unit_price()
            ing.current_stock = round((ing.current_stock or 0.0) + item.quantity, 3)
            if price > 0:
                ing.cost_per_unit = price
                rec_res = await db.execute(select(Recipe).where(Recipe.ingredient_id == ing.id))
                rec = rec_res.scalars().first()
                if rec:
                    p_res = await db.execute(select(Product).where(Product.id == rec.product_id))
                    p_obj = p_res.scalar_one_or_none()
                    if p_obj:
                        p_obj.base_price = price

            movement = StockMovement(
                movement_type="purchase_invoice",
                ingredient_id=ing.id,
                target_warehouse_id=item.target_warehouse_id,
                amount=item.quantity,
                unit=ing.unit,
                cost_price=price,
                reference_no=payload.invoice_no,
                notes=f"Tedarikçi: {payload.get_supplier()}",
                created_by=payload.created_by,
                created_at=datetime.utcnow()
            )
            db.add(movement)

    await db.commit()
    await ws_hub.broadcast_all("MENU_UPDATED", {"invoice_no": payload.invoice_no})
    return {"status": "success", "message": f"{payload.invoice_no} no'lu irsaliye stoğa işlendi."}
