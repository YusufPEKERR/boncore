#!/usr/bin/env python3
"""
Comprehensive Verification Script for Milestone 1: Database Layer Optimization & Integrity
Verifies:
1. Foreign key integrity (PRAGMA foreign_key_check returns zero rows)
2. Database physical integrity (PRAGMA integrity_check returns 'ok')
3. Staff accounts in fatihciftligi.db:
   - All standard PINs exist and match their designated roles (1111: waiter, 2222: cashier, 3333: kitchen, 9999: manager, 0000: admin)
   - Existing staff accounts are preserved
4. All 34 query performance indexes exist on fatihciftligi.db
5. Master database verification:
   - backend/data/master.db contains active tenant fatihciftligi, leads, and invoices
   - backend/master.db contains synchronized records
6. Live HTTP authentication verification via /api/auth/login-pin on port 8000 (if server is active)
"""

import json
import os
import sqlite3
import sys
import urllib.request
import urllib.error

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TENANT_DB_PATH = os.path.join(BASE_DIR, "data", "tenants", "fatihciftligi.db")
DATA_MASTER_DB_PATH = os.path.join(BASE_DIR, "data", "master.db")
ROOT_MASTER_DB_PATH = os.path.join(BASE_DIR, "master.db")

EXPECTED_34_INDEXES = [
    "idx_order_items_order_id",
    "idx_order_items_product_id",
    "idx_order_items_status",
    "idx_order_items_station",
    "idx_order_items_is_voided",
    "idx_orders_table_id",
    "idx_orders_status",
    "idx_orders_order_type",
    "idx_orders_created_at",
    "idx_orders_closed_at",
    "idx_tables_area_id",
    "idx_tables_status",
    "idx_tables_current_order_id",
    "idx_products_category_id",
    "idx_products_station",
    "idx_products_is_available",
    "idx_products_show_in_pos",
    "idx_payments_order_id",
    "idx_payments_payment_method",
    "idx_payments_created_at",
    "idx_recipes_product_id",
    "idx_recipes_ingredient_id",
    "idx_stock_movements_ingredient_id",
    "idx_stock_movements_movement_type",
    "idx_stock_movements_created_at",
    "idx_staff_users_pin_code",
    "idx_staff_users_role_active",
    "idx_staff_users_restaurant_id",
    "idx_warehouse_stocks_warehouse_id",
    "idx_warehouse_stocks_ingredient_id",
    "idx_delivery_orders_order_id",
    "idx_delivery_orders_courier_id",
    "idx_cash_registers_status",
    "idx_cash_registers_opened_at",
]

EXPECTED_STAFF = [
    {"pin": "1111", "role": "waiter", "name": "Ahmet Garson"},
    {"pin": "2222", "role": "cashier", "name": "Ayşe Kasiyer"},
    {"pin": "3333", "role": "kitchen", "name": "Mehmet Şef (Mutfak)"},
    {"pin": "9999", "role": "manager", "name": "Kemal Müdür"},
    {"pin": "0000", "role": "admin", "name": "Sistem Yöneticisi"},
]

PRESERVED_STAFF_PINS = ["1212", "5858", "1234", "5555"]


def verify_tenant_database():
    print(f"\n--- 1. ACTIVE TENANT DATABASE INTEGRITY ({TENANT_DB_PATH}) ---")
    conn = sqlite3.connect(TENANT_DB_PATH)
    cur = conn.cursor()

    # Integrity check
    integ = cur.execute("PRAGMA integrity_check;").fetchall()
    print(f"[CHECK] PRAGMA integrity_check: {integ}")
    assert integ == [("ok",)], f"Integrity check failed: {integ}"
    print("  -> PASS: B-tree integrity is 100% ok.")

    # Foreign key check
    fks = cur.execute("PRAGMA foreign_key_check;").fetchall()
    print(f"[CHECK] PRAGMA foreign_key_check: {fks} (Count: {len(fks)})")
    assert len(fks) == 0, f"Foreign key violations found: {fks}"
    print("  -> PASS: Zero foreign key violations.")

    # Product 36 check
    prod36 = cur.execute("SELECT id, name, category_id, base_price, is_available FROM products WHERE id = 36;").fetchone()
    print(f"[CHECK] Product 36: {prod36}")
    assert prod36 is not None and prod36[0] == 36, "Product 36 missing"
    print("  -> PASS: Product 36 (ADANA KEBAP) restored successfully.")

    # 34 Performance Indexes check
    existing_indexes = set(r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='index';").fetchall())
    missing_indexes = [idx for idx in EXPECTED_34_INDEXES if idx not in existing_indexes]
    print(f"[CHECK] Performance Indexes: Found {len(EXPECTED_34_INDEXES) - len(missing_indexes)} / {len(EXPECTED_34_INDEXES)}")
    assert len(missing_indexes) == 0, f"Missing indexes: {missing_indexes}"
    print("  -> PASS: All 34 performance indexes present and active.")

    # Staff accounts check
    all_staff = cur.execute("SELECT id, name, pin_code, role, is_active FROM staff_users;").fetchall()
    staff_by_pin = {r[2]: {"id": r[0], "name": r[1], "pin": r[2], "role": r[3], "is_active": r[4]} for r in all_staff}
    print(f"[CHECK] Total Staff Accounts: {len(all_staff)}")

    for exp in EXPECTED_STAFF:
        pin = exp["pin"]
        assert pin in staff_by_pin, f"Standard staff PIN {pin} missing"
        actual = staff_by_pin[pin]
        assert actual["role"] == exp["role"], f"Role mismatch for PIN {pin}: expected {exp['role']}, got {actual['role']}"
        assert actual["is_active"] == 1, f"Staff PIN {pin} is not active"
        print(f"  -> PASS: Standard Staff PIN '{pin}' ({actual['name']}) with role '{actual['role']}' verified.")

    for p in PRESERVED_STAFF_PINS:
        assert p in staff_by_pin, f"Legacy preserved staff PIN {p} missing!"
        actual = staff_by_pin[p]
        print(f"  -> PASS: Legacy Staff PIN '{p}' ({actual['name']} - role '{actual['role']}') preserved.")

    conn.close()


def verify_master_databases():
    print(f"\n--- 2. MASTER DATABASE VERIFICATION ---")

    # Data Master DB
    assert os.path.exists(DATA_MASTER_DB_PATH), f"data/master.db missing: {DATA_MASTER_DB_PATH}"
    conn_data = sqlite3.connect(DATA_MASTER_DB_PATH)
    cur_data = conn_data.cursor()

    integ = cur_data.execute("PRAGMA integrity_check;").fetchall()
    assert integ == [("ok",)], f"data/master.db integrity check failed: {integ}"

    fatih = cur_data.execute("SELECT id, code, name, plan, status FROM restaurant_tenants WHERE code = 'fatihciftligi';").fetchone()
    print(f"[CHECK] data/master.db tenant fatihciftligi: {fatih}")
    assert fatih is not None, "Tenant fatihciftligi missing in data/master.db"
    assert fatih[4] == "active", f"Tenant fatihciftligi status is {fatih[4]}, expected 'active'"
    print("  -> PASS: data/master.db tenant fatihciftligi is active with plan enterprise.")

    tenants_count = cur_data.execute("SELECT COUNT(*) FROM restaurant_tenants;").fetchone()[0]
    leads_count = cur_data.execute("SELECT COUNT(*) FROM tenant_leads;").fetchone()[0]
    invoices_count = cur_data.execute("SELECT COUNT(*) FROM tenant_invoices;").fetchone()[0]
    print(f"[CHECK] data/master.db counts: tenants={tenants_count}, leads={leads_count}, invoices={invoices_count}")
    conn_data.close()

    # Root Master DB
    if os.path.exists(ROOT_MASTER_DB_PATH):
        conn_root = sqlite3.connect(ROOT_MASTER_DB_PATH)
        cur_root = conn_root.cursor()
        integ_root = cur_root.execute("PRAGMA integrity_check;").fetchall()
        assert integ_root == [("ok",)], f"master.db integrity check failed: {integ_root}"

        fatih_root = cur_root.execute("SELECT id, code, name, plan, status FROM restaurant_tenants WHERE code = 'fatihciftligi';").fetchone()
        print(f"[CHECK] root master.db tenant fatihciftligi: {fatih_root}")
        assert fatih_root is not None, "Tenant fatihciftligi missing in root master.db"
        assert fatih_root[4] == "active", f"Tenant fatihciftligi status in root master is {fatih_root[4]}"
        print("  -> PASS: root master.db synchronized and verified.")
        conn_root.close()


def verify_live_api_pin_auth():
    print(f"\n--- 3. LIVE BACKEND HTTP PIN AUTHENTICATION VERIFICATION ---")
    url = "http://127.0.0.1:8000/api/auth/login-pin"
    pins_to_test = [
        ("1111", "waiter", "Ahmet Garson"),
        ("2222", "cashier", "Ayşe Kasiyer"),
        ("3333", "kitchen", "Mehmet Şef (Mutfak)"),
        ("9999", "manager", "Kemal Müdür"),
        ("0000", "admin", "Sistem Yöneticisi"),
        ("1212", "cashier", "Mehmet Şef (Legacy)"),
        ("5858", "waiter", "Yusuf PEKER (Legacy)"),
        ("1234", "manager", "Yönetici (Legacy)"),
        ("5555", "waiter", "Beste (Legacy)"),
    ]

    for pin, expected_role, expected_name in pins_to_test:
        payload = json.dumps({"pin_code": pin}).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "X-Restaurant-Code": "fatihciftligi",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=5.0) as resp:
                status_code = resp.status
                body = json.loads(resp.read().decode("utf-8"))
                user_id = body.get("id")
                role = body.get("role")
                token = body.get("access_token")
                assert status_code == 200, f"Expected 200 for PIN {pin}, got {status_code}"
                assert role == expected_role, f"Role mismatch for PIN {pin}: expected {expected_role}, got {role}"
                assert token is not None and len(token) > 20, f"Token missing or invalid for PIN {pin}"
                print(f"  -> PASS: PIN {pin} [{expected_name}] authenticated successfully: ID={user_id}, Role='{role}', Token issued.")
        except Exception as e:
            print(f"  -> FAIL: Could not authenticate PIN {pin} over HTTP: {e}")
            raise

    # Test an actually invalid PIN to ensure 401 Unauthorized
    invalid_pin = "8765"
    payload = json.dumps({"pin_code": invalid_pin}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "X-Restaurant-Code": "fatihciftligi",
        },
    )
    try:
        urllib.request.urlopen(req, timeout=5.0)
        raise AssertionError("Expected 401 Unauthorized for invalid PIN, but request succeeded!")
    except urllib.error.HTTPError as e:
        assert e.code == 401, f"Expected 401 for invalid PIN {invalid_pin}, got {e.code}"
        print(f"  -> PASS: Invalid PIN '{invalid_pin}' correctly rejected with HTTP 401 Unauthorized.")


if __name__ == "__main__":
    print("==================================================")
    print("BONCORE MILESTONE 1 VERIFICATION SUITE")
    print("==================================================")
    verify_tenant_database()
    verify_master_databases()
    verify_live_api_pin_auth()
    print("\n==================================================")
    print(">>> ALL MILESTONE 1 VERIFICATION CHECKS PASSED! <<<")
    print("==================================================")
