from sqlalchemy import Column, Integer, String, Float, DateTime, Text, JSON
from datetime import datetime
from app.database import Base

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    action_type = Column(String(50), nullable=False, index=True) # VOID_ITEM, CANCEL_ORDER, APPLY_DISCOUNT, APPLY_TREAT, OPEN_DRAWER, TABLE_MOVE, TABLE_MERGE, Z_REPORT, PRICE_CHANGE
    operator_name = Column(String(100), nullable=False)
    operator_role = Column(String(50), default="waiter") # waiter, cashier, manager
    target_ref = Column(String(100), nullable=True) # e.g. "Masa: S3", "Sipariş: ORD-102"
    reason_code = Column(String(100), nullable=True) # "YANLIS_SIPARIS", "MUSTERI_VAZGECTI", "BOZUK_URUN", "MUDUR_IKRAMI"
    reason_text = Column(Text, nullable=True)
    details = Column(JSON, nullable=True) # Old values vs new values
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
