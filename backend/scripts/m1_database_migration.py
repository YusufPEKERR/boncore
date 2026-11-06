#!/usr/bin/env python3
"""
Milestone 1: Database Migration & Integrity Script
Applies database layer fixes to BonCore SQLite databases:
1. Foreign key fix (restore product_id = 36) in fatihciftligi.db
2. Seed standard staff role PINs (1111, 2222, 3333, 9999, 0000) preserving existing accounts
3. Add 34 query performance indexes
4. Sync master.db (backend/data/master.db and backend/master.db)
5. WAL checkpoint (TRUNCATE), VACUUM, and integrity_check
"""

import hashlib
import os
import secrets
import sqlite3
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TENANT_DB_PATH = os.path.join(BASE_DIR, "data", "tenants", "fatihciftligi.db")
DATA_MASTER_DB_PATH = os.path.join(BASE_DIR, "data", "master.db")
ROOT_MASTER_DB_PATH = os.path.join(BASE_DIR, "master.db")

PBKDF2_ITERATIONS = 200_000


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode(), PBKDF2_ITERATIONS
    )
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt}${digest.hex()}"


def execute_fatihciftligi_fixes():
    print(f"[M1] Connecting to active tenant database: {TENANT_DB_PATH}")
    if not os.path.exists(TENANT_DB_PATH):
        raise FileNotFoundError(f"Tenant database not found: {TENANT_DB_PATH}")

    conn = sqlite3.connect(TENANT_DB_PATH, timeout=10.0)
    conn.execute("PRAGMA busy_timeout = 5000;")
    conn.execute("PRAGMA foreign_keys = ON;")
    cur = conn.cursor()

    # 1. Foreign Key Fix: Restore product_id = 36
    print("[M1] Step 1: Checking and restoring product_id = 36...")
    cur.execute("SELECT id, name FROM products WHERE id = 36;")
    prod = cur.fetchone()
    if prod:
        print(f"[M1] Product 36 already exists: {prod}")
    else:
        cur.execute(
            """
            INSERT INTO products (
                id, category_id, name, description, base_price, vat_rate,
                station, is_available, show_in_pos, allergens, order_index
            ) VALUES (
                36, 1, 'ADANA KEBAP', 'Özel kuzu eti zırh kıyması, közlenmiş biber ve domates ile',
                390.0, 10.0, 'kitchen', 1, 1, '[]', 36
            );
            """
        )
        print("[M1] Inserted product 36 ('ADANA KEBAP') successfully.")

    # Verify FK check
    fk_violations = cur.execute("PRAGMA foreign_key_check;").fetchall()
    if fk_violations:
        print(f"[M1] ERROR: Foreign key violations remain: {fk_violations}")
        sys.exit(1)
    else:
        print("[M1] PASS: PRAGMA foreign_key_check returned 0 violations.")

    # 2. Staff Role PIN Seeding
    print("[M1] Step 2: Seeding standard staff roles and PINs...")
    cur.execute("SELECT id, name, pin_code, role FROM staff_users;")
    existing_staff = cur.fetchall()
    print(f"[M1] Existing staff accounts ({len(existing_staff)}):")
    for s in existing_staff:
        print(f"     ID {s[0]}: {s[1]} | PIN: {s[2]} | Role: {s[3]}")

    standard_staff = [
        # (name, username, pin_code, role)
        ("Ahmet Garson", "garson", "1111", "waiter"),
        ("Ayşe Kasiyer", "kasiyer", "2222", "cashier"),
        ("Mehmet Şef (Mutfak)", "sef3333", "3333", "kitchen"),
        ("Kemal Müdür", "kemal_mudur", "9999", "manager"),
        ("Sistem Yöneticisi", "admin0000", "0000", "admin"),
    ]

    for name, uname, pin, role in standard_staff:
        cur.execute("SELECT id, name, role FROM staff_users WHERE pin_code = ?;", (pin,))
        row = cur.fetchone()
        if row:
            print(f"[M1] Staff PIN {pin} already exists (ID {row[0]}: {row[1]} / {row[2]}). Updating...")
            cur.execute(
                """
                UPDATE staff_users
                SET name = ?, username = ?, role = ?, is_active = 1
                WHERE pin_code = ?;
                """,
                (name, uname, role, pin),
            )
        else:
            pwd_hash = hash_password(pin)
            cur.execute(
                """
                INSERT INTO staff_users (
                    name, username, password_hash, pin_code, role,
                    restaurant_id, is_active, created_at
                ) VALUES (
                    ?, ?, ?, ?, ?,
                    1, 1, datetime('now')
                );
                """,
                (name, uname, pwd_hash, pin, role),
            )
            print(f"[M1] Inserted staff user: {name} (PIN: {pin}, Role: {role})")

    # 3. Add 34 Query Performance Indexes
    print("[M1] Step 3: Creating 34 query performance indexes...")
    indexes = [
        # Order items
        ("idx_order_items_order_id", "order_items", ["order_id"]),
        ("idx_order_items_product_id", "order_items", ["product_id"]),
        ("idx_order_items_status", "order_items", ["status"]),
        ("idx_order_items_station", "order_items", ["station"]),
        ("idx_order_items_is_voided", "order_items", ["is_voided"]),
        # Orders
        ("idx_orders_table_id", "orders", ["table_id"]),
        ("idx_orders_status", "orders", ["status"]),
        ("idx_orders_order_type", "orders", ["order_type"]),
        ("idx_orders_created_at", "orders", ["created_at"]),
        ("idx_orders_closed_at", "orders", ["closed_at"]),
        # Tables
        ("idx_tables_area_id", "tables", ["area_id"]),
        ("idx_tables_status", "tables", ["status"]),
        ("idx_tables_current_order_id", "tables", ["current_order_id"]),
        # Products
        ("idx_products_category_id", "products", ["category_id"]),
        ("idx_products_station", "products", ["station"]),
        ("idx_products_is_available", "products", ["is_available"]),
        ("idx_products_show_in_pos", "products", ["show_in_pos"]),
        # Payments
        ("idx_payments_order_id", "payments", ["order_id"]),
        ("idx_payments_payment_method", "payments", ["payment_method"]),
        ("idx_payments_created_at", "payments", ["created_at"]),
        # Recipes
        ("idx_recipes_product_id", "recipes", ["product_id"]),
        ("idx_recipes_ingredient_id", "recipes", ["ingredient_id"]),
        # Stock movements
        ("idx_stock_movements_ingredient_id", "stock_movements", ["ingredient_id"]),
        ("idx_stock_movements_movement_type", "stock_movements", ["movement_type"]),
        ("idx_stock_movements_created_at", "stock_movements", ["created_at"]),
        # Staff users
        ("idx_staff_users_pin_code", "staff_users", ["pin_code"]),
        ("idx_staff_users_role_active", "staff_users", ["role", "is_active"]),
        ("idx_staff_users_restaurant_id", "staff_users", ["restaurant_id"]),
        # Warehouse stocks
        ("idx_warehouse_stocks_warehouse_id", "warehouse_stocks", ["warehouse_id"]),
        ("idx_warehouse_stocks_ingredient_id", "warehouse_stocks", ["ingredient_id"]),
        # Delivery orders
        ("idx_delivery_orders_order_id", "delivery_orders", ["order_id"]),
        ("idx_delivery_orders_courier_id", "delivery_orders", ["courier_id"]),
        # Cash registers
        ("idx_cash_registers_status", "cash_registers", ["status"]),
        ("idx_cash_registers_opened_at", "cash_registers", ["opened_at"]),
    ]

    for idx_name, table_name, columns in indexes:
        cols_sql = ", ".join(columns)
        sql = f"CREATE INDEX IF NOT EXISTS {idx_name} ON {table_name} ({cols_sql});"
        cur.execute(sql)
    print(f"[M1] Successfully created / verified all {len(indexes)} indexes.")

    conn.commit()

    # 4. WAL Checkpoint and Vacuum
    print("[M1] Step 4: Checkpointing WAL and running VACUUM on active tenant DB...")
    cur.execute("PRAGMA wal_checkpoint(TRUNCATE);")
    ckpt = cur.fetchone()
    print(f"[M1] wal_checkpoint(TRUNCATE) result: {ckpt}")

    try:
        cur.execute("VACUUM;")
        print("[M1] VACUUM completed successfully.")
    except sqlite3.OperationalError as e:
        print(f"[M1] VACUUM warning (likely concurrent connection): {e}")

    # Integrity check
    cur.execute("PRAGMA integrity_check;")
    integ = cur.fetchall()
    print(f"[M1] PRAGMA integrity_check result: {integ}")
    if integ != [("ok",)]:
        print(f"[M1] ERROR: Integrity check failed: {integ}")
        sys.exit(1)
    else:
        print("[M1] PASS: PRAGMA integrity_check is ok.")

    conn.close()


def execute_master_db_sync():
    print("\n[M1] Step 5: Master Database Sync & Reconciliation...")
    print(f"[M1] Canonical master: {DATA_MASTER_DB_PATH}")
    print(f"[M1] Duplicate master: {ROOT_MASTER_DB_PATH}")

    # 1. Update backend/data/master.db
    conn_data = sqlite3.connect(DATA_MASTER_DB_PATH, timeout=10.0)
    conn_data.execute("PRAGMA busy_timeout = 5000;")
    cur_data = conn_data.cursor()

    cur_data.execute(
        """
        UPDATE restaurant_tenants
        SET name = 'FATİH ÇİFTLİĞİ',
            owner_name = 'GÜLNİHAL MUTLU',
            plan = 'enterprise',
            monthly_price = 2490.0,
            status = 'active',
            payment_status = 'paid'
        WHERE code = 'fatihciftligi';
        """
    )
    conn_data.commit()

    # Fetch all tenants, leads, invoices from backend/data/master.db
    cur_data.execute("SELECT * FROM restaurant_tenants;")
    tenants = cur_data.fetchall()
    tenant_cols = [d[0] for d in cur_data.description]

    cur_data.execute("SELECT * FROM tenant_leads;")
    leads = cur_data.fetchall()
    lead_cols = [d[0] for d in cur_data.description]

    cur_data.execute("SELECT * FROM tenant_invoices;")
    invoices = cur_data.fetchall()
    inv_cols = [d[0] for d in cur_data.description]

    print(f"[M1] Found {len(tenants)} tenants, {len(leads)} leads, {len(invoices)} invoices in data/master.db")

    # 2. Sync to backend/master.db if it exists
    if os.path.exists(ROOT_MASTER_DB_PATH):
        conn_root = sqlite3.connect(ROOT_MASTER_DB_PATH, timeout=10.0)
        conn_root.execute("PRAGMA busy_timeout = 5000;")
        cur_root = conn_root.cursor()

        # Ensure schema tables exist in root master
        cur_root.execute("""
            CREATE TABLE IF NOT EXISTS restaurant_tenants (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code VARCHAR(50) UNIQUE,
                name VARCHAR(100),
                owner_name VARCHAR(100),
                phone VARCHAR(30),
                email VARCHAR(100),
                city VARCHAR(50),
                tax_number VARCHAR(50),
                tax_office VARCHAR(50),
                address TEXT,
                plan VARCHAR(30) DEFAULT 'pro',
                monthly_price REAL DEFAULT 1490.0,
                billing_cycle VARCHAR(20) DEFAULT 'monthly',
                status VARCHAR(20) DEFAULT 'active',
                trial_ends_at DATETIME,
                renewal_date DATETIME,
                payment_method VARCHAR(30) DEFAULT 'credit_card',
                payment_status VARCHAR(20) DEFAULT 'paid',
                notes TEXT,
                created_at DATETIME,
                updated_at DATETIME
            );
        """)
        cur_root.execute("""
            CREATE TABLE IF NOT EXISTS tenant_leads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                full_name VARCHAR(100),
                phone VARCHAR(30),
                company_name VARCHAR(100),
                business_type VARCHAR(50),
                city VARCHAR(50),
                status VARCHAR(30) DEFAULT 'yeni',
                notes TEXT,
                created_at DATETIME
            );
        """)
        cur_root.execute("""
            CREATE TABLE IF NOT EXISTS tenant_invoices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tenant_id INTEGER,
                invoice_no VARCHAR(50) UNIQUE,
                tenant_name VARCHAR(100),
                period VARCHAR(50),
                amount REAL,
                plan VARCHAR(30),
                payment_method VARCHAR(30),
                status VARCHAR(20) DEFAULT 'paid',
                due_date DATETIME,
                paid_at DATETIME,
                created_at DATETIME
            );
        """)

        # Sync tenants
        for t in tenants:
            t_dict = dict(zip(tenant_cols, t))
            cur_root.execute(
                """
                INSERT INTO restaurant_tenants (
                    id, code, name, owner_name, phone, email, city, tax_number,
                    tax_office, address, plan, monthly_price, billing_cycle,
                    status, trial_ends_at, renewal_date, payment_method,
                    payment_status, notes, created_at, updated_at
                ) VALUES (
                    :id, :code, :name, :owner_name, :phone, :email, :city, :tax_number,
                    :tax_office, :address, :plan, :monthly_price, :billing_cycle,
                    :status, :trial_ends_at, :renewal_date, :payment_method,
                    :payment_status, :notes, :created_at, :updated_at
                )
                ON CONFLICT(code) DO UPDATE SET
                    name = excluded.name,
                    owner_name = excluded.owner_name,
                    phone = excluded.phone,
                    email = excluded.email,
                    city = excluded.city,
                    tax_number = excluded.tax_number,
                    tax_office = excluded.tax_office,
                    address = excluded.address,
                    plan = excluded.plan,
                    monthly_price = excluded.monthly_price,
                    billing_cycle = excluded.billing_cycle,
                    status = excluded.status,
                    trial_ends_at = excluded.trial_ends_at,
                    renewal_date = excluded.renewal_date,
                    payment_method = excluded.payment_method,
                    payment_status = excluded.payment_status,
                    notes = excluded.notes,
                    updated_at = excluded.updated_at;
                """,
                t_dict,
            )

        # Sync leads
        for l in leads:
            l_dict = dict(zip(lead_cols, l))
            cur_root.execute(
                """
                INSERT OR REPLACE INTO tenant_leads (
                    id, full_name, phone, company_name, business_type, city, status, notes, created_at
                ) VALUES (
                    :id, :full_name, :phone, :company_name, :business_type, :city, :status, :notes, :created_at
                );
                """,
                l_dict,
            )

        # Sync invoices
        for i in invoices:
            i_dict = dict(zip(inv_cols, i))
            cur_root.execute(
                """
                INSERT OR REPLACE INTO tenant_invoices (
                    id, tenant_id, invoice_no, tenant_name, period, amount, plan,
                    payment_method, status, due_date, paid_at, created_at
                ) VALUES (
                    :id, :tenant_id, :invoice_no, :tenant_name, :period, :amount, :plan,
                    :payment_method, :status, :due_date, :paid_at, :created_at
                );
                """,
                i_dict,
            )

        conn_root.commit()
        cur_root.execute("PRAGMA wal_checkpoint(TRUNCATE);")
        cur_root.execute("PRAGMA integrity_check;")
        assert cur_root.fetchall() == [("ok",)], "Root master DB integrity check failed"
        conn_root.close()
        print("[M1] Successfully synchronized backend/master.db with canonical data.")

    # Checkpoint and integrity check data/master.db
    cur_data.execute("PRAGMA wal_checkpoint(TRUNCATE);")
    cur_data.execute("PRAGMA integrity_check;")
    assert cur_data.fetchall() == [("ok",)], "Data master DB integrity check failed"
    conn_data.close()
    print("[M1] PASS: Both master databases synchronized and integrity verified.")


if __name__ == "__main__":
    print("==================================================")
    print("BONCORE MILESTONE 1: DATABASE LAYER OPTIMIZATION")
    print("==================================================")
    execute_fatihciftligi_fixes()
    execute_master_db_sync()
    print("\n[M1] ALL DATABASE MIGRATIONS AND OPTIMIZATIONS COMPLETED SUCCESSFULLY!")
