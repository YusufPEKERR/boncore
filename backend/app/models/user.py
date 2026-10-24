from sqlalchemy import Column, Integer, String, Boolean, DateTime
from datetime import datetime
from app.database import Base

class StaffUser(Base):
    __tablename__ = "staff_users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    username = Column(String(50), nullable=True, unique=True, index=True)  # Giriş kullanıcı adı
    password_hash = Column(String(255), nullable=True)  # PBKDF2-SHA256 özet
    pin_code = Column(String(10), nullable=False, unique=True) # 4-digit PIN (yönetici onayları için)
    role = Column(String(50), nullable=False, default="waiter") # waiter, cashier, chef, manager, kitchen
    is_active = Column(Boolean, default=True)
    last_login_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
