from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    amount = Column(Float, nullable=False)
    payment_method = Column(String(50), nullable=False) # cash, credit_card, sodexo, multinet, ticket, meal_card, online
    tip_amount = Column(Float, default=0.0)
    rounding_amount = Column(Float, default=0.0)
    cashier_name = Column(String(100), default="Kasiyer")
    receipt_no = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    notes = Column(Text, nullable=True)

    order = relationship("Order", back_populates="payments")
