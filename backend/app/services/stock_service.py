import logging
import math
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.models.product import Recipe, Ingredient, Product
from app.models.inventory import StockMovement, WarehouseStock

logger = logging.getLogger("boncore.stock")

class StockService:
    @staticmethod
    async def deduct_order_ingredients(db: AsyncSession, product_id: int, quantity: float, order_no: str, warehouse_id: int = 2):
        """
        Deducts raw ingredients and semi-finished recipes from warehouse stock upon order sale/preparation.
        Recalculates BOM product stock (Stok / Kullanılan Malzeme) automatically.
        """
        stmt = select(Recipe).where(Recipe.product_id == product_id)
        result = await db.execute(stmt)
        recipes = result.scalars().all()

        p_res = await db.execute(select(Product).where(Product.id == product_id))
        prod = p_res.scalar_one_or_none()

        if not recipes:
            if prod and prod.name:
                ing_res = await db.execute(select(Ingredient).where(Ingredient.name.ilike(prod.name.strip())))
                direct_ing = ing_res.scalars().first()
                if direct_ing:
                    deduct_amt = float(quantity)
                    direct_ing.current_stock = round(max(0.0, (direct_ing.current_stock or 0.0) - deduct_amt), 3)
                    movement = StockMovement(
                        movement_type="sale_deduction",
                        ingredient_id=direct_ing.id,
                        source_warehouse_id=warehouse_id,
                        amount=deduct_amt,
                        unit=direct_ing.unit,
                        cost_price=direct_ing.cost_per_unit,
                        reference_no=order_no,
                        notes=f"Sipariş Doğrudan Satış Düşümü: {quantity}x",
                        created_by="Sistem (Otomatik Stok)"
                    )
                    db.add(movement)
                    return

        ratios = []
        for recipe in recipes:
            ingredient_stmt = select(Ingredient).where(Ingredient.id == recipe.ingredient_id)
            ing_res = await db.execute(ingredient_stmt)
            ingredient = ing_res.scalar_one_or_none()
            if not ingredient:
                continue

            base_amount = recipe.amount * quantity
            fire_multiplier = 1.0 + ((recipe.waste_percentage or 0.0) / 100.0)
            total_deduct_amount = round(base_amount * fire_multiplier, 3)

            ingredient.current_stock = round(max(0.0, (ingredient.current_stock or 0.0) - total_deduct_amount), 3)
            if recipe.amount and recipe.amount > 0:
                ratios.append(int(math.floor(max(0.0, ingredient.current_stock) / float(recipe.amount))))

            movement = StockMovement(
                movement_type="sale_deduction",
                ingredient_id=ingredient.id,
                source_warehouse_id=warehouse_id,
                amount=total_deduct_amount,
                unit=ingredient.unit,
                cost_price=ingredient.cost_per_unit,
                reference_no=order_no,
                notes=f"Sipariş Satış Düşümü: {quantity}x",
                created_by="Sistem (Otomatik Reçete)"
            )
            db.add(movement)
            logger.info(f"Deducted {total_deduct_amount}{ingredient.unit} of '{ingredient.name}' for {order_no}")

        if ratios and prod and prod.name:
            prod_ing_res = await db.execute(select(Ingredient).where(Ingredient.name.ilike(prod.name.strip())))
            prod_ing = prod_ing_res.scalars().first()
            if prod_ing:
                prod_ing.current_stock = float(min(ratios))

        await db.flush()
