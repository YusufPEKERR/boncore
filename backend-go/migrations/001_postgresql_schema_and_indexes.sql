-- ============================================================================
-- BonCore POS & Restaurant Management System — PostgreSQL 16+ ACID & JSONB Schema
-- ADIM 4: Veritabanı Migrasyonu (PostgreSQL Row-Level Lock & JSONB GIN Indexes)
-- 100% Şema Uyumluluğu: `internal/models/entities.go` & `backend/app/models/*.py`
-- ============================================================================

BEGIN;

-- 1. Staff Users (staff_users)
CREATE TABLE IF NOT EXISTS staff_users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    username VARCHAR(50) UNIQUE,
    password_hash VARCHAR(255),
    pin_code VARCHAR(10) NOT NULL UNIQUE,
    role VARCHAR(50) NOT NULL DEFAULT 'waiter',
    restaurant_id INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_staff_users_pin_code ON staff_users (pin_code);
CREATE INDEX IF NOT EXISTS idx_staff_users_role_active ON staff_users (role, is_active);

-- 2. Areas & Restaurant Tables (areas, tables)
CREATE TABLE IF NOT EXISTS areas (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    order_index INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tables (
    id SERIAL PRIMARY KEY,
    area_id INTEGER NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    shape VARCHAR(20) DEFAULT 'square',
    order_index INTEGER DEFAULT 0,
    x DOUBLE PRECISION DEFAULT 100.0,
    y DOUBLE PRECISION DEFAULT 100.0,
    width DOUBLE PRECISION DEFAULT 120.0,
    height DOUBLE PRECISION DEFAULT 120.0,
    seats INTEGER DEFAULT 4,
    status VARCHAR(30) DEFAULT 'empty',
    current_order_id INTEGER,
    opened_at TIMESTAMPTZ,
    kuver_count INTEGER DEFAULT 0,
    waiter_name VARCHAR(100),
    reservation_name VARCHAR(100),
    reservation_time VARCHAR(50),
    waiter_call_reason VARCHAR(100),
    is_merged_to INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tables_area_order ON tables (area_id, order_index, id);
CREATE INDEX IF NOT EXISTS idx_tables_status ON tables (status);

-- 3. Categories & Products (categories, products, product_variants, modifier_groups, modifier_options)
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    icon VARCHAR(50) DEFAULT 'Utensils',
    color VARCHAR(30) DEFAULT '#f97316',
    order_index INTEGER DEFAULT 0,
    target_station VARCHAR(50) DEFAULT 'kitchen',
    show_in_pos BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    base_price DOUBLE PRECISION NOT NULL,
    plu_code VARCHAR(20),
    barcode VARCHAR(50),
    vat_rate DOUBLE PRECISION DEFAULT 10.0,
    station VARCHAR(50) DEFAULT 'kitchen',
    order_index INTEGER DEFAULT 0,
    is_available BOOLEAN DEFAULT TRUE,
    show_in_pos BOOLEAN DEFAULT TRUE,
    image_url VARCHAR(255),
    calories INTEGER,
    allergens JSONB DEFAULT '[]'::jsonb,
    is_vegan BOOLEAN DEFAULT FALSE,
    is_spicy BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_products_category_order ON products (category_id, order_index, id);
CREATE INDEX IF NOT EXISTS idx_products_allergens_gin ON products USING GIN (allergens);

CREATE TABLE IF NOT EXISTS product_variants (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    price_delta DOUBLE PRECISION DEFAULT 0.0,
    is_default BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS modifier_groups (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    is_required BOOLEAN DEFAULT FALSE,
    min_selection INTEGER DEFAULT 0,
    max_selection INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS modifier_options (
    id SERIAL PRIMARY KEY,
    group_id INTEGER NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    price DOUBLE PRECISION DEFAULT 0.0
);

-- 4. Orders & Order Items (orders, order_items) — ACID & JSONB GIN Indexes
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    order_no VARCHAR(50) UNIQUE NOT NULL,
    table_id INTEGER REFERENCES tables(id) ON DELETE SET NULL,
    order_type VARCHAR(30) DEFAULT 'dine_in',
    status VARCHAR(30) DEFAULT 'open',
    subtotal DOUBLE PRECISION DEFAULT 0.0,
    discount_amount DOUBLE PRECISION DEFAULT 0.0,
    discount_rate DOUBLE PRECISION DEFAULT 0.0,
    discount_reason VARCHAR(100),
    treat_amount DOUBLE PRECISION DEFAULT 0.0,
    treat_reason VARCHAR(100),
    kuver_count INTEGER DEFAULT 0,
    kuver_total DOUBLE PRECISION DEFAULT 0.0,
    service_charge DOUBLE PRECISION DEFAULT 0.0,
    tax_total DOUBLE PRECISION DEFAULT 0.0,
    grand_total DOUBLE PRECISION DEFAULT 0.0,
    paid_total DOUBLE PRECISION DEFAULT 0.0,
    remaining_total DOUBLE PRECISION DEFAULT 0.0,
    waiter_name VARCHAR(100) DEFAULT 'Garson',
    cashier_name VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_orders_table_status ON orders (table_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders (status, created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL,
    product_name VARCHAR(150) NOT NULL,
    variant_name VARCHAR(100),
    unit_price DOUBLE PRECISION NOT NULL,
    quantity DOUBLE PRECISION DEFAULT 1.0,
    total_price DOUBLE PRECISION NOT NULL,
    selected_modifiers JSONB DEFAULT '[]'::jsonb,
    negative_modifiers JSONB DEFAULT '[]'::jsonb,
    kitchen_note VARCHAR(255),
    course_stage INTEGER DEFAULT 1,
    is_hold BOOLEAN DEFAULT FALSE,
    fired_at TIMESTAMPTZ,
    status VARCHAR(30) DEFAULT 'pending',
    station VARCHAR(50) DEFAULT 'kitchen',
    added_by VARCHAR(100) DEFAULT 'Garson',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    ready_at TIMESTAMPTZ,
    served_at TIMESTAMPTZ,
    is_voided BOOLEAN DEFAULT FALSE,
    void_reason VARCHAR(255),
    voided_by VARCHAR(100),
    is_treat BOOLEAN DEFAULT FALSE,
    discount_amount DOUBLE PRECISION DEFAULT 0.0,
    discount_rate DOUBLE PRECISION DEFAULT 0.0,
    discount_reason VARCHAR(100)
);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_kds_station_status ON order_items (station, status, is_voided);

-- Dinamik Sipariş Varyasyonları (Sos, Pişme Derecesi, İstenmeyen Malzemeler) JSONB GIN İndeksleri
CREATE INDEX IF NOT EXISTS idx_order_items_selected_modifiers_gin
    ON order_items USING GIN (selected_modifiers);
CREATE INDEX IF NOT EXISTS idx_order_items_negative_modifiers_gin
    ON order_items USING GIN (negative_modifiers);

-- 5. Payments, Cash Registers & Expenses (payments, cash_registers, cash_expenses)
CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    amount DOUBLE PRECISION NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    tip_amount DOUBLE PRECISION DEFAULT 0.0,
    rounding_amount DOUBLE PRECISION DEFAULT 0.0,
    cashier_name VARCHAR(100) DEFAULT 'Kasiyer',
    receipt_no VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments (order_id);

CREATE TABLE IF NOT EXISTS cash_registers (
    id SERIAL PRIMARY KEY,
    status VARCHAR(30) DEFAULT 'open',
    opening_float DOUBLE PRECISION DEFAULT 500.0,
    total_cash DOUBLE PRECISION DEFAULT 0.0,
    total_card DOUBLE PRECISION DEFAULT 0.0,
    total_sodexo DOUBLE PRECISION DEFAULT 0.0,
    total_multinet DOUBLE PRECISION DEFAULT 0.0,
    total_ticket DOUBLE PRECISION DEFAULT 0.0,
    total_other DOUBLE PRECISION DEFAULT 0.0,
    total_expenses DOUBLE PRECISION DEFAULT 0.0,
    total_discounts DOUBLE PRECISION DEFAULT 0.0,
    total_treats DOUBLE PRECISION DEFAULT 0.0,
    total_vat_1 DOUBLE PRECISION DEFAULT 0.0,
    total_vat_10 DOUBLE PRECISION DEFAULT 0.0,
    total_vat_20 DOUBLE PRECISION DEFAULT 0.0,
    total_revenue DOUBLE PRECISION DEFAULT 0.0,
    opened_by VARCHAR(100) DEFAULT 'Kasiyer',
    closed_by VARCHAR(100),
    opened_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    z_report_no VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS cash_expenses (
    id SERIAL PRIMARY KEY,
    category VARCHAR(100) NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    expense_type VARCHAR(20) DEFAULT 'out',
    description TEXT NOT NULL,
    created_by VARCHAR(100) DEFAULT 'Kasiyer',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Inventory, BOM Recipes & Warehouses (ingredients, recipes, warehouses, warehouse_stocks, stock_movements)
CREATE TABLE IF NOT EXISTS warehouses (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20) UNIQUE,
    is_main BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS ingredients (
    id SERIAL PRIMARY KEY,
    product_code VARCHAR(50) DEFAULT '',
    category_name VARCHAR(100) DEFAULT 'DİĞER',
    name VARCHAR(150) NOT NULL,
    kitchen_group VARCHAR(100) DEFAULT 'MUTFAK',
    revenue_center VARCHAR(100) DEFAULT 'Ana Kanal',
    unit VARCHAR(30) DEFAULT 'Adet',
    cost_per_unit DOUBLE PRECISION DEFAULT 0.0,
    current_stock DOUBLE PRECISION DEFAULT 0.0,
    min_stock_alert DOUBLE PRECISION DEFAULT 0.0,
    warehouse_id INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS recipes (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    amount DOUBLE PRECISION NOT NULL,
    waste_percentage DOUBLE PRECISION DEFAULT 0.0
);
CREATE INDEX IF NOT EXISTS idx_recipes_product_id ON recipes (product_id);

CREATE TABLE IF NOT EXISTS warehouse_stocks (
    id SERIAL PRIMARY KEY,
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    quantity DOUBLE PRECISION DEFAULT 0.0,
    min_alert_level DOUBLE PRECISION DEFAULT 100.0
);

CREATE TABLE IF NOT EXISTS stock_movements (
    id SERIAL PRIMARY KEY,
    movement_type VARCHAR(50) NOT NULL,
    ingredient_id INTEGER NOT NULL,
    source_warehouse_id INTEGER,
    target_warehouse_id INTEGER,
    amount DOUBLE PRECISION NOT NULL,
    unit VARCHAR(20) DEFAULT 'gr',
    cost_price DOUBLE PRECISION DEFAULT 0.0,
    reference_no VARCHAR(100),
    notes TEXT,
    created_by VARCHAR(100) DEFAULT 'Sistem',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Delivery, Couriers, Audit Logs & Restaurant Settings
CREATE TABLE IF NOT EXISTS couriers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    vehicle_plate VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE,
    cash_collected DOUBLE PRECISION DEFAULT 0.0,
    card_slips_collected DOUBLE PRECISION DEFAULT 0.0
);

CREATE TABLE IF NOT EXISTS delivery_orders (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    platform VARCHAR(50) DEFAULT 'phone',
    platform_order_id VARCHAR(100),
    customer_name VARCHAR(100) NOT NULL,
    customer_phone VARCHAR(20) NOT NULL,
    delivery_address TEXT NOT NULL,
    address_zone VARCHAR(100),
    courier_id INTEGER REFERENCES couriers(id) ON DELETE SET NULL,
    courier_status VARCHAR(50) DEFAULT 'unassigned',
    dispatched_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    payment_type VARCHAR(50) DEFAULT 'kapida_nakit',
    notes TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    action_type VARCHAR(50) NOT NULL,
    operator_name VARCHAR(100) NOT NULL,
    operator_role VARCHAR(50) DEFAULT 'waiter',
    target_ref VARCHAR(100),
    reason_code VARCHAR(100),
    reason_text TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_details_gin ON audit_logs USING GIN (details);

CREATE TABLE IF NOT EXISTS restaurant_settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT NOT NULL
);

COMMIT;
