from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text
from datetime import datetime
from app.database import Base

class CashRegister(Base):
    __tablename__ = "cash_registers"

    id = Column(Integer, primary_key=True, index=True)
    status = Column(String(30), default="open") # open, closed
    opening_float = Column(Float, default=500.0) # Gün başı nakit avansı
    total_cash = Column(Float, default=0.0)
    total_card = Column(Float, default=0.0)
    total_sodexo = Column(Float, default=0.0)
    total_multinet = Column(Float, default=0.0)
    total_ticket = Column(Float, default=0.0)
    total_other = Column(Float, default=0.0)
    total_expenses = Column(Float, default=0.0)
    total_discounts = Column(Float, default=0.0)
    total_treats = Column(Float, default=0.0)
    total_vat_1 = Column(Float, default=0.0)
    total_vat_10 = Column(Float, default=0.0)
    total_vat_20 = Column(Float, default=0.0)
    total_revenue = Column(Float, default=0.0)
    opened_by = Column(String(100), default="Kasiyer")
    closed_by = Column(String(100), nullable=True)
    opened_at = Column(DateTime, default=datetime.utcnow)
    closed_at = Column(DateTime, nullable=True)
    z_report_no = Column(String(50), nullable=True) # e.g. "Z-20260902-001"

class CashExpense(Base):
    __tablename__ = "cash_expenses"

    id = Column(Integer, primary_key=True, index=True)
    category = Column(String(100), nullable=False) # Tedarikçi, Market, Bahşiş Avansı, Personel Yemeği, Diğer
    amount = Column(Float, nullable=False)
    expense_type = Column(String(20), default="out") # in (para girişi), out (masraf/para çıkışı)
    description = Column(Text, nullable=False)
    created_by = Column(String(100), default="Kasiyer")
    created_at = Column(DateTime, default=datetime.utcnow)
