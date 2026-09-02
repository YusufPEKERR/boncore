from sqlalchemy import Column, Integer, String, Float, Boolean, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    order_no = Column(String(50), unique=True, index=True) # e.g. "ORD-20260902-001"
    table_id = Column(Integer, ForeignKey("tables.id"), nullable=True)
    order_type = Column(String(30), default="dine_in") # dine_in, takeaway, online_delivery, qr_order
    status = Column(String(30), default="open") # open, bill_requested, paid, cancelled
    subtotal = Column(Float, default=0.0)
    discount_amount = Column(Float, default=0.0)
    discount_rate = Column(Float, default=0.0)
    discount_reason = Column(String(100), nullable=True)
    treat_amount = Column(Float, default=0.0) # İkram tutarı
    treat_reason = Column(String(100), nullable=True)
    kuver_count = Column(Integer, default=0)
    kuver_total = Column(Float, default=0.0)
    tax_total = Column(Float, default=0.0)
    grand_total = Column(Float, default=0.0)
    paid_total = Column(Float, default=0.0)
    remaining_total = Column(Float, default=0.0)
    waiter_name = Column(String(100), default="Garson")
    cashier_name = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    closed_at = Column(DateTime, nullable=True)

    table = relationship("Table", back_populates="orders", foreign_keys=[table_id])
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="order", cascade="all, delete-orphan")

class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    product_name = Column(String(150), nullable=False)
    variant_name = Column(String(100), nullable=True)
    unit_price = Column(Float, nullable=False)
    quantity = Column(Integer, default=1)
    total_price = Column(Float, nullable=False)
    selected_modifiers = Column(JSON, default=list) # [{"group": "Sos", "name": "Acı Sos", "price": 15}]
    negative_modifiers = Column(JSON, default=list) # ["Soğansız", "Buzsuz", "Tuzsuz"]
    kitchen_note = Column(String(255), nullable=True) # "İyi pişsin, sos ayrı gelsin"
    course_stage = Column(Integer, default=1) # 1: 1. Kurs (Başlangıç), 2: 2. Kurs (Ana Yemek), 3: Tatlı
    is_hold = Column(Boolean, default=False) # True ise mutfağa henüz gönderilmedi (Hold/Fire)
    fired_at = Column(DateTime, nullable=True) # Mutfağa ateşlendiği an
    status = Column(String(30), default="pending") # pending, preparing, ready, served, voided
    station = Column(String(50), default="kitchen") # kitchen, bar, pastry, grill
    created_at = Column(DateTime, default=datetime.utcnow)
    ready_at = Column(DateTime, nullable=True)
    served_at = Column(DateTime, nullable=True)
    is_voided = Column(Boolean, default=False)
    void_reason = Column(String(255), nullable=True)
    voided_by = Column(String(100), nullable=True)
    is_treat = Column(Boolean, default=False) # Ürün bazlı ikram

    order = relationship("Order", back_populates="items")
    product = relationship("Product")
