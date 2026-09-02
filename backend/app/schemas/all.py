from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

# --- Auth & PIN ---
class PinAuthRequest(BaseModel):
    pin_code: str = Field(..., min_length=4, max_length=10)

class StaffUserResponse(BaseModel):
    id: int
    name: str
    role: str
    is_active: bool

# --- Table & Floor ---
class AreaCreate(BaseModel):
    name: str
    order_index: Optional[int] = 0

class TableCreateSchema(BaseModel):
    area_id: int
    name: str
    seats: Optional[int] = 4
    shape: Optional[str] = "square"

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
    unit_price: float
    quantity: int = 1
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
    reason: str
    operator_name: str
    manager_pin: Optional[str] = None

# --- Payments & Split Bill ---
class SinglePaymentItem(BaseModel):
    method: str # cash, credit_card, sodexo, multinet, ticket, meal_card, online, other
    amount: float
    tip: float = 0.0

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

class PurchaseInvoiceItem(BaseModel):
    ingredient_id: int
    quantity: float
    unit_price: float
    target_warehouse_id: int = 1

class PurchaseInvoiceRequest(BaseModel):
    supplier_name: str
    invoice_no: str
    items: List[PurchaseInvoiceItem]
    created_by: str = "Müdür"

# --- Delivery & Aggregators ---
class AssignCourierRequest(BaseModel):
    delivery_order_id: int
    courier_id: int

class CourierMutabakatRequest(BaseModel):
    courier_id: int
    collected_cash: float
    collected_card: float
    cashier_name: str = "Kasiyer"

class OnlineOrderIngestRequest(BaseModel):
    platform: str # yemeksepeti, getir, trendyol
    customer_name: str
    customer_phone: str
    delivery_address: str
    items: List[OrderItemInput]
    payment_type: str = "online_odendi"
    notes: Optional[str] = None
