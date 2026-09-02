from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from app.database import get_db
from app.models.product import Category, Product, ProductVariant, ModifierGroup, ModifierOption, Ingredient, Recipe
from app.schemas.all import ProductDetailResponse, ProductVariantSchema, ModifierGroupSchema, ModifierOptionSchema

router = APIRouter(prefix="/products", tags=["Products & Menu"])

@router.get("/categories")
async def get_categories_with_products(db: AsyncSession = Depends(get_db)):
    """
    Returns full menu tree: Categories -> Products -> Variants & Modifier Groups.
    """
    stmt = select(Category).options(
        selectinload(Category.products).selectinload(Product.variants),
        selectinload(Category.products).selectinload(Product.modifier_groups).selectinload(ModifierGroup.options)
    ).order_by(Category.order_index)

    result = await db.execute(stmt)
    categories = result.scalars().all()

    output = []
    for cat in categories:
        prods = []
        for p in cat.products:
            if not p.is_available:
                continue
            prods.append({
                "id": p.id,
                "category_id": p.category_id,
                "name": p.name,
                "description": p.description,
                "base_price": p.base_price,
                "plu_code": p.plu_code,
                "barcode": p.barcode,
                "vat_rate": p.vat_rate,
                "station": p.station,
                "image_url": p.image_url,
                "calories": p.calories,
                "allergens": p.allergens or [],
                "is_vegan": p.is_vegan,
                "is_spicy": p.is_spicy,
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
            "products": prods
        })

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
        name=payload.get("name"),
        icon=payload.get("icon", "Utensils"),
        color=payload.get("color", "red"),
        order_index=payload.get("order_index", 0),
        target_station=payload.get("target_station", "kitchen")
    )
    db.add(new_cat)
    await db.commit()
    await db.refresh(new_cat)
    return {"status": "success", "category_id": new_cat.id}

@router.delete("/categories/{cat_id}")
async def delete_category(cat_id: int, db: AsyncSession = Depends(get_db)):
    stmt = select(Category).where(Category.id == cat_id)
    res = await db.execute(stmt)
    cat = res.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Kategori bulunamadı.")
    await db.delete(cat)
    await db.commit()
    return {"status": "success", "message": "Kategori silindi."}

@router.post("/items")
async def create_product(payload: dict, db: AsyncSession = Depends(get_db)):
    new_prod = Product(
        category_id=payload.get("category_id"),
        name=payload.get("name"),
        base_price=payload.get("base_price", 0.0),
        plu_code=payload.get("plu_code"),
        barcode=payload.get("barcode"),
        station=payload.get("station", "kitchen"),
        is_available=payload.get("is_available", True)
    )
    db.add(new_prod)
    await db.commit()
    await db.refresh(new_prod)
    return {"status": "success", "product_id": new_prod.id}

@router.put("/items/{prod_id}")
async def update_product(prod_id: int, payload: dict, db: AsyncSession = Depends(get_db)):
    stmt = select(Product).where(Product.id == prod_id)
    res = await db.execute(stmt)
    prod = res.scalar_one_or_none()
    if not prod:
        raise HTTPException(status_code=404, detail="Ürün bulunamadı.")

    if "name" in payload: prod.name = payload["name"]
    if "base_price" in payload: prod.base_price = payload["base_price"]
    if "category_id" in payload: prod.category_id = payload["category_id"]
    if "is_available" in payload: prod.is_available = payload["is_available"]

    await db.commit()
    return {"status": "success", "message": "Ürün güncellendi."}

@router.delete("/items/{prod_id}")
async def delete_product(prod_id: int, db: AsyncSession = Depends(get_db)):
    stmt = select(Product).where(Product.id == prod_id)
    res = await db.execute(stmt)
    prod = res.scalar_one_or_none()
    if not prod:
        raise HTTPException(status_code=404, detail="Ürün bulunamadı.")
    await db.delete(prod)
    await db.commit()
    return {"status": "success", "message": "Ürün silindi."}
