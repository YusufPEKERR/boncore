from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text
from datetime import datetime
from app.database import Base

class RestaurantTenant(Base):
    __tablename__ = "restaurant_tenants"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(50), unique=True, index=True, nullable=False)  # Slug / Alt alan adı
    name = Column(String(150), nullable=False)                         # Restoran / İşletme Adı
    owner_name = Column(String(100), nullable=True)                    # Yetkili / Sahibi
    phone = Column(String(50), nullable=True)                          # İletişim Telefonu
    email = Column(String(100), nullable=True)                         # İletişim E-Postası
    city = Column(String(50), default="İstanbul")                      # Şehir
    tax_number = Column(String(50), nullable=True)                     # VKN / TCKN
    tax_office = Column(String(100), nullable=True)                    # Vergi Dairesi
    address = Column(String(255), nullable=True)                       # Adres
    plan = Column(String(50), default="pro")                           # starter, pro, enterprise
    monthly_price = Column(Float, default=1490.0)                      # Aylık Ücret (TL)
    billing_cycle = Column(String(20), default="monthly")              # monthly, yearly
    status = Column(String(30), default="active")                      # active, trial, suspended, expired
    trial_ends_at = Column(DateTime, nullable=True)
    renewal_date = Column(DateTime, nullable=True)
    payment_method = Column(String(50), default="credit_card")         # credit_card, bank_transfer
    payment_status = Column(String(30), default="paid")                # paid, pending, overdue
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class TenantLead(Base):
    __tablename__ = "tenant_leads"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(100), nullable=False)
    phone = Column(String(50), nullable=False)
    company_name = Column(String(150), nullable=False)
    business_type = Column(String(50), default="restoran")             # restoran, kafe, fastfood, bar, otel, pastane
    city = Column(String(50), default="İstanbul")
    status = Column(String(30), default="yeni")                        # yeni, arandi, demo_yapildi, musteri_oldu, iptal
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class TenantInvoice(Base):
    __tablename__ = "tenant_invoices"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, index=True, nullable=False)
    invoice_no = Column(String(50), unique=True, nullable=False)       # Örn: BON2026-00142
    tenant_name = Column(String(150), nullable=False)
    period = Column(String(50), nullable=False)                        # Örn: Ekim 2026
    amount = Column(Float, nullable=False)
    plan = Column(String(50), default="pro")
    payment_method = Column(String(50), default="credit_card")
    status = Column(String(30), default="paid")                        # paid, pending, overdue
    due_date = Column(DateTime, nullable=True)
    paid_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
