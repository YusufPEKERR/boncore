from sqlalchemy import Column, Integer, String, Float, Boolean, Text, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.database import Base

class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    icon = Column(String(50), default="Utensils") # Lucide icon name
    color = Column(String(30), default="#f97316") # Category badge color
    order_index = Column(Integer, default=0)
    target_station = Column(String(50), default="kitchen") # kitchen, bar, pastry, grill

    products = relationship("Product", back_populates="category", cascade="all, delete-orphan")

class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    name = Column(String(150), nullable=False)
    description = Column(Text, nullable=True)
    base_price = Column(Float, nullable=False)
    plu_code = Column(String(20), nullable=True, index=True) # e.g. "101"
    barcode = Column(String(50), nullable=True, index=True) # e.g. "8690123456"
    vat_rate = Column(Float, default=10.0) # %1, %10, %20
    station = Column(String(50), default="kitchen") # kitchen, bar, pastry, grill
    is_available = Column(Boolean, default=True)
    image_url = Column(String(255), nullable=True)
    calories = Column(Integer, nullable=True)
    allergens = Column(JSON, default=list) # ["Gluten", "Süt", "Fıstık"]
    is_vegan = Column(Boolean, default=False)
    is_spicy = Column(Boolean, default=False)

    category = relationship("Category", back_populates="products")
    variants = relationship("ProductVariant", back_populates="product", cascade="all, delete-orphan")
    modifier_groups = relationship("ModifierGroup", back_populates="product", cascade="all, delete-orphan")
    recipes = relationship("Recipe", back_populates="product", cascade="all, delete-orphan")

class ProductVariant(Base):
    __tablename__ = "product_variants"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    name = Column(String(100), nullable=False) # Küçük, Orta, Büyük, 1.5 Porsiyon, Duble
    price_delta = Column(Float, default=0.0) # Ek veya baz fiyat farkı
    is_default = Column(Boolean, default=False)

    product = relationship("Product", back_populates="variants")

class ModifierGroup(Base):
    __tablename__ = "modifier_groups"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    name = Column(String(100), nullable=False) # Pişme Derecesi, Sos Seçimi, Ekstra Malzeme
    is_required = Column(Boolean, default=False)
    min_selection = Column(Integer, default=0)
    max_selection = Column(Integer, default=1)

    product = relationship("Product", back_populates="modifier_groups")
    options = relationship("ModifierOption", back_populates="group", cascade="all, delete-orphan")

class ModifierOption(Base):
    __tablename__ = "modifier_options"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("modifier_groups.id"), nullable=False)
    name = Column(String(100), nullable=False) # Az Pişmiş, Orta, Acı Sos, Cheddar Peyniri
    price = Column(Float, default=0.0)

    group = relationship("ModifierGroup", back_populates="options")

class Ingredient(Base):
    __tablename__ = "ingredients"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False) # Dana Kıyma, Kaşar Peyniri, Domates, Kahve Çekirdeği
    unit = Column(String(20), default="gr") # gr, ml, adet, kg
    cost_per_unit = Column(Float, default=0.0) # Birim maliyet
    current_stock = Column(Float, default=1000.0) # Toplam stok
    min_stock_alert = Column(Float, default=200.0) # Kritik stok eşiği
    warehouse_id = Column(Integer, default=1) # 1: Ana Depo, 2: Mutfak, 3: Bar

class Recipe(Base):
    __tablename__ = "recipes"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    ingredient_id = Column(Integer, ForeignKey("ingredients.id"), nullable=False)
    amount = Column(Float, nullable=False) # örn: 180 gr
    waste_percentage = Column(Float, default=0.0) # Pişme/hazırlık firesi örn: %15

    product = relationship("Product", back_populates="recipes")
    ingredient = relationship("Ingredient")
