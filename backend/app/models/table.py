from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class Area(Base):
    __tablename__ = "areas"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), nullable=False) # Salon, Bahçe, Teras, VIP
    order_index = Column(Integer, default=0)

    tables = relationship("Table", back_populates="area", cascade="all, delete-orphan")

class Table(Base):
    __tablename__ = "tables"

    id = Column(Integer, primary_key=True, index=True)
    area_id = Column(Integer, ForeignKey("areas.id"), nullable=False)
    name = Column(String(50), nullable=False) # S1, T4, B12, VIP-1
    shape = Column(String(20), default="square") # square, round, rectangle, bar
    x = Column(Float, default=100.0) # Kroki X
    y = Column(Float, default=100.0) # Kroki Y
    width = Column(Float, default=120.0)
    height = Column(Float, default=120.0)
    seats = Column(Integer, default=4)
    status = Column(String(30), default="empty") # empty, occupied, bill_requested, reserved, waiter_call
    current_order_id = Column(Integer, nullable=True)
    opened_at = Column(DateTime, nullable=True) # Duration timer calculation
    kuver_count = Column(Integer, default=0)
    waiter_name = Column(String(100), nullable=True)
    reservation_name = Column(String(100), nullable=True)
    reservation_time = Column(String(50), nullable=True)
    waiter_call_reason = Column(String(100), nullable=True) # "Garson Çağır", "Hesap İste", "Kül Tablası"
    is_merged_to = Column(Integer, nullable=True) # Table ID if merged to another table

    area = relationship("Area", back_populates="tables")
    orders = relationship("Order", back_populates="table", foreign_keys="[Order.table_id]")
