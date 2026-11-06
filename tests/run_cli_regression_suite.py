#!/usr/bin/env python3
"""
BonCore Unified Automated Regression Test Suite & E2E Verification Runner
==========================================================================
Executable directly via CLI:
    python tests/run_cli_regression_suite.py

Milestone 4: Automated Regression Test Suite & E2E Testing
Coverage Tiers:
    1. Database Layer (B-Tree Integrity, Foreign Keys, 34 Indexes, Master DB Tenants)
    2. Role Authentication & RBAC (Garson, Kasiyer, Mutfak, Yönetici, Admin, SuperAdmin, 401 Rejections)
    3. End-to-End Operational Lifecycle (Waiter, Kitchen/KDS, Cashier, Manager, Admin, SuperAdmin)
    4. Integrated Subsystem Tests (Backend Go `go test ./...` & Frontend `npm test`)
    5. Stability & Zero-500 Invariant Verification
"""

import os
import sys
import json
import time
import sqlite3
import subprocess
import urllib.request
import urllib.parse
import urllib.error

# Ensure UTF-8 console output on Windows
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE_URL = "http://127.0.0.1:8000"

TENANT_DB_PATH = os.path.join(ROOT_DIR, "backend", "data", "tenants", "fatihciftligi.db")
DATA_MASTER_DB_PATH = os.path.join(ROOT_DIR, "backend", "data", "master.db")
ROOT_MASTER_DB_PATH = os.path.join(ROOT_DIR, "backend", "master.db")

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

EXPECTED_STAFF_ACCOUNTS = [
    {"pin": "1111", "role": "waiter", "name": "Ahmet Garson"},
    {"pin": "2222", "role": "cashier", "name": "Ayşe Kasiyer"},
    {"pin": "3333", "role": "kitchen", "name": "Mehmet Şef (Mutfak)"},
    {"pin": "9999", "role": "manager", "name": "Kemal Müdür"},
    {"pin": "0000", "role": "admin", "name": "Sistem Yöneticisi"},
]

PRESERVED_LEGACY_PINS = ["1212", "5858", "1234", "5555"]


class RegressionSuiteRunner:
    def __init__(self):
        self.total_tests = 0
        self.passed_tests = 0
        self.failed_tests = 0
        self.http_500_count = 0
        self.total_requests = 0
        self.errors = []
        self.tier_stats = {}
        self.current_tier = ""
        self.server_process = None
        self.start_time = 0

    def start_tier(self, tier_id, tier_name):
        self.current_tier = f"Tier {tier_id}: {tier_name}"
        self.tier_stats[self.current_tier] = {"passed": 0, "failed": 0}
        print("\n" + "=" * 78)
        print(f"  [TIER {tier_id}] {tier_name.upper()}")
        print("=" * 78)

    def assert_true(self, condition, message):
        self.total_tests += 1
        if condition:
            self.passed_tests += 1
            if self.current_tier in self.tier_stats:
                self.tier_stats[self.current_tier]["passed"] += 1
            print(f"  [PASS] {message}")
            return True
        else:
            self.failed_tests += 1
            if self.current_tier in self.tier_stats:
                self.tier_stats[self.current_tier]["failed"] += 1
            err_msg = f"[{self.current_tier}] FAIL: {message}"
            print(f"  [FAIL] {message}")
            self.errors.append(err_msg)
            return False

    def request(self, method, path, data=None, headers=None, expected_status=(200, 201)):
        self.total_requests += 1
        url = f"{BASE_URL}{path}"
        req_headers = {"Content-Type": "application/json"}
        if headers:
            req_headers.update(headers)

        req_body = None
        if data is not None:
            req_body = json.dumps(data).encode("utf-8")

        req = urllib.request.Request(url, data=req_body, headers=req_headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                status = resp.status
                body = resp.read().decode("utf-8", errors="replace")
                content_type = resp.headers.get("Content-Type", "")
                res_data = None
                if "application/json" in content_type:
                    try:
                        res_data = json.loads(body)
                    except Exception:
                        res_data = body
                else:
                    res_data = body

                if status == 500:
                    self.http_500_count += 1

                self.assert_true(
                    status in expected_status,
                    f"{method} {path} returned HTTP {status} (expected {expected_status})"
                )
                return res_data
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            if e.code == 500:
                self.http_500_count += 1

            matched = e.code in expected_status
            self.assert_true(
                matched,
                f"{method} {path} returned HTTP {e.code} (expected {expected_status}): {body[:150]}"
            )
            if matched:
                try:
                    return json.loads(body)
                except Exception:
                    return body
            return None
        except Exception as e:
            self.assert_true(False, f"{method} {path} network exception: {e}")
            return None

    def ensure_server_running(self):
        try:
            req = urllib.request.Request(f"{BASE_URL}/health")
            with urllib.request.urlopen(req, timeout=2.0) as resp:
                if resp.status == 200:
                    print(f"  [INFO] Go Fiber server detected active on port 8000.")
                    return True
        except Exception:
            pass

        print(f"  [INFO] Go Fiber server not responding. Launching boncore-pos-server.exe...")
        exe_path = os.path.join(ROOT_DIR, "backend-go", "boncore-pos-server.exe")
        backend_dir = os.path.join(ROOT_DIR, "backend-go")

        if os.path.exists(exe_path):
            self.server_process = subprocess.Popen(
                [exe_path],
                cwd=backend_dir,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
        else:
            self.server_process = subprocess.Popen(
                ["go", "run", "./cmd/server"],
                cwd=backend_dir,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )

        # Wait up to 12 seconds for server to be healthy
        for i in range(24):
            time.sleep(0.5)
            try:
                req = urllib.request.Request(f"{BASE_URL}/health")
                with urllib.request.urlopen(req, timeout=1.0) as resp:
                    if resp.status == 200:
                        print(f"  [INFO] Go Fiber server launched successfully (PID: {self.server_process.pid}).")
                        return True
            except Exception:
                pass

        print(f"  [ERROR] Failed to connect to Go Fiber server on port 8000.")
        return False

    def cleanup(self):
        if self.server_process:
            print(f"  [INFO] Terminating spawned server process (PID: {self.server_process.pid})...")
            try:
                self.server_process.terminate()
                self.server_process.wait(timeout=3)
            except Exception:
                self.server_process.kill()

    # -------------------------------------------------------------------------
    # TIER 1: DATABASE LAYER INTEGRITY
    # -------------------------------------------------------------------------
    def run_tier_1_database(self):
        self.start_tier(1, "Database Layer & Physical Integrity Verification")

        # 1.1 Tenant Database B-Tree Integrity Check
        self.assert_true(os.path.exists(TENANT_DB_PATH), f"Tenant database exists at {TENANT_DB_PATH}")
        conn = sqlite3.connect(TENANT_DB_PATH)
        cur = conn.cursor()

        integ = cur.execute("PRAGMA integrity_check;").fetchall()
        self.assert_true(integ == [("ok",)], f"Tenant DB PRAGMA integrity_check returns 'ok'")

        # 1.2 Tenant Database Foreign Key Check
        fks = cur.execute("PRAGMA foreign_key_check;").fetchall()
        self.assert_true(len(fks) == 0, f"Tenant DB PRAGMA foreign_key_check returned 0 violations (got {len(fks)})")

        # 1.3 Product 36 (ADANA KEBAP) Integrity Check
        prod36 = cur.execute("SELECT id, name, base_price, is_available FROM products WHERE id = 36;").fetchone()
        self.assert_true(
            prod36 is not None and prod36[0] == 36 and "ADANA KEBAP" in prod36[1],
            f"Product 36 (ADANA KEBAP) verified present in catalog (Price: {prod36[2] if prod36 else 'N/A'})"
        )

        # 1.4 All 34 Performance Indexes Present
        existing_indexes = set(r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='index';").fetchall())
        missing_indexes = [idx for idx in EXPECTED_34_INDEXES if idx not in existing_indexes]
        self.assert_true(
            len(missing_indexes) == 0,
            f"All 34 performance indexes present in tenant DB (missing: {missing_indexes})"
        )

        # 1.5 Standard and Legacy Staff Accounts in Tenant DB
        all_staff = cur.execute("SELECT id, name, pin_code, role, is_active FROM staff_users;").fetchall()
        staff_by_pin = {r[2]: {"id": r[0], "name": r[1], "role": r[3], "is_active": r[4]} for r in all_staff}
        self.assert_true(len(all_staff) >= 9, f"Tenant DB staff accounts count >= 9 (found {len(all_staff)})")

        for expected in EXPECTED_STAFF_ACCOUNTS:
            pin = expected["pin"]
            role = expected["role"]
            exists = pin in staff_by_pin
            self.assert_true(
                exists and staff_by_pin[pin]["role"] == role and staff_by_pin[pin]["is_active"] == 1,
                f"Staff PIN '{pin}' ({expected['name']}) verified with role '{role}'"
            )

        for l_pin in PRESERVED_LEGACY_PINS:
            self.assert_true(
                l_pin in staff_by_pin,
                f"Legacy staff PIN '{l_pin}' ({staff_by_pin.get(l_pin, {}).get('name', 'N/A')}) preserved"
            )

        # 1.6 Floor Areas and Tables Count
        areas_count = cur.execute("SELECT COUNT(*) FROM areas;").fetchone()[0]
        tables_count = cur.execute("SELECT COUNT(*) FROM tables;").fetchone()[0]
        self.assert_true(areas_count >= 8, f"Tenant floor areas count >= 8 (found {areas_count})")
        self.assert_true(tables_count >= 130, f"Tenant tables count >= 130 (found {tables_count})")
        conn.close()

        # 1.7 Master SQLite Database Integrity & Active Tenant Verification
        self.assert_true(os.path.exists(DATA_MASTER_DB_PATH), f"Master DB exists at {DATA_MASTER_DB_PATH}")
        m_conn = sqlite3.connect(DATA_MASTER_DB_PATH)
        m_cur = m_conn.cursor()

        m_integ = m_cur.execute("PRAGMA integrity_check;").fetchall()
        self.assert_true(m_integ == [("ok",)], f"data/master.db PRAGMA integrity_check returns 'ok'")

        fatih_tenant = m_cur.execute(
            "SELECT id, code, name, plan, status FROM restaurant_tenants WHERE code = 'fatihciftligi';"
        ).fetchone()
        self.assert_true(
            fatih_tenant is not None and fatih_tenant[4] == "active",
            f"data/master.db tenant 'fatihciftligi' is active (plan: {fatih_tenant[3] if fatih_tenant else 'N/A'})"
        )

        m_tenants = m_cur.execute("SELECT COUNT(*) FROM restaurant_tenants;").fetchone()[0]
        m_leads = m_cur.execute("SELECT COUNT(*) FROM tenant_leads;").fetchone()[0]
        m_invoices = m_cur.execute("SELECT COUNT(*) FROM tenant_invoices;").fetchone()[0]
        self.assert_true(m_tenants >= 3, f"data/master.db registered tenants >= 3 (found {m_tenants})")
        self.assert_true(m_leads >= 3, f"data/master.db tenant leads >= 3 (found {m_leads})")
        self.assert_true(m_invoices >= 5, f"data/master.db tenant invoices >= 5 (found {m_invoices})")
        m_conn.close()

        # 1.8 Root Master DB Synchronized Check
        if os.path.exists(ROOT_MASTER_DB_PATH):
            r_conn = sqlite3.connect(ROOT_MASTER_DB_PATH)
            r_cur = r_conn.cursor()
            r_integ = r_cur.execute("PRAGMA integrity_check;").fetchall()
            self.assert_true(r_integ == [("ok",)], f"root master.db PRAGMA integrity_check returns 'ok'")
            r_conn.close()

    # -------------------------------------------------------------------------
    # TIER 2: ROLE AUTHENTICATION & RBAC
    # -------------------------------------------------------------------------
    def run_tier_2_auth_rbac(self):
        self.start_tier(2, "Role Authentication & RBAC Access Control")

        tokens = {}

        # 2.1 Staff PIN Authentication Matrix (5 Roles)
        auth_matrix = [
            ("1111", "waiter", "Garson"),
            ("2222", "cashier", "Kasiyer"),
            ("3333", "kitchen", "Mutfak"),
            ("9999", "manager", "Yönetici"),
            ("0000", "admin", "Admin"),
        ]

        for pin, expected_role, role_label in auth_matrix:
            res = self.request(
                "POST",
                "/api/auth/login-pin",
                data={"pin_code": pin},
                headers={"X-Restaurant-Code": "fatihciftligi"},
                expected_status=(200,)
            )
            self.assert_true(
                res and res.get("role") == expected_role and res.get("access_token"),
                f"Role {role_label} (PIN {pin}) authenticated: role='{res.get('role') if res else 'N/A'}' & token issued"
            )
            if res and res.get("access_token"):
                tokens[expected_role] = res["access_token"]

        # 2.2 SuperAdmin Master Login
        sa_res = self.request(
            "POST",
            "/api/master/login",
            data={"username": "superadmin", "password": "boncore2026master"},
            expected_status=(200,)
        )
        self.assert_true(
            sa_res and sa_res.get("access_token") and sa_res.get("user", {}).get("role") == "master_admin",
            f"SuperAdmin master login authenticated: role='master_admin' & master access token issued"
        )
        if sa_res and sa_res.get("access_token"):
            tokens["superadmin"] = sa_res["access_token"]

        # 2.3 Invalid Staff PIN Rejection (401 Unauthorized)
        invalid_pin_res = self.request(
            "POST",
            "/api/auth/login-pin",
            data={"pin_code": "9876"},
            expected_status=(401,)
        )
        self.assert_true(
            invalid_pin_res is not None,
            "Invalid staff PIN '9876' rejected with HTTP 401 Unauthorized"
        )

        # 2.4 Invalid Master Admin Credentials Rejection (401 Unauthorized)
        invalid_sa_res = self.request(
            "POST",
            "/api/master/login",
            data={"username": "superadmin", "password": "wrong_password_999"},
            expected_status=(401,)
        )
        self.assert_true(
            invalid_sa_res is not None,
            "Invalid SuperAdmin password rejected with HTTP 401 Unauthorized"
        )

        # 2.5 Default Fallback Tenant Code Alignment (Unheadered Request)
        unheadered_areas = self.request("GET", "/api/tables/areas", expected_status=(200,))
        self.assert_true(
            isinstance(unheadered_areas, list) and len(unheadered_areas) >= 8,
            f"Unheadered request seamlessly resolved default tenant 'fatihciftligi' ({len(unheadered_areas) if unheadered_areas else 0} areas)"
        )

        return tokens

    # -------------------------------------------------------------------------
    # TIER 3: END-TO-END OPERATIONAL LIFECYCLE
    # -------------------------------------------------------------------------
    def run_tier_3_operational_lifecycle(self, tokens):
        self.start_tier(3, "End-to-End Operational Lifecycle Across All 6 Roles")

        waiter_headers = {"Authorization": f"Bearer {tokens.get('waiter', '')}", "X-User-Role": "waiter"}
        cashier_headers = {"Authorization": f"Bearer {tokens.get('cashier', '')}", "X-User-Role": "cashier"}
        kitchen_headers = {"Authorization": f"Bearer {tokens.get('kitchen', '')}", "X-User-Role": "kitchen"}
        manager_headers = {"Authorization": f"Bearer {tokens.get('manager', '')}", "X-User-Role": "manager"}
        admin_headers = {"Authorization": f"Bearer {tokens.get('admin', '')}", "X-User-Role": "admin"}
        sa_headers = {"Authorization": f"Bearer {tokens.get('superadmin', '')}"}

        # ---------------------------------------------------------------------
        # 3.1 Garson (Waiter) Journey: Tables -> Selection -> Order Creation
        # ---------------------------------------------------------------------
        print("\n  --- [3.1] GARSON (WAITER) OPERATIONAL JOURNEY ---")
        areas = self.request("GET", "/api/tables/areas", headers=waiter_headers)
        empty_table = None
        if isinstance(areas, list):
            for a in areas:
                for tb in a.get("tables", []):
                    if tb.get("status") == "empty":
                        empty_table = tb
                        break
                if empty_table:
                    break

        self.assert_true(
            empty_table is not None,
            f"Garson viewed floor layout and selected empty table '{empty_table.get('name') if empty_table else 'None'}' (ID: {empty_table.get('id') if empty_table else 'N/A'})"
        )

        table_id = empty_table["id"] if empty_table else 1
        table_name = empty_table.get("name", "Masa") if empty_table else "Masa 1"

        # Catalog lookup for menu product
        categories = self.request("GET", "/api/products/categories", headers=waiter_headers)
        selected_prod = None
        if isinstance(categories, list):
            for c in categories:
                prods = c.get("products", [])
                if prods:
                    selected_prod = prods[0]
                    break

        self.assert_true(
            selected_prod is not None,
            f"Garson selected product '{selected_prod.get('name') if selected_prod else 'N/A'}' (ID: {selected_prod.get('id') if selected_prod else 'N/A'}) from menu"
        )
        prod_id = selected_prod["id"] if selected_prod else 36

        # Garson creates dine-in order with modifiers
        order_payload = {
            "table_id": table_id,
            "order_type": "dine_in",
            "waiter_name": "Ahmet Garson",
            "kuver_count": 2,
            "items": [
                {
                    "product_id": prod_id,
                    "quantity": 1,
                    "selected_modifiers": [
                        {"group": "Pişme Derecesi", "name": "Orta (Medium)", "price": 0.0},
                        {"group": "Sos Tercihi", "name": "Trüf Mayonez", "price": 30.0}
                    ],
                    "negative_modifiers": ["Soğansız", "Tuzsuz"],
                    "kitchen_note": "Milestone 4 Regresyon Siparişi - Sıcak Servis",
                    "course_stage": 1,
                    "is_hold": False
                }
            ]
        }
        create_res = self.request("POST", "/api/orders/create", data=order_payload, headers=waiter_headers)
        self.assert_true(
            create_res and create_res.get("status") == "success",
            "Order creation response returned status: 'success'"
        )
        self.assert_true(
            create_res and "order_id" in create_res and "id" in create_res,
            "Order response contains compatible JSON keys: 'order_id' and 'id'"
        )
        self.assert_true(
            create_res and "order_number" in create_res,
            f"Order assigned unique order number #{create_res.get('order_number') if create_res else 'N/A'}"
        )

        order_id = create_res.get("order_id") if create_res else None

        # Verify Table Status immediately transitioned to 'occupied'
        areas_check = self.request("GET", "/api/tables/areas", headers=waiter_headers)
        found_tbl = None
        if isinstance(areas_check, list):
            for a in areas_check:
                for tb in a.get("tables", []):
                    if tb.get("id") == table_id:
                        found_tbl = tb
                        break
        self.assert_true(
            found_tbl and found_tbl.get("status") == "occupied",
            f"Table {table_id} ({table_name}) status confirmed transitioned to 'occupied'"
        )

        # Garson adds additional item to existing order (Course 2)
        add_res = self.request(
            "POST",
            f"/api/orders/{order_id}/add-items",
            data={
                "items": [
                    {
                        "product_id": prod_id,
                        "quantity": 1,
                        "kitchen_note": "Course 2 İlave Ürün",
                        "course_stage": 2,
                        "is_hold": True
                    }
                ],
                "waiter_name": "Ahmet Garson"
            },
            headers=waiter_headers
        )
        self.assert_true(
            add_res and add_res.get("status") == "success",
            f"Garson added Course 2 items to order #{order_id} with status: 'success'"
        )

        # Garson triggers fire for hold item
        ord_details = self.request("GET", f"/api/orders/{order_id}", headers=waiter_headers)
        hold_items = [it for it in ord_details.get("items", []) if it.get("is_hold")] if ord_details else []
        if hold_items:
            fire_res = self.request(
                "POST",
                "/api/orders/hold-fire",
                data={"order_item_ids": [hold_items[0]["id"]], "action": "fire"},
                headers=waiter_headers
            )
            self.assert_true(
                fire_res and fire_res.get("status") == "success",
                f"Garson fired held item (ID: {hold_items[0]['id']}) to kitchen"
            )

        # ---------------------------------------------------------------------
        # 3.2 Mutfak (Kitchen/KDS) Journey: Ticket Fetch -> Status Progression
        # ---------------------------------------------------------------------
        print("\n  --- [3.2] MUTFAK (KITCHEN/KDS) OPERATIONAL JOURNEY ---")
        kds_orders = self.request("GET", "/api/kds/orders?station=all", headers=kitchen_headers)
        self.assert_true(
            isinstance(kds_orders, list) and len(kds_orders) > 0,
            f"Mutfak retrieved active KDS tickets queue ({len(kds_orders) if kds_orders else 0} active tickets)"
        )

        target_kds_item = None
        if isinstance(kds_orders, list):
            for ko in kds_orders:
                if ko.get("order_id") == order_id:
                    for it in ko.get("items", []):
                        target_kds_item = it
                        break
                if target_kds_item:
                    break

        if target_kds_item:
            kds_item_id = target_kds_item["id"]
            # Lifecycle: pending -> preparing -> ready -> served
            prep_res = self.request(
                "POST",
                f"/api/kds/item/{kds_item_id}/progress?status=preparing",
                headers=kitchen_headers
            )
            self.assert_true(prep_res is not None, f"Mutfak advanced item {kds_item_id} status to 'preparing'")

            ready_res = self.request(
                "POST",
                f"/api/kds/item/{kds_item_id}/progress?status=ready",
                headers=kitchen_headers
            )
            self.assert_true(ready_res is not None, f"Mutfak advanced item {kds_item_id} status to 'ready'")

            served_res = self.request(
                "POST",
                f"/api/kds/item/{kds_item_id}/progress?status=served",
                headers=kitchen_headers
            )
            self.assert_true(served_res is not None, f"Mutfak advanced item {kds_item_id} status to 'served'")

        # Mutfak completes all tickets for order
        ready_all = self.request("POST", f"/api/kds/order/{order_id}/ready-all", headers=kitchen_headers)
        self.assert_true(ready_all is not None, f"Mutfak completed ready-all for order #{order_id}")

        # ---------------------------------------------------------------------
        # 3.3 Kasiyer (Cashier) Journey: Bill -> Discount -> Split Pay -> Empty Table
        # ---------------------------------------------------------------------
        print("\n  --- [3.3] KASIYER (CASHIER) OPERATIONAL JOURNEY ---")
        bill = self.request("GET", f"/api/orders/{order_id}", headers=cashier_headers)
        self.assert_true(
            bill and bill.get("remaining_total", 0) > 0,
            f"Kasiyer retrieved bill for order #{order_id} (Remaining: ₺{bill.get('remaining_total', 0) if bill else 0:.2f})"
        )

        # Apply Discount
        disc_res = self.request(
            "POST",
            f"/api/orders/{order_id}/discount",
            data={
                "discount_type": "percentage",
                "value": 10.0,
                "reason": "%10 Regresyon Test İndirimi",
                "operator_name": "Ayşe Kasiyer"
            },
            headers=cashier_headers
        )
        self.assert_true(
            disc_res and disc_res.get("status") == "success",
            "Kasiyer applied 10% discount successfully"
        )

        # Fetch bill after discount
        bill_after_disc = self.request("GET", f"/api/orders/{order_id}", headers=cashier_headers)
        rem_balance = bill_after_disc.get("remaining_total", 0.0) if bill_after_disc else 0.0
        self.assert_true(
            rem_balance > 0,
            f"Bill total adjusted after discount: ₺{rem_balance:.2f}"
        )

        # Partial Payment: Cash payment for half amount (keep table open)
        half_amount = round(rem_balance / 2, 2)
        part_pay = self.request(
            "POST",
            "/api/cashier/settle-payment",
            data={
                "order_id": order_id,
                "payments": [{"method": "cash", "amount": half_amount, "tip": 0.0}],
                "rounding": 0.0,
                "cashier_name": "Ayşe Kasiyer",
                "close_table": False
            },
            headers=cashier_headers
        )
        self.assert_true(
            part_pay and part_pay.get("status") == "success",
            f"Kasiyer recorded partial cash payment of ₺{half_amount:.2f} (table remains occupied)"
        )

        # Check remaining balance
        mid_bill = self.request("GET", f"/api/orders/{order_id}", headers=cashier_headers)
        remaining_to_settle = mid_bill.get("remaining_total", 0.0) if mid_bill else 0.0
        self.assert_true(
            remaining_to_settle > 0,
            f"Intermediate balance remaining before final settlement: ₺{remaining_to_settle:.2f}"
        )

        # Final Payment: Credit card settlement with close_table = True
        final_settle = self.request(
            "POST",
            "/api/cashier/settle-payment",
            data={
                "order_id": order_id,
                "payments": [{"method": "credit_card", "amount": remaining_to_settle, "tip": 0.0}],
                "rounding": 0.0,
                "cashier_name": "Ayşe Kasiyer",
                "close_table": True
            },
            headers=cashier_headers
        )
        self.assert_true(
            final_settle and final_settle.get("status") == "success",
            "Kasiyer finalized bill settlement with status: 'success'"
        )
        self.assert_true(
            final_settle and final_settle.get("table_status") == "empty",
            "Cashier settlement response explicitly confirmed table_status: 'empty'"
        )

        # Verify Thermal Receipt Slip ESC/POS Generation
        slip = self.request("GET", f"/api/fiscal/receipt/{order_id}/escpos", headers=cashier_headers)
        self.assert_true(
            slip and ("slip_text" in slip or "thermal_slip" in slip),
            "Thermal ESC/POS 80mm receipt generated with slip_text formatted layout"
        )

        # Verify GİB E-Adisyon Compliance
        e_adisyon = self.request("GET", f"/api/fiscal/e-adisyon/{order_id}", headers=cashier_headers)
        self.assert_true(
            e_adisyon and "ettn" in e_adisyon,
            f"GİB E-Adisyon generated with UUID ETTN: {e_adisyon.get('ettn') if e_adisyon else 'N/A'}"
        )

        # Verify Table Status in Floor Layout returned to strictly 'empty'
        areas_final = self.request("GET", "/api/tables/areas", headers=cashier_headers)
        closed_tbl = None
        if isinstance(areas_final, list):
            for a in areas_final:
                for tb in a.get("tables", []):
                    if tb.get("id") == table_id:
                        closed_tbl = tb
                        break
        self.assert_true(
            closed_tbl and closed_tbl.get("status") == "empty",
            f"Table {table_id} ({table_name}) verified successfully returned to 'empty' status"
        )

        # ---------------------------------------------------------------------
        # 3.4 Manager & Admin Journey: Analytics, X-Report, Staff, Settings
        # ---------------------------------------------------------------------
        print("\n  --- [3.4] YÖNETİCİ & ADMIN OPERATIONAL JOURNEY ---")
        analytics = self.request("GET", "/api/orders/analytics/statistics", headers=manager_headers)
        self.assert_true(
            analytics and "total_turnover" in analytics and "waiter_sales" in analytics,
            f"Manager fetched live restaurant KPIs (Turnover: ₺{analytics.get('total_turnover', 0) if analytics else 0:.2f})"
        )

        quoted_cashier = urllib.parse.quote("Ayşe Kasiyer")
        x_report = self.request("GET", f"/api/cashier/x-report?cashier_name={quoted_cashier}", headers=manager_headers)
        self.assert_true(
            x_report and "total_revenue" in x_report and "gross_sales" in x_report,
            "Manager retrieved in-day X-Report containing 'total_revenue' and 'gross_sales'"
        )

        staff_list = self.request("GET", "/api/auth/staff", headers=admin_headers)
        self.assert_true(
            isinstance(staff_list, list) and len(staff_list) >= 5,
            f"Admin fetched staff user directory ({len(staff_list) if staff_list else 0} staff members)"
        )

        settings = self.request("GET", "/api/settings/", headers=admin_headers)
        self.assert_true(
            settings and "restaurant_name" in settings,
            f"Admin retrieved restaurant settings ('{settings.get('restaurant_name') if settings else 'N/A'}')"
        )

        audit_logs = self.request("GET", "/api/audit/logs?limit=5", headers=admin_headers)
        self.assert_true(
            isinstance(audit_logs, list) and len(audit_logs) > 0,
            f"Admin retrieved security audit trail logs ({len(audit_logs) if audit_logs else 0} records)"
        )

        # ---------------------------------------------------------------------
        # 3.5 SuperAdmin Journey: SaaS Master Directory, Stats, Billing
        # ---------------------------------------------------------------------
        print("\n  --- [3.5] SUPERADMIN SAAS PLATFORM JOURNEY ---")
        sa_stats = self.request("GET", "/api/master/stats", headers=sa_headers)
        self.assert_true(
            sa_stats and sa_stats.get("total_tenants", 0) >= 3,
            f"SuperAdmin verified master platform stats ({sa_stats.get('total_tenants', 0) if sa_stats else 0} tenants, active: {sa_stats.get('active_tenants', 0) if sa_stats else 0})"
        )

        sa_tenants = self.request("GET", "/api/master/tenants", headers=sa_headers)
        codes = [t.get("code") for t in sa_tenants] if isinstance(sa_tenants, list) else []
        self.assert_true(
            "fatihciftligi" in codes,
            f"SuperAdmin verified active tenant 'fatihciftligi' in master tenants directory (Found: {codes})"
        )

        sa_invoices = self.request("GET", "/api/master/invoices", headers=sa_headers)
        self.assert_true(
            isinstance(sa_invoices, list) and len(sa_invoices) >= 5,
            f"SuperAdmin verified SaaS tenant billing invoices ({len(sa_invoices) if sa_invoices else 0} invoices)"
        )

        sa_leads = self.request("GET", "/api/master/leads", headers=sa_headers)
        self.assert_true(
            isinstance(sa_leads, list) and len(sa_leads) >= 3,
            f"SuperAdmin verified SaaS franchise/customer leads ({len(sa_leads) if sa_leads else 0} leads)"
        )

    # -------------------------------------------------------------------------
    # TIER 4: INTEGRATED SUBSYSTEM TESTS
    # -------------------------------------------------------------------------
    def run_tier_4_subsystems(self):
        self.start_tier(4, "Integrated Subsystem Verification (Go & React)")

        # 4.1 Backend Go Test Suite
        print("\n  --- [4.1] EXECUTING BACKEND GO TEST SUITE (`go test ./...`) ---")
        backend_dir = os.path.join(ROOT_DIR, "backend-go")
        try:
            go_proc = subprocess.run(
                ["go", "test", "./..."],
                cwd=backend_dir,
                capture_output=True,
                text=True,
                timeout=60
            )
            go_ok = go_proc.returncode == 0
            if go_ok:
                print("  " + "\n  ".join([line for line in go_proc.stdout.strip().splitlines() if "ok" in line or "PASS" in line]))
            else:
                print(f"  [DEBUG GO STDERR]: {go_proc.stderr[:300]}")
            self.assert_true(
                go_ok,
                f"Backend Go unit & integration tests (`go test ./...`) passed with exit code {go_proc.returncode}"
            )
        except Exception as e:
            self.assert_true(False, f"Backend Go test execution encountered exception: {e}")

        # 4.2 Frontend Node/React Test Suite
        print("\n  --- [4.2] EXECUTING FRONTEND TEST SUITE (`npm test`) ---")
        frontend_dir = os.path.join(ROOT_DIR, "frontend")
        try:
            # Using npm.cmd on Windows
            npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
            npm_proc = subprocess.run(
                [npm_cmd, "test"],
                cwd=frontend_dir,
                capture_output=True,
                text=True,
                timeout=60
            )
            npm_ok = npm_proc.returncode == 0
            out_lines = npm_proc.stdout.strip().splitlines()
            summary_lines = [l for l in out_lines if "pass" in l or "tests" in l or "suites" in l or "fail" in l]
            if summary_lines:
                print("  " + "\n  ".join(summary_lines[-5:]))
            self.assert_true(
                npm_ok,
                f"Frontend unit & interceptor tests (`npm test`) passed with exit code {npm_proc.returncode}"
            )
        except Exception as e:
            self.assert_true(False, f"Frontend npm test execution encountered exception: {e}")

    # -------------------------------------------------------------------------
    # TIER 5: STABILITY & ZERO-500 ASSERTION
    # -------------------------------------------------------------------------
    def run_tier_5_stability(self):
        self.start_tier(5, "System Stability, Invariants & Zero-500 Status Assertion")

        # 5.1 Invariant: HTTP 500 Responses
        self.assert_true(
            self.http_500_count == 0,
            f"Zero HTTP 500 Internal Server Errors encountered across test run (Observed: {self.http_500_count} on {self.total_requests} requests)"
        )

        # 5.2 Rapid Sequential Health & Endpoint Polling
        rapid_pass = True
        for i in range(5):
            res = self.request("GET", "/health", expected_status=(200,))
            if not res or res.get("status") != "healthy":
                rapid_pass = False
                break
        self.assert_true(
            rapid_pass,
            "Live server remained healthy and responsive under rapid sequential polling"
        )

        # 5.3 Active Table Status Consistency
        areas = self.request("GET", "/api/tables/areas", expected_status=(200,))
        valid_statuses = {"empty", "occupied", "bill_requested", "bill_printed", "reserved"}
        all_status_valid = True
        invalid_encountered = []
        if isinstance(areas, list):
            for a in areas:
                for tb in a.get("tables", []):
                    st = tb.get("status")
                    if st not in valid_statuses:
                        all_status_valid = False
                        invalid_encountered.append(f"Table {tb.get('id')}: {st}")
        self.assert_true(
            all_status_valid,
            f"All floor table statuses adhere strictly to valid enum values ('empty', 'occupied', etc.): {invalid_encountered if not all_status_valid else 'All valid'}"
        )

    # -------------------------------------------------------------------------
    # EXECUTION & SUMMARY
    # -------------------------------------------------------------------------
    def run(self):
        self.start_time = time.time()
        print("=" * 78)
        print("  BONCORE UNIFIED AUTOMATED REGRESSION TEST SUITE (MILESTONE 4)")
        print("  Full End-to-End E2E Lifecycle, Database Integrity & Role Workflows")
        print("=" * 78)

        if not self.ensure_server_running():
            print("\n[FATAL] Cannot proceed without active server. Exiting.")
            return False

        try:
            self.run_tier_1_database()
            tokens = self.run_tier_2_auth_rbac()
            self.run_tier_3_operational_lifecycle(tokens)
            self.run_tier_4_subsystems()
            self.run_tier_5_stability()
        finally:
            self.cleanup()

        elapsed = time.time() - self.start_time
        return self.print_summary(elapsed)

    def print_summary(self, elapsed):
        print("\n" + "=" * 78)
        print("  BONCORE REGRESSION TEST SUITE SUMMARY REPORT")
        print("=" * 78)

        for tier, stats in self.tier_stats.items():
            pass_str = f"{stats['passed']} PASSED"
            fail_str = f"{stats['failed']} FAILED" if stats['failed'] > 0 else "0 FAILED"
            status_tag = "[PASS]" if stats['failed'] == 0 else "[FAIL]"
            print(f"  {status_tag} {tier:<52} : {pass_str}, {fail_str}")

        print("-" * 78)
        print(f"  Total Assertions Checked : {self.total_tests}")
        print(f"  Total Assertions Passed  : {self.passed_tests}")
        print(f"  Total Assertions Failed  : {self.failed_tests}")
        print(f"  Total API Invocations    : {self.total_requests}")
        print(f"  Total HTTP 500 Responses : {self.http_500_count}")
        print(f"  Execution Time           : {elapsed:.2f} seconds")
        print("=" * 78)

        if self.failed_tests > 0 or self.errors:
            print("\n  FAILURES ENCOUNTERED:")
            for err in self.errors:
                print(f"    - {err}")
            print("\n  REGRESSION TEST SUITE FAILED!")
            return False
        else:
            print("\n  >>> ALL REGRESSION TEST TIERS PASSED WITH 100% SUCCESS! <<<")
            return True


if __name__ == "__main__":
    runner = RegressionSuiteRunner()
    success = runner.run()
    sys.exit(0 if success else 1)
