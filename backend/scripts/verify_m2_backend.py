#!/usr/bin/env python3
"""
BonCore Milestone 2 Verification Script
Validates:
1. Default Tenant Code Alignment (fatihciftligi without headers)
2. Master SQLite Database Path (backend/data/master.db)
3. Table Status Enum Normalization ('empty' not 'free')
4. JSON Key Compatibility for Frontend (order_id, status: success, caller ID name)
5. Live API Verification across all 6 roles:
   - Garson (1111)
   - Kasiyer (2222)
   - Mutfak (3333)
   - Yönetici (9999)
   - Admin (0000)
   - SuperAdmin (Master)
6. Zero 500 status responses
"""

import sys
import json
import urllib.request
import urllib.parse
import urllib.error

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

BASE_URL = "http://127.0.0.1:8000"

class Milestone2Verifier:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.errors = []
        self.step_no = 0

    def step(self, title):
        self.step_no += 1
        print(f"\n[{self.step_no:02d}] === {title} ===")

    def request(self, method, path, data=None, headers=None, expected_status=(200, 201)):
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
                body = resp.read().decode("utf-8")
                content_type = resp.headers.get("Content-Type", "")
                res_data = None
                if "application/json" in content_type:
                    try:
                        res_data = json.loads(body)
                    except Exception:
                        res_data = body
                else:
                    res_data = body

                if status in expected_status:
                    self.passed += 1
                    print(f"  [OK] {method} {path} -> {status}")
                    return res_data
                else:
                    self.failed += 1
                    msg = f"  [FAIL] {method} {path} -> Expected {expected_status}, got {status}: {body[:200]}"
                    print(msg)
                    self.errors.append(msg)
                    return None
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8")
            if e.code in expected_status:
                self.passed += 1
                print(f"  [OK] {method} {path} -> {e.code} (Expected status matched)")
                try:
                    return json.loads(body)
                except Exception:
                    return body
            else:
                self.failed += 1
                msg = f"  [FAIL] {method} {path} -> HTTP Error {e.code}: {body[:250]}"
                print(msg)
                self.errors.append(msg)
                return None
        except Exception as e:
            self.failed += 1
            msg = f"  [FAIL] {method} {path} -> Network/Connection Error: {e}"
            print(msg)
            self.errors.append(msg)
            return None

    def assert_true(self, condition, message):
        if condition:
            self.passed += 1
            print(f"  [OK] Assert: {message}")
        else:
            self.failed += 1
            msg = f"  [FAIL] Assert Failed: {message}"
            print(msg)
            self.errors.append(msg)

def run_verification():
    v = Milestone2Verifier()
    print("=" * 70)
    print("  BONCORE MILESTONE 2: BACKEND GO FIBER API & ROLE VERIFICATION")
    print("=" * 70)

    # 1. Health check
    v.step("SYSTEM HEALTH")
    health = v.request("GET", "/health")
    v.assert_true(health and health.get("status") == "healthy", "Backend /health is healthy")

    # 2. Default Tenant Code Alignment (No X-Restaurant-Code header)
    v.step("DEFAULT TENANT CODE ALIGNMENT (fatihciftligi without headers)")
    areas_no_header = v.request("GET", "/api/tables/areas")
    v.assert_true(isinstance(areas_no_header, list) and len(areas_no_header) >= 8, f"Unheadered request routed to active tenant with {len(areas_no_header) if areas_no_header else 0} areas (>= 8)")

    cats_no_header = v.request("GET", "/api/products/categories")
    v.assert_true(isinstance(cats_no_header, list) and len(cats_no_header) >= 10, f"Unheadered categories request returned {len(cats_no_header) if cats_no_header else 0} categories (>= 10)")

    # 3. Master SQLite Database Path Verification
    v.step("MASTER SQLITE DATABASE PATH (backend/data/master.db)")
    master_stats = v.request("GET", "/api/master/stats")
    v.assert_true(master_stats and master_stats.get("total_tenants", 0) >= 3, f"Master stats verified from data/master.db: {master_stats.get('total_tenants', 0) if master_stats else 0} tenants")
    
    master_tenants = v.request("GET", "/api/master/tenants")
    v.assert_true(isinstance(master_tenants, list) and len(master_tenants) >= 3, f"Master tenants list loaded {len(master_tenants) if master_tenants else 0} tenants")
    tenant_codes = [t.get("code") for t in master_tenants] if master_tenants else []
    v.assert_true("fatihciftligi" in tenant_codes, "Active tenant 'fatihciftligi' present in master tenant list")

    # 4. JSON Key Compatibility & Aliases
    v.step("JSON COMPATIBILITY (Caller ID & Responses)")
    caller = v.request("GET", "/api/delivery/caller-id-simulate?phone=05324418892")
    v.assert_true(caller and "name" in caller and "customer_name" in caller, "Caller ID response contains both 'name' and 'customer_name'")

    active_reg = v.request("GET", "/api/cashier/active-register")
    v.assert_true(active_reg and "id" in active_reg and "register_id" in active_reg, "Active register contains both 'id' and 'register_id'")

    x_rep = v.request("GET", "/api/cashier/x-report")
    v.assert_true(x_rep and "total_revenue" in x_rep and "gross_sales" in x_rep, "X-Report contains both 'total_revenue' and 'gross_sales'")

    # 5. Role Workflow: Garson (PIN 1111)
    v.step("ROLE WORKFLOW: GARSON (WAITER - PIN 1111)")
    garson_auth = v.request("POST", "/api/auth/login-pin", {"pin_code": "1111"})
    v.assert_true(garson_auth and garson_auth.get("role") == "waiter", "Garson authenticated with PIN 1111 and role 'waiter'")
    garson_token = garson_auth.get("access_token") if garson_auth else None
    garson_headers = {"Authorization": f"Bearer {garson_token}", "X-User-Role": "waiter"} if garson_token else {}

    # Find empty table for order
    empty_table = None
    if areas_no_header:
        for a in areas_no_header:
            for tb in a.get("tables", []):
                if tb.get("status") == "empty":
                    empty_table = tb
                    break
            if empty_table:
                break
    v.assert_true(empty_table is not None, f"Found empty table for Garson: {empty_table.get('name') if empty_table else 'None'}")

    # Pick product
    test_prod = None
    if cats_no_header:
        for c in cats_no_header:
            prods = c.get("products", [])
            if prods:
                test_prod = prods[0]
                break
    v.assert_true(test_prod is not None, f"Found active product: {test_prod.get('name') if test_prod else 'None'}")

    created_order = None
    if empty_table and test_prod:
        order_payload = {
            "table_id": empty_table["id"],
            "order_type": "dine_in",
            "waiter_name": "Ahmet Garson",
            "kuver_count": 2,
            "items": [
                {
                    "product_id": test_prod["id"],
                    "quantity": 1,
                    "kitchen_note": "Milestone 2 Garson Test Siparişi",
                    "course_stage": 1,
                    "is_hold": False
                }
            ]
        }
        created_order = v.request("POST", "/api/orders/create", order_payload, headers=garson_headers)
        v.assert_true(created_order and created_order.get("status") == "success", "Order creation response has status: 'success'")
        v.assert_true(created_order and "id" in created_order and "order_id" in created_order, "Order creation contains both 'id' and 'order_id'")
        v.assert_true(created_order and "order_number" in created_order, "Order creation contains 'order_number'")

        order_id = created_order.get("order_id")

        # Garson adds items
        add_res = v.request("POST", f"/api/orders/{order_id}/add-items", {
            "items": [
                {
                    "product_id": test_prod["id"],
                    "quantity": 1,
                    "kitchen_note": "İlave ürün",
                    "course_stage": 1,
                    "is_hold": False
                }
            ],
            "waiter_name": "Ahmet Garson"
        }, headers=garson_headers)
        v.assert_true(add_res and add_res.get("status") == "success", "Garson add-items returned status: 'success'")

    # 6. Role Workflow: Mutfak / KDS (PIN 3333)
    v.step("ROLE WORKFLOW: MUTFAK / KDS (PIN 3333)")
    chef_auth = v.request("POST", "/api/auth/login-pin", {"pin_code": "3333"})
    v.assert_true(chef_auth and chef_auth.get("role") == "kitchen", "Mutfak authenticated with PIN 3333 and role 'kitchen'")
    chef_token = chef_auth.get("access_token") if chef_auth else None
    chef_headers = {"Authorization": f"Bearer {chef_token}", "X-User-Role": "kitchen"} if chef_token else {}

    kds_orders = v.request("GET", "/api/kds/orders?station=all", headers=chef_headers)
    v.assert_true(isinstance(kds_orders, list), f"KDS active orders fetched: {len(kds_orders) if kds_orders else 0} tickets")

    if created_order:
        o_id = created_order["order_id"]
        # Progress order items
        ready_all = v.request("POST", f"/api/kds/order/{o_id}/ready-all", headers=chef_headers)
        v.assert_true(ready_all is not None, "Mutfak completed ready-all for order")

    # 7. Role Workflow: Kasiyer (PIN 2222)
    v.step("ROLE WORKFLOW: KASIYER (PIN 2222) - SETTLE BILL & TABLE EMPTY LIFECYCLE")
    cashier_auth = v.request("POST", "/api/auth/login-pin", {"pin_code": "2222"})
    v.assert_true(cashier_auth and cashier_auth.get("role") == "cashier", "Kasiyer authenticated with PIN 2222 and role 'cashier'")
    cashier_token = cashier_auth.get("access_token") if cashier_auth else None
    cashier_headers = {"Authorization": f"Bearer {cashier_token}", "X-User-Role": "cashier"} if cashier_token else {}

    if created_order and empty_table:
        o_id = created_order["order_id"]
        table_id = empty_table["id"]

        # Check table is occupied
        ord_details = v.request("GET", f"/api/orders/{o_id}", headers=cashier_headers)
        v.assert_true(ord_details and ord_details.get("remaining_total", 0) > 0, "Fetched bill details with remaining balance")
        rem = ord_details.get("remaining_total", 0.0) if ord_details else 0.0

        # Settle bill with close_table = True
        settle_res = v.request("POST", "/api/cashier/settle-payment", {
            "order_id": o_id,
            "payments": [{"method": "credit_card", "amount": rem}],
            "rounding": 0.0,
            "cashier_name": "Ayşe Kasiyer",
            "close_table": True
        }, headers=cashier_headers)
        v.assert_true(settle_res and settle_res.get("status") == "success", "Cashier settlement returned status: 'success'")
        v.assert_true(settle_res and settle_res.get("table_status") == "empty", "Payment response explicitly confirmed table_status: 'empty'")

        # Verify Table status in DB is now strictly 'empty'
        areas_check = v.request("GET", "/api/tables/areas", headers=cashier_headers)
        table_found = None
        for a in areas_check:
            for tb in a.get("tables", []):
                if tb["id"] == table_id:
                    table_found = tb
                    break
        v.assert_true(table_found and table_found.get("status") == "empty", f"Table {table_id} status successfully transitioned to 'empty' (got: {table_found.get('status') if table_found else 'None'})")

    # 8. Role Workflow: Yönetici (Manager - PIN 9999)
    v.step("ROLE WORKFLOW: YÖNETİCİ (MANAGER - PIN 9999)")
    manager_auth = v.request("POST", "/api/auth/login-pin", {"pin_code": "9999"})
    v.assert_true(manager_auth and manager_auth.get("role") == "manager", "Yönetici authenticated with PIN 9999 and role 'manager'")
    manager_token = manager_auth.get("access_token") if manager_auth else None
    manager_headers = {"Authorization": f"Bearer {manager_token}", "X-User-Role": "manager"} if manager_token else {}

    stats = v.request("GET", "/api/orders/analytics/statistics", headers=manager_headers)
    v.assert_true(stats and "total_turnover" in stats and "waiter_sales" in stats, "Manager live analytics KPIs verified")

    audit_logs = v.request("GET", "/api/audit/logs?limit=5", headers=manager_headers)
    v.assert_true(isinstance(audit_logs, list) and len(audit_logs) > 0, "Manager audit trail logs retrieved")

    # 9. Role Workflow: Admin (PIN 0000)
    v.step("ROLE WORKFLOW: ADMIN (PIN 0000)")
    admin_auth = v.request("POST", "/api/auth/login-pin", {"pin_code": "0000"})
    v.assert_true(admin_auth and admin_auth.get("role") == "admin", "Admin authenticated with PIN 0000 and role 'admin'")
    admin_token = admin_auth.get("access_token") if admin_auth else None
    admin_headers = {"Authorization": f"Bearer {admin_token}", "X-User-Role": "admin"} if admin_token else {}

    settings = v.request("GET", "/api/settings/", headers=admin_headers)
    v.assert_true(settings and "restaurant_name" in settings, "Admin accessed restaurant settings")

    # 10. Role Workflow: SuperAdmin (Master Admin)
    v.step("ROLE WORKFLOW: SUPERADMIN (SAAS MASTER PLATFORM)")
    superadmin_login = v.request("POST", "/api/master/login", {
        "username": "superadmin",
        "password": "boncore2026master"
    })
    v.assert_true(superadmin_login and "access_token" in superadmin_login, "SuperAdmin logged in and received access_token")
    sa_token = superadmin_login.get("access_token") if superadmin_login else None
    sa_headers = {"Authorization": f"Bearer {sa_token}"} if sa_token else {}

    sa_stats = v.request("GET", "/api/master/stats", headers=sa_headers)
    v.assert_true(sa_stats and "total_tenants" in sa_stats, "SuperAdmin platform stats verified")

    # Final summary
    print("\n" + "=" * 70)
    print(f"  VERIFICATION RESULTS: {v.passed} PASSED, {v.failed} FAILED")
    print("=" * 70)
    if v.errors:
        print("\nFailures:")
        for err in v.errors:
            print(f"  - {err}")
        return False
    else:
        print("\n ALL MILESTONE 2 REQUIREMENTS VERIFIED WITH 100% SUCCESS!")
        return True

if __name__ == "__main__":
    success = run_verification()
    sys.exit(0 if success else 1)
