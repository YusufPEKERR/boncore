import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.models.product import Recipe, Ingredient
from app.models.inventory import StockMovement, WarehouseStock

logger = logging.getLogger("boncore.stock")

class StockService:
    @staticmethod
    async def deduct_order_ingredients(db: AsyncSession, product_id: int, quantity: int, order_no: str, warehouse_id: int = 2):
        """
        Deducts raw ingredients and semi-finished recipes from warehouse stock upon order sale/preparation.
        Calculates waste/fire percentage automatically.
        """
        stmt = select(Recipe).where(Recipe.product_id == product_id)
        result = await db.execute(stmt)
        recipes = result.scalars().all()

        for recipe in recipes:
            ingredient_stmt = select(Ingredient).where(Ingredient.id == recipe.ingredient_id)
            ing_res = await db.execute(ingredient_stmt)
            ingredient = ing_res.scalar_one_or_none()
            if not ingredient:
                continue

            # Calculate total amount including fire/waste percentage
            # e.g. 180g meat with 15% cooking fire -> 180 * (1 + 0.15) = 207g consumed
            base_amount = recipe.amount * quantity
            fire_multiplier = 1.0 + (recipe.waste_percentage / 100.0)
            total_deduct_amount = base_amount * fire_multiplier

            # Update ingredient current stock
            ingredient.current_stock = max(0.0, ingredient.current_stock - total_deduct_amount)

            # Record stock movement
            movement = StockMovement(
                movement_type="sale_deduction",
                ingredient_id=ingredient.id,
                source_warehouse_id=warehouse_id,
                amount=total_deduct_amount,
                unit=ingredient.unit,
                cost_price=ingredient.cost_per_unit,
                reference_no=order_no,
                notes=f"Sipariş Satış Düşümü: {quantity}x (Fire: %{recipe.waste_percentage})",
                created_by="Sistem (Otomatik Reçete)"
            )
            db.add(movement)
            
            logger.info(f"Deducted {total_deduct_amount}{ingredient.unit} of '{ingredient.name}' for {order_no}")

        await db.commit()
