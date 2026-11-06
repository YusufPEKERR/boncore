#!/usr/bin/env python3
"""
BonCore Adversarial Challenge & Empirical Verification Suite
===========================================================
Executes hostile, edge-case, and boundary-condition stress tests
to challenge system resilience, invariants, RBAC, and database integrity.
"""

import os
import sys
import json
import time
import sqlite3
import urllib.request
import urllib.parse
import urllib.error

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE_URL = "http://127.0.0.1:8000"
TENANT_DB_PATH = os.path.join(ROOT_DIR, "backend", "data", "tenants", "fatihciftligi.db")
MASTER_DB_PATH = os.path.join(ROOT_DIR, "backend", "data", "master.db")

class AdversarialRunner:
    def __init__(self):
        self.total = 0
        self.passed = 0
        self.failed = 0
        self.http_500_count = 0
        self.failures = []

    def check(self, condition, description):
        self.total += 1
        if condition:
            self.passed += 1
            print(f"  [PASS] {description}")
            return True
        else:
            self.failed += 1
            err = f"FAIL: {description}"
            print(f"  [FAIL] {description}")
            self.failures.append(err)
            return False

    def raw_request(self, method, path, data=None, headers=None):
        url = f"{BASE_URL}{path}"
        req_headers = {"Content-Type": "application/json"}
        if headers:
            req_headers.update(headers)
        
        req_body = None
        if isinstance(data, (dict, list)):
            req_body = json.dumps(data).encode("utf-8")
        elif isinstance(data, (bytes, bytearray)):
            req_body = data
        elif isinstance(data, str):
            req_body = data.encode("utf-8")

        req = urllib.request.Request(url, data=req_body, headers=req_headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                status = resp.status
                body = resp.read().decode("utf-8", errors="replace")
                if status == 500:
                    self.http_500_count += 1
                try:
                    parsed = json.loads(body)
                except Exception:
                    parsed = body
                return status, parsed
        except urllib.error.HTTPError as e:
            status = e.code
            body = e.read().decode("utf-8", errors="replace")
            if status == 500:
                self.http_500_count += 1
            try:
                parsed = json.loads(body)
            except Exception:
                parsed = body
            return status, parsed
        except Exception as e:
            return None, str(e)


def run_all_adversarial_tests():
    runner = AdversarialRunner()
    print("=" * 80)
    print(" BONCORE ADVERSARIAL CHALLENGE & EMPIRICAL VERIFICATION SUITE")
    print("=" * 80)

    # -------------------------------------------------------------------------
    # CHALLENGE 1: TABLE ID EDGE-CASE & BOUNDARY ATTACKS (POST /api/orders/create)
    # -------------------------------------------------------------------------
    print("\n--- [CHALLENGE 1] TABLE ID EDGE-CASES & INVALID INPUT DEFENSES ---")
    
    # 1.1 Non-existent table 999999
    payload_999999 = {
        "table_id": 999999,
        "order_type": "dine_in",
        "waiter_name": "Ahmet Garson",
        "items": []
    }
    status, body = runner.raw_request("POST", "/api/orders/create", data=payload_999999,
                                      headers={"X-Restaurant-Code": "fatihciftligi", "X-User-Role": "waiter"})
    runner.check(status == 404, f"Non-existent table_id 999999 returns HTTP 404 (got {status})")
    runner.check(status != 500, "Non-existent table_id 999999 does NOT return HTTP 500")
    if isinstance(body, dict):
        runner.check(body.get("status") == "error", f"Error status field in 404 response: {body.get('status')}")
        runner.check("bulunamadı" in body.get("message", "").lower() or "mevcut değil" in body.get("detail", "").lower(),
                     f"Error message clearly states table not found: {body.get('message')}")

    # 1.2 Negative table ID (-1)
    payload_neg = {"table_id": -1, "order_type": "dine_in", "waiter_name": "Ahmet Garson", "items": []}
    status, body = runner.raw_request("POST", "/api/orders/create", data=payload_neg)
    runner.check(status in (400, 404), f"Negative table_id -1 returns HTTP 400 or 404 (got {status})")
    runner.check(status != 500, "Negative table_id -1 does NOT return HTTP 500")

    # 1.3 Zero table ID (0)
    payload_zero = {"table_id": 0, "order_type": "dine_in", "waiter_name": "Ahmet Garson", "items": []}
    status, body = runner.raw_request("POST", "/api/orders/create", data=payload_zero)
    runner.check(status in (400, 404), f"Table_id 0 returns HTTP 400 or 404 (got {status})")
    runner.check(status != 500, "Table_id 0 does NOT return HTTP 500")

    # 1.4 Malformed JSON payload to /orders/create
    status, body = runner.raw_request("POST", "/api/orders/create", data="{malformed_json: bad_value}")
    runner.check(status in (400, 422), f"Malformed JSON payload returns HTTP 400/422 Bad Request (got {status})")
    runner.check(status != 500, "Malformed JSON does NOT return HTTP 500")

    # -------------------------------------------------------------------------
    # CHALLENGE 2: ROLE JOURNEYS & AUTHENTICATION MATRIX
    # -------------------------------------------------------------------------
    print("\n--- [CHALLENGE 2] ROLE AUTHENTICATION & ACCESS VERIFICATION ---")
    tokens = {}
    roles = [
        ("1111", "waiter", "Garson"),
        ("2222", "cashier", "Kasiyer"),
        ("3333", "kitchen", "Mutfak"),
        ("9999", "manager", "Yönetici"),
        ("0000", "admin", "Admin")
    ]
    for pin, expected_role, name in roles:
        status, body = runner.raw_request("POST", "/api/auth/login-pin", data={"pin_code": pin})
        runner.check(status == 200, f"Role {name} (PIN {pin}) login returned HTTP 200")
        has_token = isinstance(body, dict) and "access_token" in body
        runner.check(has_token, f"Role {name} received JWT access token")
        role_match = isinstance(body, dict) and body.get("role") == expected_role
        runner.check(role_match, f"Role {name} verified role='{expected_role}'")
        if has_token:
            tokens[expected_role] = body["access_token"]

    # 2.1 SuperAdmin Master Login
    status, sa_body = runner.raw_request("POST", "/api/master/login", data={"username": "superadmin", "password": "boncore2026master"})
    runner.check(status == 200, "SuperAdmin master login returned HTTP 200")
    runner.check(isinstance(sa_body, dict) and "access_token" in sa_body, "SuperAdmin received master access token")
    runner.check(isinstance(sa_body, dict) and sa_body.get("user", {}).get("role") == "master_admin", "SuperAdmin role verified as 'master_admin'")
    if isinstance(sa_body, dict) and "access_token" in sa_body:
        tokens["master_admin"] = sa_body["access_token"]

    # 2.2 Invalid PIN rejection
    status, inv_body = runner.raw_request("POST", "/api/auth/login-pin", data={"pin_code": "9876"})
    runner.check(status == 401, f"Invalid staff PIN rejected with HTTP 401 (got {status})")
    runner.check(status != 500, "Invalid PIN does NOT trigger HTTP 500")

    # 2.3 Invalid SuperAdmin password rejection
    status, inv_sa = runner.raw_request("POST", "/api/master/login", data={"username": "superadmin", "password": "wrong_password"})
    runner.check(status == 401, f"Invalid SuperAdmin credentials rejected with HTTP 401 (got {status})")

    # -------------------------------------------------------------------------
    # CHALLENGE 3: FULL OPERATIONAL LIFECYCLE & TABLE STATE INTEGRITY
    # -------------------------------------------------------------------------
    print("\n--- [CHALLENGE 3] FULL OPERATIONAL LIFECYCLE: TABLE OCCUPY -> KDS -> SETTLE -> EMPTY ---")
    
    waiter_header = {
        "Authorization": f"Bearer {tokens.get('waiter', '')}",
        "X-User-Role": "waiter",
        "X-Restaurant-Code": "fatihciftligi"
    }
    cashier_header = {
        "Authorization": f"Bearer {tokens.get('cashier', '')}",
        "X-User-Role": "cashier",
        "X-Restaurant-Code": "fatihciftligi"
    }
    kitchen_header = {
        "Authorization": f"Bearer {tokens.get('kitchen', '')}",
        "X-User-Role": "kitchen",
        "X-Restaurant-Code": "fatihciftligi"
    }

    # 3.1 Find an empty table dynamically
    status, areas = runner.raw_request("GET", "/api/tables/areas", headers=waiter_header)
    runner.check(status == 200 and isinstance(areas, list) and len(areas) > 0, "Retrieved floor areas successfully")
    
    target_table = None
    if isinstance(areas, list):
        for area in areas:
            for tbl in area.get("tables", []):
                if tbl.get("status") == "empty":
                    target_table = tbl
                    break
            if target_table:
                break

    runner.check(target_table is not None, f"Found empty table for test: {target_table.get('name') if target_table else 'None'} (ID: {target_table.get('id') if target_table else 'N/A'})")
    
    if target_table:
        tid = target_table["id"]
        tname = target_table["name"]
        print(f"  [INFO] Selected Table: {tname} (ID: {tid}) - Current Status: {target_table.get('status')}")

        # 3.2 Create order on the empty table
        order_payload = {
            "table_id": tid,
            "order_type": "dine_in",
            "waiter_name": "Ahmet Garson",
            "kuver_count": 2,
            "items": [
                {
                    "product_id": 264,
                    "product_name": "ÇİFTLİK SERPME KAHVALTI",
                    "quantity": 1,
                    "unit_price": 450.0,
                    "total_price": 450.0,
                    "station": "kitchen",
                    "course_stage": 1,
                    "kitchen_note": "Milestone 5 Challenger E2E Test"
                }
            ]
        }
        status, ord_res = runner.raw_request("POST", "/api/orders/create", data=order_payload, headers=waiter_header)
        runner.check(status in (200, 201), f"Created order on table {tname} (HTTP {status})")
        runner.check(isinstance(ord_res, dict) and ord_res.get("status") == "success", "Order creation status is 'success'")
        order_id = ord_res.get("id") or ord_res.get("order_id") if isinstance(ord_res, dict) else None
        runner.check(order_id is not None, f"Order created with ID: {order_id}")

        # 3.3 Verify table state transitioned to 'occupied'
        status, areas_chk1 = runner.raw_request("GET", "/api/tables/areas", headers=waiter_header)
        curr_tbl_stat = None
        if isinstance(areas_chk1, list):
            for a in areas_chk1:
                for tb in a.get("tables", []):
                    if tb.get("id") == tid:
                        curr_tbl_stat = tb.get("status")
                        break
        runner.check(curr_tbl_stat == "occupied", f"Table {tname} status immediately transitioned to 'occupied' (got '{curr_tbl_stat}')")

        # 3.4 Advance items in KDS
        status, kds_res = runner.raw_request("POST", f"/api/kds/order/{order_id}/ready-all", headers=kitchen_header)
        runner.check(status == 200, f"KDS ready-all executed successfully (HTTP {status})")

        # 3.5 Settle order via Cashier
        settle_payload = {
            "order_id": order_id,
            "cashier_name": "Ayşe Kasiyer",
            "close_table": True,
            "payments": [
                {
                    "amount": 450.0,
                    "payment_method": "credit_card",
                    "tip": 0.0
                }
            ]
        }
        status, settle_res = runner.raw_request("POST", "/api/cashier/settle-payment", data=settle_payload, headers=cashier_header)
        runner.check(status == 200, f"Cashier settled payment successfully (HTTP {status})")
        runner.check(isinstance(settle_res, dict) and settle_res.get("status") == "success", "Cashier settlement status is 'success'")
        runner.check(isinstance(settle_res, dict) and settle_res.get("table_status") == "empty", "Settlement confirms table_status is 'empty'")

        # 3.6 Verify table returns to 'empty' in layout
        status, areas_chk2 = runner.raw_request("GET", "/api/tables/areas", headers=waiter_header)
        final_tbl_stat = None
        if isinstance(areas_chk2, list):
            for a in areas_chk2:
                for tb in a.get("tables", []):
                    if tb.get("id") == tid:
                        final_tbl_stat = tb.get("status")
                        break
        runner.check(final_tbl_stat == "empty", f"Table {tname} successfully returned to 'empty' (got '{final_tbl_stat}')")

    # -------------------------------------------------------------------------
    # CHALLENGE 4: SQLITE DATABASE INTEGRITY & WAL VERIFICATION
    # -------------------------------------------------------------------------
    print("\n--- [CHALLENGE 4] DATABASE PHYSICAL & RELATIONAL INTEGRITY ---")
    
    # 4.1 Tenant DB Integrity
    runner.check(os.path.exists(TENANT_DB_PATH), f"Tenant DB exists at {TENANT_DB_PATH}")
    t_conn = sqlite3.connect(TENANT_DB_PATH)
    t_cur = t_conn.cursor()
    
    t_cur.execute("PRAGMA integrity_check;")
    t_integ = t_cur.fetchall()
    runner.check(len(t_integ) == 1 and t_integ[0][0] == "ok", f"Tenant DB PRAGMA integrity_check == 'ok' (got {t_integ})")

    t_cur.execute("PRAGMA foreign_key_check;")
    t_fk = t_cur.fetchall()
    runner.check(len(t_fk) == 0, f"Tenant DB PRAGMA foreign_key_check returned 0 violations (got {len(t_fk)})")

    t_cur.execute("PRAGMA journal_mode;")
    t_journal = t_cur.fetchone()
    runner.check(t_journal[0].lower() == "wal", f"Tenant DB journal_mode is WAL (got '{t_journal[0]}')")

    # WAL Checkpoint
    t_cur.execute("PRAGMA wal_checkpoint(PASSIVE);")
    wal_res = t_cur.fetchone()
    runner.check(wal_res[0] == 0, f"Tenant DB WAL passive checkpoint successful (status: {wal_res})")
    t_conn.close()

    # 4.2 Master DB Integrity
    runner.check(os.path.exists(MASTER_DB_PATH), f"Master DB exists at {MASTER_DB_PATH}")
    m_conn = sqlite3.connect(MASTER_DB_PATH)
    m_cur = m_conn.cursor()

    m_cur.execute("PRAGMA integrity_check;")
    m_integ = m_cur.fetchall()
    runner.check(len(m_integ) == 1 and m_integ[0][0] == "ok", f"Master DB PRAGMA integrity_check == 'ok' (got {m_integ})")

    m_cur.execute("PRAGMA foreign_key_check;")
    m_fk = m_cur.fetchall()
    runner.check(len(m_fk) == 0, f"Master DB PRAGMA foreign_key_check returned 0 violations (got {len(m_fk)})")

    m_cur.execute("PRAGMA journal_mode;")
    m_journal = m_cur.fetchone()
    runner.check(m_journal[0].lower() == "wal", f"Master DB journal_mode is WAL (got '{m_journal[0]}')")

    m_cur.execute("SELECT code, status, plan FROM restaurant_tenants WHERE code = 'fatihciftligi';")
    tenant_row = m_cur.fetchone()
    runner.check(tenant_row is not None and tenant_row[1] == "active", f"Master DB active tenant 'fatihciftligi' verified (row: {tenant_row})")
    m_conn.close()

    # -------------------------------------------------------------------------
    # SUMMARY
    # -------------------------------------------------------------------------
    print("\n" + "=" * 80)
    print(" ADVERSARIAL CHALLENGE SUITE SUMMARY")
    print("=" * 80)
    print(f"  Total Assertions Checked : {runner.total}")
    print(f"  Total Assertions Passed  : {runner.passed}")
    print(f"  Total Assertions Failed  : {runner.failed}")
    print(f"  HTTP 500 Errors Observed : {runner.http_500_count}")
    print("=" * 80)

    if runner.failed == 0 and runner.http_500_count == 0:
        print("\n>>> ALL ADVERSARIAL CHALLENGES PASSED EMPIRICALLY WITH 100% SUCCESS! <<<\n")
        return 0
    else:
        print(f"\n>>> ADVERSARIAL CHALLENGES FAILED: {runner.failed} failures, {runner.http_500_count} 500 errors! <<<\n")
        return 1

if __name__ == "__main__":
    sys.exit(run_all_adversarial_tests())
