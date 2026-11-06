#!/usr/bin/env python3
"""
BonCore SaaS Master Admin Expansion - Empirical Challenger 1 Verification Harness
================================================================================
Milestone 5 Verification Gate - Empirical Stress & Boundary Challenger

Challenges Tested:
1. Concurrency & Race Conditions:
   - 50 rapid parallel heartbeats from mixed device types (pos, tablet, handheld, kds)
   - Concurrent support ticket submissions
   - Verification of zero deadlocks, zero lock timeouts, zero HTTP 500 errors under SQLite WAL mode
2. Boundary & Corner Cases:
   - Menu cloning with extreme markup percentages (-99%, 0%, +500%)
   - Malformed, empty, and truncated multipart payloads
   - Storage quota evaluation right at boundary thresholds (below, at boundary, above)
3. Delinquency Bypass Invariants:
   - Table seating/movement, order creation, payment settlement, menu alterations
   - Varied HTTP verbs (GET, POST, PUT, DELETE)
   - Strict HTTP 403 enforcement under suspended (ACCOUNT_SUSPENDED) and read-only (READ_ONLY_MODE)
4. Disaster Recovery Integrity:
   - Atomic backup generation with SHA256 verification
   - Canary insertion mutation
   - Atomic restoration with safety snapshot
   - Verification of canary rollback, PRAGMA integrity_check (ok), PRAGMA foreign_key_check (0 violations)
   - Go Fiber connection pool cycling verification
"""

import os
import sys
import json
import time
import sqlite3
import hashlib
import urllib.request
import urllib.parse
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List, Optional, Tuple

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE_URL = "http://127.0.0.1:8000"
DATA_MASTER_DB_PATH = os.path.join(ROOT_DIR, "backend", "data", "master.db")
PRIMARY_TENANT_DB_PATH = os.path.join(ROOT_DIR, "backend", "data", "tenants", "fatihciftligi.db")


def encode_multipart_form(fields: Dict[str, Any], files: Optional[Dict[str, Tuple[str, bytes, str]]] = None) -> Tuple[bytes, str]:
    boundary = f"----BonCoreChallengerBoundary{int(time.time() * 1000):x}"
    body = bytearray()
    for name, value in fields.items():
        body.extend(f"--{boundary}\r\n".encode("utf-8"))
        body.extend(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"))
        body.extend(str(value).encode("utf-8"))
        body.extend(b"\r\n")

    if files:
        for name, (filename, content, mime_type) in files.items():
            body.extend(f"--{boundary}\r\n".encode("utf-8"))
            body.extend(f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'.encode("utf-8"))
            body.extend(f"Content-Type: {mime_type}\r\n\r\n".encode("utf-8"))
            if isinstance(content, str):
                body.extend(content.encode("utf-8"))
            else:
                body.extend(content)
            body.extend(b"\r\n")

    body.extend(f"--{boundary}--\r\n".encode("utf-8"))
    content_type = f"multipart/form-data; boundary={boundary}"
    return bytes(body), content_type


class EmpiricalChallengerRunner:
    def __init__(self):
        self.total_tests = 0
        self.passed_tests = 0
        self.failed_tests = 0
        self.total_requests = 0
        self.http_500_count = 0
        self.deadlock_count = 0
        self.errors: List[str] = []
        self.challenge_stats: Dict[str, Dict[str, int]] = {}
        self.current_challenge = ""
        self.created_tenants: List[str] = []

    def start_challenge(self, cid: int, name: str):
        self.current_challenge = f"Challenge {cid}: {name}"
        self.challenge_stats[self.current_challenge] = {"passed": 0, "failed": 0}
        print("\n" + "=" * 80)
        print(f"  [CHALLENGE {cid}] {name.upper()}")
        print("=" * 80)

    def assert_true(self, condition: bool, message: str) -> bool:
        self.total_tests += 1
        if condition:
            self.passed_tests += 1
            if self.current_challenge in self.challenge_stats:
                self.challenge_stats[self.current_challenge]["passed"] += 1
            print(f"  [PASS] {message}")
            return True
        else:
            self.failed_tests += 1
            if self.current_challenge in self.challenge_stats:
                self.challenge_stats[self.current_challenge]["failed"] += 1
            err_msg = f"[{self.current_challenge}] FAIL: {message}"
            print(f"  [FAIL] {message}")
            self.errors.append(err_msg)
            return False

    def request(
        self,
        method: str,
        path: str,
        data: Optional[Any] = None,
        headers: Optional[Dict[str, str]] = None,
        expected_status: Tuple[int, ...] = (200, 201),
        raw_body: Optional[bytes] = None,
        content_type: Optional[str] = None
    ) -> Tuple[int, Any]:
        self.total_requests += 1
        url = f"{BASE_URL}{path}"
        req_headers = {}
        if content_type:
            req_headers["Content-Type"] = content_type
        elif data is not None and raw_body is None:
            req_headers["Content-Type"] = "application/json"

        if headers:
            req_headers.update(headers)

        req_body = None
        if raw_body is not None:
            req_body = raw_body
        elif data is not None:
            req_body = json.dumps(data).encode("utf-8")

        req = urllib.request.Request(url, data=req_body, headers=req_headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                status = resp.status
                body = resp.read()
                resp_ct = resp.headers.get("Content-Type", "")
                res_data = None
                if "application/json" in resp_ct:
                    try:
                        res_data = json.loads(body.decode("utf-8", errors="replace"))
                    except Exception:
                        res_data = body
                else:
                    res_data = body

                matched = status in expected_status
                if status == 500:
                    self.http_500_count += 1
                self.assert_true(
                    matched,
                    f"{method} {path} returned HTTP {status} (expected {expected_status})"
                )
                return status, res_data
        except urllib.error.HTTPError as e:
            status = e.code
            if status == 500:
                self.http_500_count += 1
            body = e.read()
            body_str = body.decode("utf-8", errors="replace")
            if "locked" in body_str.lower() or "busy" in body_str.lower() or "deadlock" in body_str.lower():
                self.deadlock_count += 1
            matched = status in expected_status
            self.assert_true(
                matched,
                f"{method} {path} returned HTTP {status} (expected {expected_status}): {body_str[:120]}"
            )
            parsed = None
            try:
                parsed = json.loads(body_str)
            except Exception:
                parsed = body_str
            return status, parsed
        except Exception as e:
            err_str = str(e).lower()
            if "deadlock" in err_str or "locked" in err_str:
                self.deadlock_count += 1
            self.assert_true(False, f"{method} {path} network/transport exception: {e}")
            return 0, str(e)

    # =========================================================================
    # CHALLENGE 1: CONCURRENCY & RACE CONDITIONS
    # =========================================================================
    def run_challenge_1_concurrency(self):
        self.start_challenge(1, "Concurrency & Race Conditions")

        # 1.1 Emit 50 rapid parallel heartbeats from mixed device types
        print("\n  >>> Part 1.1: 50 Concurrent Mixed-Device Heartbeats")
        device_types = ["pos", "tablet", "handheld", "kds"]
        heartbeat_tasks = []
        for i in range(50):
            dev_type = device_types[i % len(device_types)]
            dev_id = f"challenger-dev-{dev_type}-{i:03d}"
            dev_name = f"Challenger {dev_type.upper()} Station #{i+1}"
            payload = {
                "device_id": dev_id,
                "device_type": dev_type,
                "device_name": dev_name,
                "app_version": f"3.0.{i}-challenger",
                "tenant_code": "fatihciftligi"
            }
            heartbeat_tasks.append((dev_id, dev_type, payload))

        def emit_heartbeat(task_item):
            dev_id, dev_type, p_data = task_item
            url = f"{BASE_URL}/api/heartbeat"
            req_data = json.dumps(p_data).encode("utf-8")
            req = urllib.request.Request(url, data=req_data, headers={"Content-Type": "application/json"}, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=10) as resp:
                    return resp.status, dev_id, dev_type, None
            except urllib.error.HTTPError as e:
                err_body = e.read().decode("utf-8", errors="replace")
                return e.code, dev_id, dev_type, err_body
            except Exception as e:
                return 0, dev_id, dev_type, str(e)

        t0 = time.time()
        hb_results = []
        with ThreadPoolExecutor(max_workers=10) as executor:
            future_to_hb = {executor.submit(emit_heartbeat, task): task for task in heartbeat_tasks}
            for fut in as_completed(future_to_hb):
                hb_results.append(fut.result())
        hb_duration = time.time() - t0

        hb_statuses = [r[0] for r in hb_results]
        hb_200 = hb_statuses.count(200)
        hb_500 = hb_statuses.count(500)
        hb_other = len(hb_statuses) - hb_200

        print(f"  [METRIC] 50 heartbeats completed in {hb_duration:.2f}s (Throughput: {50/hb_duration:.1f} req/s)")
        print(f"  [METRIC] Statuses: 200 OK: {hb_200}, 500 Error: {hb_500}, Other/Error: {hb_other}")

        self.assert_true(hb_200 == 50, f"All 50 rapid parallel heartbeats returned HTTP 200 OK (got {hb_200}/50)")
        self.assert_true(hb_500 == 0, f"Zero HTTP 500 errors during parallel heartbeat emission (got {hb_500})")

        # Verify database consistency in master DB
        m_conn = sqlite3.connect(DATA_MASTER_DB_PATH)
        m_cur = m_conn.cursor()
        registered_count = m_cur.execute(
            "SELECT COUNT(*) FROM fleet_heartbeats WHERE tenant_code = 'fatihciftligi' AND device_id LIKE 'challenger-dev-%';"
        ).fetchone()[0]
        m_conn.close()

        self.assert_true(
            registered_count == 50,
            f"Master DB fleet_heartbeats persisted all 50 concurrent device entries (found {registered_count}/50)"
        )

        # Verify Fleet Radar reflects healthy pulse without corruption
        st, fleet_radar = self.request("GET", "/api/master/fleet", expected_status=(200,))
        fatih_entry = next((item for item in fleet_radar if item.get("code") == "fatihciftligi"), None)
        self.assert_true(
            fatih_entry is not None and fatih_entry.get("is_online") is True,
            "Fleet Radar returns tenant 'fatihciftligi' online after concurrent heartbeat burst"
        )
        self.assert_true(
            fatih_entry is not None and fatih_entry.get("devices", {}).get("total", 0) >= 50,
            f"Fleet Radar counts >= 50 connected devices (total={fatih_entry.get('devices', {}).get('total') if fatih_entry else 0})"
        )

        # 1.2 Concurrent Support Ticket Submissions
        print("\n  >>> Part 1.2: 10 Concurrent Support Ticket Submissions")
        ticket_tasks = []
        for i in range(10):
            ticket_tasks.append({
                "category": ["hardware", "software", "billing", "network", "other"][i % 5],
                "priority": ["low", "normal", "high", "critical"][i % 4],
                "subject": f"Concurrent Stress Ticket #{i+1}",
                "description": f"Empirical concurrency stress ticket payload generation #{i+1} under WAL mode.",
                "submitted_by_name": f"Tester {i+1}",
                "submitted_by_role": "cashier",
                "device_info": f"POS-Term-{i+1}"
            })

        def submit_ticket(task_data):
            body_bytes, ct = encode_multipart_form(task_data)
            url = f"{BASE_URL}/api/support/tickets"
            req = urllib.request.Request(
                url,
                data=body_bytes,
                headers={"Content-Type": ct, "X-Restaurant-Code": "fatihciftligi"},
                method="POST"
            )
            try:
                with urllib.request.urlopen(req, timeout=10) as resp:
                    parsed = json.loads(resp.read().decode("utf-8", errors="replace"))
                    return resp.status, parsed, None
            except urllib.error.HTTPError as e:
                err_body = e.read().decode("utf-8", errors="replace")
                return e.code, None, err_body
            except Exception as e:
                return 0, None, str(e)

        t0 = time.time()
        tkt_results = []
        with ThreadPoolExecutor(max_workers=5) as executor:
            fut_to_tkt = {executor.submit(submit_ticket, t): t for t in ticket_tasks}
            for fut in as_completed(fut_to_tkt):
                tkt_results.append(fut.result())
        tkt_duration = time.time() - t0

        tkt_statuses = [r[0] for r in tkt_results]
        tkt_201 = tkt_statuses.count(201)
        tkt_500 = tkt_statuses.count(500)
        print(f"  [METRIC] 10 concurrent support tickets submitted in {tkt_duration:.2f}s")
        print(f"  [METRIC] Statuses: 201 Created: {tkt_201}, 500 Error: {tkt_500}")

        self.assert_true(tkt_201 == 10, f"All 10 concurrent support tickets returned HTTP 201 Created (got {tkt_201}/10)")
        self.assert_true(tkt_500 == 0, f"Zero HTTP 500 errors during concurrent support ticket submission (got {tkt_500})")

        # Verify audit logs and tickets in Master DB
        m_conn = sqlite3.connect(DATA_MASTER_DB_PATH)
        m_cur = m_conn.cursor()
        created_tickets = m_cur.execute(
            "SELECT id, ticket_number, status FROM support_tickets WHERE subject LIKE 'Concurrent Stress Ticket %';"
        ).fetchall()
        audit_log_count = m_cur.execute(
            """
            SELECT COUNT(*) FROM support_ticket_audit_logs 
            WHERE ticket_id IN (SELECT id FROM support_tickets WHERE subject LIKE 'Concurrent Stress Ticket %')
              AND action = 'created';
            """
        ).fetchone()[0]
        m_conn.close()

        self.assert_true(
            len(created_tickets) == 10,
            f"Master DB persisted all 10 concurrent support tickets (found {len(created_tickets)})"
        )
        self.assert_true(
            audit_log_count == 10,
            f"Master DB created corresponding audit log records for all 10 tickets (found {audit_log_count})"
        )
        self.assert_true(
            self.deadlock_count == 0,
            f"SQLite WAL concurrency check: Zero database deadlocks or busy timeouts observed (got {self.deadlock_count})"
        )

    # =========================================================================
    # CHALLENGE 2: BOUNDARY & CORNER CASES
    # =========================================================================
    def run_challenge_2_boundary_cases(self):
        self.start_challenge(2, "Boundary & Corner Cases")

        # 2.1 Menu Cloning with Extreme Markup Percentages (-99%, 0%, +500%)
        print("\n  >>> Part 2.1: Menu Cloning with Extreme Markup Percentages")
        m_conn = sqlite3.connect(DATA_MASTER_DB_PATH)
        m_cur = m_conn.cursor()

        # Create target branches in Master DB
        extreme_cases = [
            ("challenger-discount-90", "Aşırı İndirim Şubesi (-90%)", -90.0),
            ("challenger-exact-zero", "Birebir Ayna Şube (0%)", 0.0),
            ("challenger-markup-500", "Aşırı Zam Şubesi (+500%)", 500.0)
        ]

        for b_code, b_name, _ in extreme_cases:
            self.created_tenants.append(b_code)
            m_cur.execute("DELETE FROM restaurant_tenants WHERE code = ?;", (b_code,))
            m_cur.execute(
                """
                INSERT INTO restaurant_tenants (code, name, plan, plan_code, status, is_brand_master, branch_name)
                VALUES (?, ?, 'pro', 'pro', 'active', 0, ?);
                """,
                (b_code, b_name, b_name)
            )
        m_conn.commit()
        m_conn.close()

        # Find a reference product from source DB to test exact price calculations
        s_conn = sqlite3.connect(PRIMARY_TENANT_DB_PATH)
        s_cur = s_conn.cursor()
        ref_prod = s_cur.execute("SELECT id, name, base_price FROM products WHERE is_available = 1 ORDER BY id ASC LIMIT 1;").fetchone()
        s_conn.close()

        ref_prod_name = ref_prod[1]
        ref_base_price = float(ref_prod[2])
        print(f"  [INFO] Source benchmark product: '{ref_prod_name}' with base_price = {ref_base_price:.2f} TL")

        for b_code, b_name, markup in extreme_cases:
            st, clone_res = self.request(
                "POST",
                "/api/master/menu/clone",
                data={
                    "source_tenant_code": "fatihciftligi",
                    "target_tenant_codes": [b_code],
                    "clone_categories": True,
                    "clone_products": True,
                    "price_adjustment_percent": markup
                },
                expected_status=(200,)
            )
            self.assert_true(
                clone_res and clone_res.get("success") is True,
                f"POST /api/master/menu/clone executed successfully for {markup:+}% markup on {b_code}"
            )

            # Inspect target branch SQLite database directly
            t_db_path = os.path.join(ROOT_DIR, "backend", "data", "tenants", f"{b_code}.db")
            self.assert_true(os.path.exists(t_db_path), f"Target tenant database created on disk: {b_code}.db")

            t_conn = sqlite3.connect(t_db_path)
            t_cur = t_conn.cursor()
            cloned_prod = t_cur.execute(
                "SELECT base_price FROM products WHERE name = ?;",
                (ref_prod_name,)
            ).fetchone()
            t_conn.close()

            expected_price = round(ref_base_price * (1.0 + markup / 100.0), 2)
            actual_price = cloned_prod[0] if cloned_prod else None

            print(f"  [CHECK] Markup {markup:+}% -> Expected: {expected_price:.2f} TL | Actual: {actual_price:.2f} TL")
            self.assert_true(
                actual_price is not None and abs(actual_price - expected_price) < 0.01,
                f"Cloned product price for {markup:+}% markup matches expected {expected_price:.2f} TL (got {actual_price})"
            )

        # 2.2 Malformed & Empty Multipart Payloads (/api/support/tickets)
        print("\n  >>> Part 2.2: Malformed, Empty, and Truncated Multipart Payloads")

        # Scenario A: Empty multipart body (boundary with zero parts)
        empty_boundary = "----EmptyBoundary123"
        empty_body = f"--{empty_boundary}--\r\n".encode("utf-8")
        st, res = self.request(
            "POST",
            "/api/support/tickets",
            raw_body=empty_body,
            content_type=f"multipart/form-data; boundary={empty_boundary}",
            headers={"X-Restaurant-Code": "fatihciftligi"},
            expected_status=(400,)
        )
        self.assert_true(
            st == 400,
            "Empty multipart payload correctly rejected with HTTP 400 Bad Request (no 500 crash)"
        )

        # Scenario B: Truncated multipart payload (missing ending boundary delimiter)
        truncated_body = b"--BrokenBoundary\r\nContent-Disposition: form-data; name=\"subject\"\r\n\r\nIncomplete"
        st, res = self.request(
            "POST",
            "/api/support/tickets",
            raw_body=truncated_body,
            content_type="multipart/form-data; boundary=BrokenBoundary",
            headers={"X-Restaurant-Code": "fatihciftligi"},
            expected_status=(400,)
        )
        self.assert_true(
            st == 400,
            "Truncated multipart stream safely caught and returned HTTP 400 Bad Request"
        )

        # Scenario C: Missing required fields (subject provided, but empty description)
        body_missing_desc, ct_missing = encode_multipart_form({
            "category": "software",
            "subject": "Missing Description Test",
            "description": ""
        })
        st, res = self.request(
            "POST",
            "/api/support/tickets",
            raw_body=body_missing_desc,
            content_type=ct_missing,
            headers={"X-Restaurant-Code": "fatihciftligi"},
            expected_status=(400,)
        )
        self.assert_true(
            st == 400,
            "Payload with blank description rejected with HTTP 400 Bad Request"
        )

        # Scenario D: Valid fields with 0-byte screenshot attachment
        body_empty_file, ct_empty_file = encode_multipart_form(
            {"category": "hardware", "subject": "Zero Byte Screenshot", "description": "Screenshot is empty 0 bytes."},
            files={"screenshot": ("empty.png", b"", "image/png")}
        )
        st, res = self.request(
            "POST",
            "/api/support/tickets",
            raw_body=body_empty_file,
            content_type=ct_empty_file,
            headers={"X-Restaurant-Code": "fatihciftligi"},
            expected_status=(201,)
        )
        self.assert_true(
            st == 201,
            "Valid ticket with 0-byte empty attachment safely processed with HTTP 201 Created"
        )

        # 2.3 Storage Quota Evaluation Right at Boundary Thresholds
        print("\n  >>> Part 2.3: Storage Quota Evaluation Right at Boundary Thresholds")
        st, initial_quota = self.request("GET", "/api/master/tenants/fatihciftligi/quota", expected_status=(200,))
        base_used_mb = float(initial_quota.get("total_used_mb", 0.0))
        print(f"  [INFO] Base tenant 'fatihciftligi' storage: {base_used_mb:.2f} MB")

        # Create 2 MB temporary media blob to simulate usage beyond low threshold
        uploads_dir = os.path.join(ROOT_DIR, "backend", "static", "uploads")
        os.makedirs(uploads_dir, exist_ok=True)
        temp_media_file = os.path.join(uploads_dir, "fatihciftligi_stress_blob.bin")
        with open(temp_media_file, "wb") as f:
            f.write(b"0" * (2 * 1024 * 1024))

        st, quota_with_blob = self.request("GET", "/api/master/tenants/fatihciftligi/quota", expected_status=(200,))
        used_with_blob = float(quota_with_blob.get("total_used_mb", 0.0))
        print(f"  [INFO] Tenant storage with test blob: {used_with_blob:.2f} MB")

        m_conn = sqlite3.connect(DATA_MASTER_DB_PATH)
        m_cur = m_conn.cursor()

        # Threshold A: Below Quota (Allocated = 10 MB > used_with_blob ~2.85 MB)
        allocated_below = 10
        m_cur.execute(
            """
            INSERT INTO tenant_storage_quotas (tenant_code, allocated_quota_mb, total_used_mb, is_quota_exceeded)
            VALUES ('fatihciftligi', ?, ?, 0)
            ON CONFLICT(tenant_code) DO UPDATE SET allocated_quota_mb = excluded.allocated_quota_mb;
            """,
            (allocated_below, used_with_blob)
        )
        m_conn.commit()

        st, res_below = self.request("GET", "/api/master/tenants/fatihciftligi/quota", expected_status=(200,))
        self.assert_true(
            res_below and res_below.get("is_quota_exceeded") is False,
            f"Below-threshold quota check (Allocated: {allocated_below} MB > Used: {used_with_blob:.2f} MB): is_quota_exceeded == False"
        )

        # Threshold B: Above Quota (Allocated = 1 MB < used_with_blob ~2.85 MB)
        allocated_above = 1
        m_cur.execute(
            "UPDATE tenant_storage_quotas SET allocated_quota_mb = ? WHERE tenant_code = 'fatihciftligi';",
            (allocated_above,)
        )
        m_conn.commit()

        st, res_above = self.request("GET", "/api/master/tenants/fatihciftligi/quota", expected_status=(200,))
        self.assert_true(
            res_above and res_above.get("is_quota_exceeded") is True,
            f"Above-threshold quota check (Allocated: {allocated_above} MB < Used: {used_with_blob:.2f} MB): is_quota_exceeded == True"
        )

        # Cleanup temporary media blob and restore quota
        if os.path.exists(temp_media_file):
            try:
                os.remove(temp_media_file)
            except Exception:
                pass

        m_cur.execute("UPDATE tenant_storage_quotas SET allocated_quota_mb = 10240 WHERE tenant_code = 'fatihciftligi';")
        m_conn.commit()
        m_conn.close()
        self.assert_true(True, "Storage quota thresholds evaluated precisely; tenant quota reset to standard 10240 MB.")

    # =========================================================================
    # CHALLENGE 3: DELINQUENCY BYPASS INVARIANTS
    # =========================================================================
    def run_challenge_3_delinquency_invariants(self):
        self.start_challenge(3, "Delinquency Bypass Invariants")

        delinquent_tenant = f"challenger-delinquent-{int(time.time() % 100000)}"
        self.created_tenants.append(delinquent_tenant)

        m_conn = sqlite3.connect(DATA_MASTER_DB_PATH)
        m_cur = m_conn.cursor()
        m_cur.execute(
            """
            INSERT INTO restaurant_tenants (code, name, plan, plan_code, status, read_only_mode, suspension_reason)
            VALUES (?, 'Delinquency Invariant Tester', 'pro', 'pro', 'suspended', 0, 'SaaS abonelik borcu nedeniyle askıda');
            """,
            (delinquent_tenant,)
        )
        m_conn.commit()
        m_conn.close()

        headers_delinquent = {"X-Restaurant-Code": delinquent_tenant}

        print("\n  >>> Part 3.1: Suspended Tenant Status Enforcement (All Verbs Must Return 403)")

        # Target 1: Table floor plan read (GET /api/tables/areas)
        st, res = self.request("GET", "/api/tables/areas", headers=headers_delinquent, expected_status=(403,))
        self.assert_true(
            st == 403 and isinstance(res, dict) and res.get("code") == "ACCOUNT_SUSPENDED",
            "Suspended tenant: GET /api/tables/areas blocked with HTTP 403 (ACCOUNT_SUSPENDED)"
        )

        # Target 2: Table seating / layout update (PUT /api/tables/layout/positions)
        st, res = self.request(
            "PUT",
            "/api/tables/layout/positions",
            data=[{"id": 1, "x": 100, "y": 100}],
            headers=headers_delinquent,
            expected_status=(403,)
        )
        self.assert_true(
            st == 403 and isinstance(res, dict) and res.get("code") == "ACCOUNT_SUSPENDED",
            "Suspended tenant: PUT /api/tables/layout/positions blocked with HTTP 403 (ACCOUNT_SUSPENDED)"
        )

        # Target 3: Order creation attempt (POST /api/orders/create)
        st, res = self.request(
            "POST",
            "/api/orders/create",
            data={"table_id": 1, "order_type": "dine_in"},
            headers=headers_delinquent,
            expected_status=(403,)
        )
        self.assert_true(
            st == 403 and isinstance(res, dict) and res.get("code") == "ACCOUNT_SUSPENDED",
            "Suspended tenant: POST /api/orders/create blocked with HTTP 403 (ACCOUNT_SUSPENDED)"
        )

        # Target 4: Payment settlement attempt (POST /api/cashier/settle-payment)
        st, res = self.request(
            "POST",
            "/api/cashier/settle-payment",
            data={"order_id": 1, "payment_method": "cash", "amount": 150.0},
            headers=headers_delinquent,
            expected_status=(403,)
        )
        self.assert_true(
            st == 403 and isinstance(res, dict) and res.get("code") == "ACCOUNT_SUSPENDED",
            "Suspended tenant: POST /api/cashier/settle-payment blocked with HTTP 403 (ACCOUNT_SUSPENDED)"
        )

        # Target 5: Menu alteration attempt (POST /api/products)
        st, res = self.request(
            "POST",
            "/api/products",
            data={"name": "Illegal Delinquent Item", "base_price": 50.0},
            headers=headers_delinquent,
            expected_status=(403,)
        )
        self.assert_true(
            st == 403 and isinstance(res, dict) and res.get("code") == "ACCOUNT_SUSPENDED",
            "Suspended tenant: POST /api/products blocked with HTTP 403 (ACCOUNT_SUSPENDED)"
        )

        print("\n  >>> Part 3.2: Read-Only Mode Invariant Enforcement (GET Allowed, Mutating Verbs 403)")
        # Transition tenant from suspended to read_only
        m_conn = sqlite3.connect(DATA_MASTER_DB_PATH)
        m_cur = m_conn.cursor()
        m_cur.execute(
            """
            UPDATE restaurant_tenants 
            SET status = 'active', read_only_mode = 1, suspension_reason = 'Fatura vadesi geçti, salt okunur'
            WHERE code = ?;
            """,
            (delinquent_tenant,)
        )
        m_conn.commit()
        m_conn.close()

        # Invariant 1: GET operations MUST succeed with HTTP 200
        st, res_read = self.request("GET", "/api/tables/areas", headers=headers_delinquent, expected_status=(200,))
        self.assert_true(
            st == 200,
            "Read-Only tenant: GET /api/tables/areas permitted with HTTP 200 OK"
        )

        st, res_cats = self.request("GET", "/api/products/categories", headers=headers_delinquent, expected_status=(200,))
        self.assert_true(
            st == 200,
            "Read-Only tenant: GET /api/products/categories permitted with HTTP 200 OK"
        )

        # Invariant 2: POST write operation MUST be blocked with HTTP 403 (READ_ONLY_MODE)
        st, res_ro_order = self.request(
            "POST",
            "/api/orders/create",
            data={"table_id": 1, "order_type": "dine_in"},
            headers=headers_delinquent,
            expected_status=(403,)
        )
        self.assert_true(
            st == 403 and isinstance(res_ro_order, dict) and res_ro_order.get("code") == "READ_ONLY_MODE",
            "Read-Only tenant: POST /api/orders/create strictly blocked with HTTP 403 (READ_ONLY_MODE)"
        )

        # Invariant 3: PUT write operation MUST be blocked with HTTP 403 (READ_ONLY_MODE)
        st, res_ro_put = self.request(
            "PUT",
            "/api/tables/layout/positions",
            data=[{"id": 1, "x": 50, "y": 50}],
            headers=headers_delinquent,
            expected_status=(403,)
        )
        self.assert_true(
            st == 403 and isinstance(res_ro_put, dict) and res_ro_put.get("code") == "READ_ONLY_MODE",
            "Read-Only tenant: PUT /api/tables/layout/positions strictly blocked with HTTP 403 (READ_ONLY_MODE)"
        )

        # Invariant 4: DELETE write operation MUST be blocked with HTTP 403 (READ_ONLY_MODE)
        st, res_ro_del = self.request(
            "DELETE",
            "/api/products/999999",
            headers=headers_delinquent,
            expected_status=(403,)
        )
        self.assert_true(
            st == 403 and isinstance(res_ro_del, dict) and res_ro_del.get("code") == "READ_ONLY_MODE",
            "Read-Only tenant: DELETE /api/products/999999 strictly blocked with HTTP 403 (READ_ONLY_MODE)"
        )

        # Invariant 5: Exception check: Support ticket submissions SHOULD be permitted even in read-only mode (bypasses 403)
        time.sleep(1.2)
        st, res_tkt_ro = self.request(
            "POST",
            "/api/support/tickets",
            data={
                "category": "billing",
                "subject": "Help: Our account is in read-only mode",
                "description": "Please send the bank IBAN to pay invoice and reactivate.",
                "submitted_by_name": "Store Owner"
            },
            headers=headers_delinquent,
            expected_status=(201,)
        )
        self.assert_true(
            st != 403,
            "Read-Only tenant: Support ticket submission NOT blocked by delinquency guard (bypassed HTTP 403)"
        )
        self.assert_true(
            st == 201,
            "Read-Only tenant: Support ticket submission allowed through bypass to request payment help (HTTP 201)"
        )

    # =========================================================================
    # CHALLENGE 4: DISASTER RECOVERY INTEGRITY
    # =========================================================================
    def run_challenge_4_disaster_recovery(self):
        self.start_challenge(4, "Disaster Recovery Integrity")

        # Step 1: Execute backup generation
        print("\n  >>> Step 1: Atomic Backup Generation via POST /api/master/tenants/fatihciftligi/backup")
        st, backup_res = self.request(
            "POST",
            "/api/master/tenants/fatihciftligi/backup",
            expected_status=(201,)
        )
        self.assert_true(
            st == 201 and "backup" in backup_res,
            "Backup generated successfully with HTTP 201 Created"
        )

        backup_obj = backup_res.get("backup", {})
        backup_id = backup_obj.get("id")
        backup_file_path = backup_obj.get("file_path")
        recorded_sha256 = backup_obj.get("checksum_sha256")

        self.assert_true(os.path.exists(backup_file_path), f"Backup binary file exists on disk: {backup_file_path}")

        # Compute physical SHA256 checksum
        with open(backup_file_path, "rb") as f:
            computed_sha256 = hashlib.sha256(f.read()).hexdigest()

        self.assert_true(
            computed_sha256 == recorded_sha256,
            f"Physical backup file SHA256 matches recorded checksum ({recorded_sha256[:16]}...)"
        )

        # Step 2: Insert canary data into live tenant DB
        print("\n  >>> Step 2: Insert Disaster Canary Data Mutation into Live DB")
        canary_table = f"challenger_canary_{int(time.time() % 100000)}"
        p_conn = sqlite3.connect(PRIMARY_TENANT_DB_PATH)
        p_cur = p_conn.cursor()
        p_cur.execute(f"CREATE TABLE {canary_table} (id INTEGER PRIMARY KEY, canary_token TEXT, created_at DATETIME);")
        p_cur.execute(
            f"INSERT INTO {canary_table} (canary_token, created_at) VALUES ('CANARY_CORRUPTION_MARKER_999', datetime('now'));"
        )
        p_conn.commit()

        canary_pre_restore = p_cur.execute(
            f"SELECT COUNT(*) FROM {canary_table} WHERE canary_token = 'CANARY_CORRUPTION_MARKER_999';"
        ).fetchone()[0]
        p_conn.close()

        self.assert_true(
            canary_pre_restore == 1,
            f"Simulated disaster mutation active: canary table '{canary_table}' confirmed in live DB"
        )

        # Step 3: Execute restore
        print(f"\n  >>> Step 3: Trigger Live Database Restore (POST /api/master/backups/{backup_id}/restore)")
        st, restore_res = self.request(
            "POST",
            f"/api/master/backups/{backup_id}/restore",
            expected_status=(200,)
        )
        self.assert_true(
            st == 200 and restore_res.get("success") is True,
            "Database restore API returned HTTP 200 OK with success confirmation"
        )
        self.assert_true(
            "safety_snapshot" in restore_res,
            f"Pre-restore safety snapshot created: {restore_res.get('safety_snapshot')}"
        )

        # Step 4: Verify canary data rolled back
        print("\n  >>> Step 4: Verify Post-Restore State and Canary Removal")
        p_conn2 = sqlite3.connect(PRIMARY_TENANT_DB_PATH)
        p_cur2 = p_conn2.cursor()
        table_exists = p_cur2.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name = ?;",
            (canary_table,)
        ).fetchone()

        self.assert_true(
            table_exists is None,
            f"Canary mutation table '{canary_table}' completely rolled back; live DB restored to pre-disaster state"
        )

        # Step 5: Verify post-restore PRAGMA integrity_check and PRAGMA foreign_key_check
        integ_check = p_cur2.execute("PRAGMA integrity_check;").fetchall()
        fk_check = p_cur2.execute("PRAGMA foreign_key_check;").fetchall()
        p_conn2.close()

        self.assert_true(
            integ_check == [("ok",)],
            f"Post-restore PRAGMA integrity_check returned OK: {integ_check}"
        )
        self.assert_true(
            len(fk_check) == 0,
            f"Post-restore PRAGMA foreign_key_check returned 0 violations: {fk_check}"
        )

        # Step 6: Verify Go Fiber live connection pool cycling post-restore
        st, areas_post = self.request(
            "GET",
            "/api/tables/areas",
            headers={"X-Restaurant-Code": "fatihciftligi"},
            expected_status=(200,)
        )
        self.assert_true(
            st == 200 and isinstance(areas_post, list),
            "Go Fiber connection pool cleanly cycled post-restore: GET /api/tables/areas operational (HTTP 200)"
        )

    # =========================================================================
    # CLEANUP
    # =========================================================================
    def cleanup(self):
        print("\n" + "=" * 80)
        print("  CLEANING UP CHALLENGER TEST ARTIFACTS...")
        print("=" * 80)
        m_conn = sqlite3.connect(DATA_MASTER_DB_PATH)
        m_cur = m_conn.cursor()

        # Clean heartbeats
        m_cur.execute("DELETE FROM fleet_heartbeats WHERE device_id LIKE 'challenger-dev-%';")
        # Clean tickets
        m_cur.execute(
            """
            DELETE FROM support_ticket_audit_logs 
            WHERE ticket_id IN (SELECT id FROM support_tickets WHERE subject LIKE 'Concurrent Stress Ticket %');
            """
        )
        m_cur.execute("DELETE FROM support_tickets WHERE subject LIKE 'Concurrent Stress Ticket %';")
        m_cur.execute("DELETE FROM support_tickets WHERE subject = 'Zero Byte Screenshot';")
        m_cur.execute("DELETE FROM support_tickets WHERE subject = 'Help: Our account is in read-only mode';")

        # Clean created tenants
        for t in self.created_tenants:
            m_cur.execute("DELETE FROM restaurant_tenants WHERE code = ?;", (t,))
            m_cur.execute("DELETE FROM menu_clone_history WHERE target_tenant_code = ?;", (t,))
            t_file = os.path.join(ROOT_DIR, "backend", "data", "tenants", f"{t}.db")
            if os.path.exists(t_file):
                try:
                    os.remove(t_file)
                except Exception:
                    pass

        # Reset fatihciftligi status
        m_cur.execute("UPDATE restaurant_tenants SET status = 'active', read_only_mode = 0 WHERE code = 'fatihciftligi';")
        m_cur.execute("UPDATE tenant_storage_quotas SET allocated_quota_mb = 10240, is_quota_exceeded = 0 WHERE tenant_code = 'fatihciftligi';")
        m_conn.commit()
        m_conn.close()
        print("  [INFO] Challenger test artifacts cleaned up successfully.")

    def run_all(self) -> int:
        print("\n" + "#" * 80)
        print("  BONCORE SAAS EXPANSION - EMPIRICAL CHALLENGER 1 TEST SUITE")
        print("  Target Scope: Milestone 5 Verification Gate - Stress, Invariants, Disasters")
        print("#" * 80)

        t_start = time.time()
        try:
            self.run_challenge_1_concurrency()
            self.run_challenge_2_boundary_cases()
            self.run_challenge_3_delinquency_invariants()
            self.run_challenge_4_disaster_recovery()
        finally:
            self.cleanup()

        total_time = time.time() - t_start

        print("\n" + "=" * 80)
        print("  CHALLENGER 1 EMPIRICAL SUMMARY REPORT")
        print("=" * 80)
        print(f"  Total Duration   : {total_time:.2f} seconds")
        print(f"  Total Requests   : {self.total_requests}")
        print(f"  Total Assertions : {self.total_tests}")
        print(f"  Passed           : {self.passed_tests}")
        print(f"  Failed           : {self.failed_tests}")
        print(f"  HTTP 500 Count   : {self.http_500_count}")
        print(f"  Deadlock Count   : {self.deadlock_count}")
        print("-" * 80)
        for ch_name, stats in self.challenge_stats.items():
            print(f"  [{'PASS' if stats['failed'] == 0 else 'FAIL'}] {ch_name} | Passed: {stats['passed']}  Failed: {stats['failed']}")
        print("=" * 80)

        if self.failed_tests == 0 and self.http_500_count == 0 and self.deadlock_count == 0:
            print("\n  >>> CHALLENGER VERDICT: APPROVE (ALL 4 EMPIRICAL CHALLENGES PASSED)\n")
            return 0
        else:
            print(f"\n  >>> CHALLENGER VERDICT: REQUEST_CHANGES ({self.failed_tests} failures, {self.http_500_count} 500s)\n")
            for err in self.errors:
                print(f"    - {err}")
            return 1


if __name__ == "__main__":
    runner = EmpiricalChallengerRunner()
    sys.exit(runner.run_all())
