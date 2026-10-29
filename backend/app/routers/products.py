import math
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from app.database import get_db
from app.models.product import Category, Product, ProductVariant, ModifierGroup, ModifierOption, Ingredient, Recipe
from app.models.order import OrderItem
from app.schemas.all import ProductDetailResponse, ProductVariantSchema, ModifierGroupSchema, ModifierOptionSchema
from app.websocket_hub import ws_hub

router = APIRouter(prefix="/products", tags=["Products & Menu"])

def calculate_bom_stock(prod_name: str, recipes: list) -> tuple[float, list, list]:
    """
    Reçetesi (BOM) olan ürünlerde:
    Her hammaddenin (Mevcut Stok / Reçetede Kullanılan Miktar) oranını hesaplar,
    en düşük oranı (darboğaz hammaddeyi) ürünün üretilebilir stok miktarı olarak döndürür.
    Ayrıca stoğu biten / yetersiz kalan hammaddeleri listeler.
    """
    bom_rows = [
        r for r in (recipes or [])
        if r.ingredient is not None
        and float(r.amount or 0.0) > 0
        and not (
            (r.ingredient.name or "").strip().lower() == (prod_name or "").strip().lower()
            and float(r.amount or 0.0) == 1.0
            and len(recipes) == 1
        )
    ]
    if not bom_rows:
        return -1.0, [], []

    recipe_items = []
    missing_ingredients = []
    ratios = []

    for r in bom_rows:
        ing = r.ingredient
        ing_stock = round(float(ing.current_stock or 0.0), 3)
        used_amt = float(r.amount or 0.0)
        producible = int(math.floor(max(0.0, ing_stock) / used_amt)) if used_amt > 0 else 0
        ratios.append(producible)

        item_info = {
            "ingredient_id": ing.id,
            "ingredient_name": (ing.name or "").strip(),
            "amount": used_amt,
            "unit": ing.unit or "Adet",
            "current_stock": ing_stock,
            "producible_count": producible
        }
        recipe_items.append(item_info)
        if ing_stock <= 0 or ing_stock < used_amt:
            missing_ingredients.append(item_info)

    calc_stock = float(min(ratios)) if ratios else 0.0
    return calc_stock, recipe_items, missing_ingredients


@router.get("/categories")
async def get_categories_with_products(
    all_items: bool = Query(True),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns full menu tree: Categories -> Products -> Variants, Modifier Groups & Real/BOM Stock Info.
    """
    stmt = select(Category).options(
        selectinload(Category.products).selectinload(Product.variants),
        selectinload(Category.products).selectinload(Product.modifier_groups).selectinload(ModifierGroup.options),
        selectinload(Category.products).selectinload(Product.recipes).selectinload(Recipe.ingredient)
    ).order_by(Category.order_index)

    result = await db.execute(stmt)
    categories = result.scalars().all()

    ing_res = await db.execute(select(Ingredient))
    all_ings = {(i.name or "").strip().lower(): i for i in ing_res.scalars().all()}

    output = []
    dirty_ings = False

    for cat in sorted(categories, key=lambda c: (c.order_index if c.order_index is not None else 0, c.id)):
        prods = []
        sorted_cat_products = sorted(
            cat.products or [],
            key=lambda p: (p.order_index if p.order_index is not None else 0, p.id)
        )
        for p in sorted_cat_products:
            if not all_items and not p.is_available:
                continue

            stock_qty = 0.0
            unit_label = "Adet"
            direct_ing = all_ings.get((p.name or "").strip().lower())
            if direct_ing and direct_ing.unit:
                unit_label = direct_ing.unit

            calc_bom_stock, recipe_items, missing_ingredients = calculate_bom_stock(p.name, p.recipes)
            has_recipe = len(recipe_items) > 0

            if has_recipe:
                stock_qty = calc_bom_stock
                unit_label = "Adet"
                if direct_ing is not None and float(direct_ing.current_stock or 0.0) != stock_qty:
                    direct_ing.current_stock = stock_qty
                    dirty_ings = True
            elif direct_ing is not None:
                stock_qty = round(float(direct_ing.current_stock or 0.0), 3)
                unit_label = direct_ing.unit or "Adet"

            prods.append({
                "id": p.id,
                "category_id": p.category_id,
                "name": p.name,
                "description": p.description,
                "base_price": p.base_price,
                "plu_code": p.plu_code,
                "barcode": p.barcode,
                "vat_rate": p.vat_rate,
                "station": p.station or "kitchen",
                "order_index": p.order_index if p.order_index is not None else 0,
                "unit": unit_label,
                "stock_quantity": stock_qty,
                "has_recipe": has_recipe,
                "recipe_items": recipe_items,
                "missing_ingredients": missing_ingredients,
                "image_url": p.image_url,
                "calories": p.calories,
                "allergens": p.allergens or [],
                "is_vegan": p.is_vegan,
                "is_spicy": p.is_spicy,
                "is_available": bool(p.is_available if p.is_available is not None else True),
                "show_in_pos": bool(p.show_in_pos if p.show_in_pos is not None else True),
                "variants": [
                    {
                        "id": v.id,
                        "name": v.name,
                        "price_delta": v.price_delta,
                        "is_default": v.is_default
                    } for v in p.variants
                ],
                "modifier_groups": [
                    {
                        "id": mg.id,
                        "name": mg.name,
                        "is_required": mg.is_required,
                        "min_selection": mg.min_selection,
                        "max_selection": mg.max_selection,
                        "options": [
                            {"id": opt.id, "name": opt.name, "price": opt.price}
                            for opt in mg.options
                        ]
                    } for mg in p.modifier_groups
                ]
            })
        output.append({
            "id": cat.id,
            "name": cat.name,
            "icon": cat.icon,
            "color": cat.color,
            "order_index": cat.order_index,
            "target_station": cat.target_station,
            "show_in_pos": bool(cat.show_in_pos if cat.show_in_pos is not None else True),
            "products": prods
        })

    if dirty_ings:
        await db.commit()

    return output

@router.get("/search")
async def search_products(q: str = Query(..., min_length=1), db: AsyncSession = Depends(get_db)):
    """
    Fast search by name, PLU code (e.g. #101) or barcode.
    """
    clean_q = q.strip().replace("#", "")
    stmt = select(Product).options(
        selectinload(Product.variants),
        selectinload(Product.modifier_groups).selectinload(ModifierGroup.options)
    ).where(
        (Product.name.ilike(f"%{clean_q}%")) |
        (Product.plu_code == clean_q) |
        (Product.barcode == clean_q)
    )
    result = await db.execute(stmt)
    products = result.scalars().all()

    return [
        {
            "id": p.id,
            "category_id": p.category_id,
            "name": p.name,
            "base_price": p.base_price,
            "plu_code": p.plu_code,
            "barcode": p.barcode,
            "station": p.station,
            "is_available": p.is_available if p.is_available is not None else True,
            "variants": [{"id": v.id, "name": v.name, "price_delta": v.price_delta} for v in p.variants],
            "modifier_groups": [
                {
                    "id": mg.id,
                    "name": mg.name,
                    "options": [{"id": opt.id, "name": opt.name, "price": opt.price} for opt in mg.options]
                } for mg in p.modifier_groups
            ]
        } for p in products
    ]

@router.post("/categories")
async def create_category(payload: dict, db: AsyncSession = Depends(get_db)):
    new_cat = Category(
        name=(payload.get("name") or "").strip().upper(),
        icon=payload.get("icon", "Utensils"),
        color=payload.get("color", "#f97316"),
        order_index=payload.get("order_index", 99),
        target_station=payload.get("target_station", "kitchen"),
        show_in_pos=bool(payload.get("show_in_pos", True))
    )
    db.add(new_cat)
    await db.commit()
    await db.refresh(new_cat)
    await ws_hub.broadcast_all("MENU_UPDATED", {"category_id": new_cat.id})
    return {"status": "success", "category_id": new_cat.id}

@router.put("/categories/{cat_id}")
async def update_category(cat_id: int, payload: dict, db: AsyncSession = Depends(get_db)):
    stmt = select(Category).where(Category.id == cat_id)
    res = await db.execute(stmt)
    cat = res.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Kategori bulunamadı.")

    if "name" in payload and payload["name"]:
        cat.name = str(payload["name"]).strip().upper()
    if "icon" in payload:
        cat.icon = payload["icon"]
    if "color" in payload:
        cat.color = payload["color"]
    if "order_index" in payload:
        cat.order_index = int(payload["order_index"])
    if "target_station" in payload:
        cat.target_station = payload["target_station"]
    if "show_in_pos" in payload:
        cat.show_in_pos = bool(payload["show_in_pos"])

    await db.commit()
    await ws_hub.broadcast_all("MENU_UPDATED", {"category_id": cat.id})
    return {"status": "success", "category_id": cat.id}

@router.put("/categories-reorder")
async def reorder_categories(payload: dict, db: AsyncSession = Depends(get_db)):
    category_ids = payload.get("category_ids") or []
    if not isinstance(category_ids, list):
        raise HTTPException(status_code=400, detail="Geçersiz kategori sıralama listesi.")

    res = await db.execute(select(Category))
    cats_map = {c.id: c for c in res.scalars().all()}
    for idx, cid in enumerate(category_ids):
        cat_obj = cats_map.get(int(cid))
        if cat_obj is not None:
            cat_obj.order_index = idx

    await db.commit()
    await ws_hub.broadcast_all("MENU_UPDATED", {"reordered": "categories"})
    return {"status": "success"}

@router.put("/items-reorder")
async def reorder_products(payload: dict, db: AsyncSession = Depends(get_db)):
    product_ids = payload.get("product_ids") or []
    if not isinstance(product_ids, list):
        raise HTTPException(status_code=400, detail="Geçersiz ürün sıralama listesi.")

    res = await db.execute(select(Product).where(Product.id.in_([int(pid) for pid in product_ids if pid is not None])))
    prods_map = {p.id: p for p in res.scalars().all()}
    for idx, pid in enumerate(product_ids):
        p_obj = prods_map.get(int(pid))
        if p_obj is not None:
            p_obj.order_index = idx

    await db.commit()
    await ws_hub.broadcast_all("MENU_UPDATED", {"reordered": "products"})
    return {"status": "success"}

@router.delete("/categories/{cat_id}")
async def delete_category(cat_id: int, db: AsyncSession = Depends(get_db)):
    stmt = select(Category).where(Category.id == cat_id).options(selectinload(Category.products))
    res = await db.execute(stmt)
    cat = res.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Kategori bulunamadı.")

    ing_res = await db.execute(select(Ingredient).where(Ingredient.category_name.ilike(cat.name.strip())))
    for ing in ing_res.scalars().all():
        await db.delete(ing)

    await db.delete(cat)
    await db.commit()
    await ws_hub.broadcast_all("MENU_UPDATED", {"category_id": cat_id})
    return {"status": "success", "message": "Kategori ve bağlı stok kalemleri silindi."}

@router.post("/items")
async def create_product(payload: dict, db: AsyncSession = Depends(get_db)):
    new_prod = Product(
        category_id=payload.get("category_id"),
        name=(payload.get("name") or "").strip(),
        description=payload.get("description"),
        base_price=float(payload.get("base_price") or 0.0),
        plu_code=payload.get("plu_code"),
        barcode=payload.get("barcode"),
        station=payload.get("station", "kitchen"),
        is_available=bool(payload.get("is_available", True)),
        show_in_pos=bool(payload.get("show_in_pos", True))
    )
    db.add(new_prod)
    await db.flush()

    # Ensure matching Ingredient exists in stock report (without adding a fake self-recipe row)
    if new_prod.name:
        cat_res = await db.execute(select(Category).where(Category.id == new_prod.category_id))
        cat_obj = cat_res.scalar_one_or_none()
        cat_label = (cat_obj.name.upper() if cat_obj and cat_obj.name else "DİĞER")

        ing_chk = await db.execute(select(Ingredient).where(Ingredient.name.ilike(new_prod.name.strip())))
        existing_ing = ing_chk.scalars().first()
        if not existing_ing:
            new_ing = Ingredient(
                product_code=new_prod.plu_code or "",
                category_name=cat_label,
                name=new_prod.name.strip(),
                kitchen_group="İÇECEK" if new_prod.station == "bar" else "MUTFAK",
                revenue_center="Ana Kanal",
                unit=payload.get("unit") or "Adet",
                cost_per_unit=float(new_prod.base_price or 0.0),
                current_stock=float(payload.get("stock_quantity") if payload.get("stock_quantity") is not None else 0.0),
                min_stock_alert=0.0,
                warehouse_id=3 if new_prod.station == "bar" else 2
            )
            db.add(new_ing)
        else:
            existing_ing.category_name = cat_label
            existing_ing.cost_per_unit = float(new_prod.base_price or 0.0)
            if payload.get("stock_quantity") is not None:
                existing_ing.current_stock = float(payload.get("stock_quantity"))

    await db.commit()
    await db.refresh(new_prod)
    await ws_hub.broadcast_all("MENU_UPDATED", {"product_id": new_prod.id})
    return {"status": "success", "product_id": new_prod.id}

@router.put("/items/{prod_id}")
async def update_product(prod_id: int, payload: dict, db: AsyncSession = Depends(get_db)):
    stmt = select(Product).where(Product.id == prod_id).options(selectinload(Product.recipes).selectinload(Recipe.ingredient))
    res = await db.execute(stmt)
    prod = res.scalar_one_or_none()
    if not prod:
        raise HTTPException(status_code=404, detail="Ürün bulunamadı.")

    old_name = (prod.name or "").strip()
    if "name" in payload: prod.name = str(payload["name"]).strip()
    if "description" in payload: prod.description = payload["description"]
    if "base_price" in payload: prod.base_price = float(payload["base_price"])
    if "category_id" in payload: prod.category_id = int(payload["category_id"])
    if "station" in payload: prod.station = payload["station"]
    if "plu_code" in payload: prod.plu_code = payload["plu_code"]
    if "barcode" in payload: prod.barcode = payload["barcode"]
    if "is_available" in payload: prod.is_available = bool(payload["is_available"])
    if "show_in_pos" in payload: prod.show_in_pos = bool(payload["show_in_pos"])

    # Sync ONLY with the product's own direct Ingredient card (matched by product name, never overwriting BOM ingredients!)
    linked_ing = None
    if old_name:
        ing_chk = await db.execute(select(Ingredient).where(Ingredient.name.ilike(old_name)))
        linked_ing = ing_chk.scalars().first()
    if not linked_ing and prod.name:
        ing_chk = await db.execute(select(Ingredient).where(Ingredient.name.ilike(prod.name)))
        linked_ing = ing_chk.scalars().first()

    calc_bom_stock, recipe_items, _ = calculate_bom_stock(prod.name, prod.recipes)

    if linked_ing:
        if "name" in payload and payload["name"]:
            linked_ing.name = str(payload["name"]).strip()
        if "base_price" in payload:
            linked_ing.cost_per_unit = float(payload["base_price"])
        if "category_id" in payload:
            cat_res = await db.execute(select(Category).where(Category.id == int(payload["category_id"])))
            cat_obj = cat_res.scalar_one_or_none()
            if cat_obj:
                linked_ing.category_name = cat_obj.name.upper()
        if "plu_code" in payload:
            linked_ing.product_code = payload["plu_code"] or ""
        if len(recipe_items) > 0:
            linked_ing.current_stock = calc_bom_stock
        elif "stock_quantity" in payload and payload["stock_quantity"] is not None:
            linked_ing.current_stock = float(payload["stock_quantity"])
        if "unit" in payload and payload["unit"]:
            linked_ing.unit = str(payload["unit"]).strip()

    await db.commit()
    await ws_hub.broadcast_all("MENU_UPDATED", {"product_id": prod.id})
    return {"status": "success", "message": "Ürün ve stok kartı güncellendi."}

@router.delete("/items/{prod_id}")
async def delete_product(prod_id: int, db: AsyncSession = Depends(get_db)):
    stmt = select(Product).where(Product.id == prod_id).options(selectinload(Product.recipes).selectinload(Recipe.ingredient))
    res = await db.execute(stmt)
    prod = res.scalar_one_or_none()
    if not prod:
        raise HTTPException(status_code=404, detail="Ürün bulunamadı.")

    linked_ing = None
    if prod.name:
        ing_chk = await db.execute(select(Ingredient).where(Ingredient.name.ilike(prod.name.strip())))
        linked_ing = ing_chk.scalars().first()

    order_items_check = await db.execute(select(OrderItem.id).where(OrderItem.product_id == prod_id).limit(1))
    if order_items_check.scalar_one_or_none():
        prod.is_available = False
        if linked_ing:
            linked_ing.current_stock = 0.0
        await db.commit()
        await ws_hub.broadcast_all("MENU_UPDATED", {"product_id": prod_id})
        return {"status": "archived", "message": "Geçmiş sipariş kaydı olduğu için ürün pasife alındı ve stoğu sıfırlandı."}

    for r in (prod.recipes or []):
        await db.delete(r)
    if linked_ing:
        await db.delete(linked_ing)
    await db.delete(prod)
    await db.commit()
    await ws_hub.broadcast_all("MENU_UPDATED", {"product_id": prod_id})
    return {"status": "success", "message": "Ürün ve bağlı stok kartı tamamen silindi."}
