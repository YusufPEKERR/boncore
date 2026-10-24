from pydantic import BaseModel, Field, model_validator
from typing import Optional, List, Dict, Any
from datetime import datetime

# --- Auth ---
class PinAuthRequest(BaseModel):
    pin_code: str = Field(..., min_length=4, max_length=10)

class LoginRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=50)
    password: str = Field(..., min_length=1, max_length=128)
    remember: bool = False

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=6, max_length=128)

class StaffUserResponse(BaseModel):
    id: int
    name: str
    role: str
    is_active: bool
    username: Optional[str] = None
    access_token: Optional[str] = None

class StaffUserCreate(BaseModel):
    name: str = Field(..., min_length=2, description="Personel adı")
    username: Optional[str] = Field(None, min_length=2, max_length=50, description="Giriş kullanıcı adı")
    password: Optional[str] = Field("123456", min_length=4, max_length=128, description="Giriş parolası")
    role: str = Field("waiter", description="Personel rolü")
    pin_code: str = Field("1234", min_length=4, max_length=10, description="Yönetici onayları için PIN")
    is_active: bool = True

    @model_validator(mode="before")
    @classmethod
    def check_name_fallback(cls, data: Any):
        if isinstance(data, dict):
            if "name" not in data and "full_name" in data:
                data["name"] = data["full_name"]
        return data

class StaffUserUpdate(BaseModel):
    name: Optional[str] = None
    username: Optional[str] = Field(None, min_length=2, max_length=50)
    password: Optional[str] = Field(None, min_length=4, max_length=128)
    role: Optional[str] = None
    pin_code: Optional[str] = Field(None, min_length=4, max_length=10)
    is_active: Optional[bool] = None

# --- Table & Floor ---
class AreaCreate(BaseModel):
    name: str
    order_index: Optional[int] = 0

class TableCreateSchema(BaseModel):
    area_id: int
    name: str
    seats: Optional[int] = 4
    shape: Optional[str] = "square"

class TableUpdateSchema(BaseModel):
    area_id: Optional[int] = None
    name: Optional[str] = None
    seats: Optional[int] = None
    shape: Optional[str] = None

class TableBulkCreateSchema(BaseModel):
    area_id: int
    prefix: str = "Masa "
    start_num: int = 1
    count: int = 10
    seats: int = 4
    shape: str = "square"

class TablePositionUpdate(BaseModel):
    id: int
    x: float
    y: float
    width: Optional[float] = 120.0
    height: Optional[float] = 120.0
    shape: Optional[str] = "square"

class TableMoveRequest(BaseModel):
    source_table_id: int
    target_table_id: int
    operator_name: str = "Garson"

class TableMergeRequest(BaseModel):
    source_table_id: int
    target_table_id: int
    operator_name: str = "Garson"

class TableItemTransferRequest(BaseModel):
    source_table_id: int
    target_table_id: int
    order_item_ids: List[int]
    operator_name: str = "Garson"

class TableKuverRequest(BaseModel):
    kuver_count: int
    operator_name: str = "Garson"

class WaiterCallRequest(BaseModel):
    reason: str = "Garson Çağır" # "Garson Çağır", "Hesap İste", "Kül Tablası"

# --- Products & Modifiers ---
class ModifierOptionSchema(BaseModel):
    id: Optional[int] = None
    name: str
    price: float = 0.0

class ModifierGroupSchema(BaseModel):
    id: Optional[int] = None
    name: str
    is_required: bool = False
    min_selection: int = 0
    max_selection: int = 1
    options: List[ModifierOptionSchema] = []

class ProductVariantSchema(BaseModel):
    id: Optional[int] = None
    name: str
    price_delta: float = 0.0
    is_default: bool = False

class ProductDetailResponse(BaseModel):
    id: int
    category_id: int
    name: str
    description: Optional[str] = None
    base_price: float
    plu_code: Optional[str] = None
    barcode: Optional[str] = None
    vat_rate: float = 10.0
    station: str = "kitchen"
    is_available: bool = True
    image_url: Optional[str] = None
    calories: Optional[int] = None
    allergens: List[str] = []
    is_vegan: bool = False
    is_spicy: bool = False
    variants: List[ProductVariantSchema] = []
    modifier_groups: List[ModifierGroupSchema] = []

# --- Orders ---
class SelectedModifier(BaseModel):
    group: str
    name: str
    price: float = 0.0

class OrderItemInput(BaseModel):
    product_id: int
    variant_name: Optional[str] = None
    unit_price: Optional[float] = None
    quantity: float = 1.0
    selected_modifiers: List[SelectedModifier] = []
    negative_modifiers: List[str] = [] # ["Soğansız", "Buzsuz"]
    kitchen_note: Optional[str] = None
    course_stage: int = 1 # 1: 1. Kurs, 2: 2. Kurs, 3: Tatlı
    is_hold: bool = False # True ise mutfağa henüz gönderilmedi

class CreateOrderRequest(BaseModel):
    table_id: Optional[int] = None
    order_type: str = "dine_in" # dine_in, takeaway, online_delivery, qr_order
    items: List[OrderItemInput] = []
    waiter_name: str = "Garson"
    notes: Optional[str] = None
    kuver_count: Optional[int] = 0
    service_charge: Optional[float] = 0.0

class AddItemsRequest(BaseModel):
    items: List[OrderItemInput]
    waiter_name: str = "Garson"

class HoldFireToggleRequest(BaseModel):
    order_item_ids: List[int]
    action: str = "fire" # "fire" or "hold"

class VoidItemRequest(BaseModel):
    order_item_id: int
    reason_code: str # "YANLIS_SIPARIS", "MUSTERI_VAZGECTI", "BOZUK_URUN"
    reason_text: Optional[str] = None
    operator_name: str
    manager_pin: Optional[str] = None

class ApplyDiscountRequest(BaseModel):
    discount_type: str # "percentage" or "fixed"
    value: float # e.g. 10 (%) or 50 (₺)
    reason: str
    operator_name: str
    manager_pin: Optional[str] = None

class ApplyTreatRequest(BaseModel):
    order_item_ids: Optional[List[int]] = None # If None, treat whole order
    reason: str = "Müessese İkramı"
    operator_name: str = "Yetkili"
    manager_pin: Optional[str] = None

# --- Payments & Split Bill ---
class SinglePaymentItem(BaseModel):
    method: Optional[str] = "cash" # cash, credit_card, sodexo, multinet, ticket, meal_card, online, other
    payment_method: Optional[str] = None
    amount: float = Field(..., ge=0, description="Ödenen tutar negatif olamaz")
    tip: float = 0.0

    @model_validator(mode="before")
    @classmethod
    def check_method_fallback(cls, data: Any):
        if isinstance(data, dict):
            if "method" not in data and "payment_method" in data:
                data["method"] = data["payment_method"]
            elif "payment_method" not in data and "method" in data:
                data["payment_method"] = data["method"]
        return data

class SettlePaymentRequest(BaseModel):
    order_id: int
    payments: List[SinglePaymentItem]
    rounding: float = 0.0
    cashier_name: str = "Kasiyer"
    close_table: bool = True

class SplitEqualRequest(BaseModel):
    order_id: int
    person_count: int

class SplitItemizedPaymentRequest(BaseModel):
    order_id: int
    selected_item_ids: List[int]
    payments: List[SinglePaymentItem]
    cashier_name: str = "Kasiyer"

# --- Cashier & Registers ---
class OpenRegisterRequest(BaseModel):
    opening_float: float = 500.0
    opened_by: str = "Kasiyer"

class CashExpenseRequest(BaseModel):
    category: str
    amount: float
    expense_type: str = "out" # "out" or "in"
    description: str
    created_by: str = "Kasiyer"

class CloseRegisterRequest(BaseModel):
    closed_by: str = "Kasiyer"
    manager_pin: Optional[str] = None

# --- Inventory & Stock ---
class StockTransferRequest(BaseModel):
    ingredient_id: int
    source_warehouse_id: int
    target_warehouse_id: int
    amount: float
    notes: Optional[str] = None
    created_by: str = "Müdür"

    @model_validator(mode="before")
    @classmethod
    def check_aliases(cls, data: Any):
        if isinstance(data, dict):
            if "amount" not in data and "quantity" in data:
                data["amount"] = data["quantity"]
            if "source_warehouse_id" not in data and "from_warehouse_id" in data:
                data["source_warehouse_id"] = data["from_warehouse_id"]
            if "target_warehouse_id" not in data and "to_warehouse_id" in data:
                data["target_warehouse_id"] = data["to_warehouse_id"]
        return data

class PurchaseInvoiceItem(BaseModel):
    ingredient_id: int
    quantity: float
    unit_price: Optional[float] = None
    unit_cost: Optional[float] = None
    target_warehouse_id: int = 1

    def get_unit_price(self) -> float:
        return self.unit_price if self.unit_price is not None else (self.unit_cost or 0.0)

class PurchaseInvoiceRequest(BaseModel):
    supplier_name: Optional[str] = None
    supplier_title: Optional[str] = None
    invoice_no: str
    items: List[PurchaseInvoiceItem]
    created_by: str = "Müdür"
    warehouse_id: Optional[int] = 1

    def get_supplier(self) -> str:
        return self.supplier_name or self.supplier_title or "Tedarikçi"

# --- Delivery & Aggregators ---
class AssignCourierRequest(BaseModel):
    delivery_order_id: int
    courier_id: int

class CourierMutabakatRequest(BaseModel):
    courier_id: int
    collected_cash: float
    collected_card: float
    cashier_name: str = "Kasiyer"

class OnlineOrderItem(BaseModel):
    product_id: Optional[int] = None
    name: Optional[str] = None
    product_name: Optional[str] = None
    unit_price: float = 0.0
    quantity: float = 1.0
    total_price: Optional[float] = None
    kitchen_note: Optional[str] = None

class OnlineOrderIngestRequest(BaseModel):
    platform: Optional[str] = None
    channel: Optional[str] = None
    customer_name: str
    customer_phone: str
    delivery_address: str
    items: List[OnlineOrderItem]
    payment_type: str = "online_odendi"
    notes: Optional[str] = None
