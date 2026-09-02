export interface StaffUser {
  id: number;
  name: string;
  role: 'waiter' | 'cashier' | 'chef' | 'manager' | 'kitchen';
  pin_code?: string;
  is_active: boolean;
}

export interface Area {
  id: number;
  name: string;
  order_index: number;
  tables: Table[];
}

export interface Table {
  id: number;
  area_id: number;
  name: string;
  shape: 'square' | 'round' | 'rectangle' | 'bar';
  x: number;
  y: number;
  width: number;
  height: number;
  seats: number;
  status: 'empty' | 'occupied' | 'bill_requested' | 'reserved' | 'waiter_call';
  opened_at: string | null;
  duration_minutes: number;
  kuver_count: number;
  waiter_name: string | null;
  reservation_name: string | null;
  reservation_time: string | null;
  waiter_call_reason: string | null;
  is_merged_to: number | null;
  active_order: ActiveOrderSummary | null;
}

export interface ActiveOrderSummary {
  id: number;
  order_no: string;
  status: string;
  grand_total: number;
  subtotal: number;
  discount_amount: number;
  kuver_count: number;
  waiter_name: string;
  items_count: number;
  created_at: string;
}

export interface ModifierOption {
  id?: number;
  name: string;
  price: number;
}

export interface ModifierGroup {
  id?: number;
  name: string;
  is_required: boolean;
  min_selection: number;
  max_selection: number;
  options: ModifierOption[];
}

export interface ProductVariant {
  id?: number;
  name: string;
  price_delta: number;
  is_default: boolean;
}

export interface Product {
  id: number;
  category_id: number;
  name: string;
  description?: string;
  base_price: number;
  plu_code?: string;
  barcode?: string;
  vat_rate?: number;
  station: 'kitchen' | 'bar' | 'pastry' | 'grill';
  is_available: boolean;
  image_url?: string;
  calories?: number;
  allergens?: string[];
  is_vegan?: boolean;
  is_spicy?: boolean;
  variants?: ProductVariant[];
  modifier_groups?: ModifierGroup[];
  unit?: string;
  stock_quantity?: number;
}

export interface Category {
  id: number;
  name: string;
  icon: string;
  color: string;
  order_index: number;
  target_station: string;
  products: Product[];
}

export interface SelectedModifier {
  group: string;
  name: string;
  price: number;
}

export interface OrderItem {
  id?: number;
  product_id: number;
  product_name: string;
  variant_name?: string;
  unit_price: number;
  quantity: number;
  total_price: number;
  selected_modifiers: SelectedModifier[];
  negative_modifiers: string[];
  kitchen_note?: string;
  course_stage: number; // 1: 1. Kurs, 2: 2. Kurs, 3: Tatlı
  is_hold: boolean;
  status?: 'pending' | 'hold' | 'preparing' | 'ready' | 'served' | 'voided';
  station?: string;
  is_voided?: boolean;
  void_reason?: string;
  is_treat?: boolean;
}

export interface PaymentMethodConfig {
  id: string;
  name: string;
  icon: string;
  desc: string;
  is_active: boolean;
  color?: string;
}

export interface PaymentItem {
  id?: number;
  method: 'cash' | 'credit_card' | 'sodexo' | 'multinet' | 'ticket' | 'open_account' | 'meal_card' | 'online' | 'other' | string;
  amount: number;
  tip?: number;
  rounding?: number;
  created_at?: string;
}

export interface Order {
  id: number;
  order_no: string;
  table_id: number | null;
  table_name?: string;
  order_type: 'dine_in' | 'takeaway' | 'online_delivery' | 'qr_order';
  status: 'open' | 'bill_requested' | 'paid' | 'cancelled';
  subtotal: number;
  discount_amount: number;
  discount_rate: number;
  discount_reason?: string;
  treat_amount: number;
  treat_reason?: string;
  kuver_count: number;
  kuver_total: number;
  grand_total: number;
  paid_total: number;
  remaining_total: number;
  waiter_name: string;
  cashier_name?: string;
  notes?: string;
  created_at?: string;
  items: OrderItem[];
  payments: PaymentItem[];
}

export interface Ingredient {
  id: number;
  name: string;
  unit: string;
  cost_per_unit: number;
  current_stock: number;
  min_stock_alert: number;
  warehouse_id: number;
  is_critical: boolean;
}

export interface RecipeItem {
  id: number;
  ingredient_id: number;
  ingredient_name: string;
  amount: number;
  unit: string;
  waste_percentage: number;
  cost: number;
}

export interface ProductRecipe {
  product_id: number;
  product_name: string;
  base_price: number;
  estimated_cost: number;
  profit_margin: number;
  recipes: RecipeItem[];
}

export interface Courier {
  id: number;
  name: string;
  phone: string;
  vehicle_plate?: string;
  is_active: boolean;
  cash_collected: number;
  card_slips_collected: number;
}

export interface DeliveryOrder {
  id: number;
  order_id: number;
  order_no: string;
  platform: string;
  platform_order_id?: string;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  address_zone?: string;
  courier_id?: number;
  courier_name?: string;
  courier_status: 'unassigned' | 'assigned' | 'on_the_way' | 'delivered' | 'cancelled';
  payment_type: string;
  grand_total: number;
  notes?: string;
  created_at?: string;
  items: {
    name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    kitchen_note?: string;
  }[];
}

export interface AuditLog {
  id: number;
  action_type: string;
  operator_name: string;
  operator_role: string;
  target_ref?: string;
  reason_code?: string;
  reason_text?: string;
  details?: any;
  timestamp: string;
}

export interface FiscalDoc {
  ettn: string;
  doc_no: string;
  date: string;
  time: string;
  company_title: string;
  vkn: string;
  table_name: string;
  waiter_name: string;
  cashier_name: string;
  items: any[];
  subtotal: number;
  discount: number;
  treat: number;
  kuver: number;
  grand_total: number;
  vat_summary: any;
  qr_code_content: string;
  xml_content: string;
}
