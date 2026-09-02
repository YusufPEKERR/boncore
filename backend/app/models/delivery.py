from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class Courier(Base):
    __tablename__ = "couriers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    phone = Column(String(20), nullable=False)
    vehicle_plate = Column(String(20), nullable=True) # 34 ABC 123
    is_active = Column(Boolean, default=True)
    cash_collected = Column(Float, default=0.0)
    card_slips_collected = Column(Float, default=0.0)

class DeliveryOrder(Base):
    __tablename__ = "delivery_orders"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    platform = Column(String(50), default="phone") # phone, yemeksepeti, getir, trendyol, migros
    platform_order_id = Column(String(100), nullable=True)
    customer_name = Column(String(100), nullable=False)
    customer_phone = Column(String(20), nullable=False, index=True)
    delivery_address = Column(Text, nullable=False)
    address_zone = Column(String(100), nullable=True) # "Merkez Mah. (Min: ₺200)"
    courier_id = Column(Integer, ForeignKey("couriers.id"), nullable=True)
    courier_status = Column(String(50), default="unassigned") # unassigned, assigned, on_the_way, delivered, cancelled
    dispatched_at = Column(DateTime, nullable=True)
    delivered_at = Column(DateTime, nullable=True)
    payment_type = Column(String(50), default="kapida_nakit") # kapida_nakit, kapida_kart, online_odendi
    notes = Column(Text, nullable=True)

    order = relationship("Order")
    courier = relationship("Courier")
