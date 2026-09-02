from sqlalchemy import Column, Integer, String, Boolean, DateTime
from datetime import datetime
from app.database import Base

class StaffUser(Base):
    __tablename__ = "staff_users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    pin_code = Column(String(10), nullable=False, unique=True) # 4-digit PIN
    role = Column(String(50), nullable=False, default="waiter") # waiter, cashier, chef, manager, kitchen
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
