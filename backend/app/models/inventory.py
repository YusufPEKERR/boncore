from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class Warehouse(Base):
    __tablename__ = "warehouses"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False) # Ana Depo, Mutfak Deposu, Bar Deposu
    code = Column(String(20), unique=True)
    is_main = Column(Boolean, default=False)

    stocks = relationship("WarehouseStock", back_populates="warehouse", cascade="all, delete-orphan")

class WarehouseStock(Base):
    __tablename__ = "warehouse_stocks"

    id = Column(Integer, primary_key=True, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    ingredient_id = Column(Integer, ForeignKey("ingredients.id"), nullable=False)
    quantity = Column(Float, default=0.0)
    min_alert_level = Column(Float, default=100.0)

    warehouse = relationship("Warehouse", back_populates="stocks")
    ingredient = relationship("Ingredient")

class StockMovement(Base):
    __tablename__ = "stock_movements"

    id = Column(Integer, primary_key=True, index=True)
    movement_type = Column(String(50), nullable=False) # sale_deduction, purchase_invoice, transfer, waste_fire, adjustment
    ingredient_id = Column(Integer, ForeignKey("ingredients.id"), nullable=False)
    source_warehouse_id = Column(Integer, nullable=True)
    target_warehouse_id = Column(Integer, nullable=True)
    amount = Column(Float, nullable=False)
    unit = Column(String(20), default="gr")
    cost_price = Column(Float, default=0.0)
    reference_no = Column(String(100), nullable=True) # Sipariş No, İrsaliye No
    notes = Column(Text, nullable=True)
    created_by = Column(String(100), default="Sistem")
    created_at = Column(DateTime, default=datetime.utcnow)

    ingredient = relationship("Ingredient")
