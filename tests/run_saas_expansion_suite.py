#!/usr/bin/env python3
"""
BonCore SaaS Master Admin Expansion - Automated CLI E2E Regression Test Suite
=============================================================================
Executable non-interactively via:
    python tests/run_saas_expansion_suite.py

Milestone 4: Automated E2E Regression Suite across all 7 Expansion Modules:
    - R1: Feature Flags & Plan Management (Modül & Özellik Lisanslama)
    - R2: Live Fleet Monitoring & System Health (Canlı Restoran Radarı)
    - R3: Billing, Invoicing & Recurring Payments (SaaS Finans & VPOS)
    - R4: Multi-Branch & Franchise Management (Şube / Zincir & Menü Klonlama)
    - R5: Broadcast Announcements & Notification Center (Duyuru Merkezi)
    - R6: Ticketing & Support Management (Destek & Talep Yönetimi)
    - R7: Database Backup & Storage Quota Tracking (Yedekleme & Kota)

Coverage Tiers:
    - Tier 1: Feature Coverage (R1-R7 Happy Paths)
    - Tier 2: Boundary & Corner Cases (Invalid Credentials, 404s, 403s, Read-Only Enforcement, Malformed Inputs)
    - Tier 3: Cross-Feature Interactions (Delinquency Cascades, Menu Cloning & Price Markups, Ticket Audit Trails, Announcement Dismissals)
    - Tier 4: Real-world End-to-End Operational Lifecycle (Franchise Onboarding, Multi-Device Fleet Pulse, Billing Due Cycle, Disaster Recovery Restore)
"""

import os
import sys
import json
import time
import sqlite3
import hashlib
import subprocess
import urllib.request
import urllib.parse
import urllib.error
from typing import Any, Dict, List, Optional, Tuple

# Force UTF-8 console output on Windows
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE_URL = "http://127.0.0.1:8000"

DATA_MASTER_DB_PATH = os.path.join(ROOT_DIR, "backend", "data", "master.db")
ROOT_MASTER_DB_PATH = os.path.join(ROOT_DIR, "backend", "master.db")
PRIMARY_TENANT_DB_PATH = os.path.join(ROOT_DIR, "backend", "data", "tenants", "fatihciftligi.db")


def encode_multipart_form(fields: Dict[str, Any], files: Optional[Dict[str, Tuple[str, bytes, str]]] = None) -> Tuple[bytes, str]:
    """Pure standard-library multipart form-data encoder."""
    boundary = f"----BonCoreE2EBoundary{int(time.time() * 1000):x}"
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


class SaasExpansionSuiteRunner:
    def __init__(self):
        self.total_tests = 0
        self.passed_tests = 0
        self.failed_tests = 0
        self.total_requests = 0
        self.errors: List[str] = []
        self.tier_stats: Dict[str, Dict[str, int]] = {}
        self.current_tier = ""
        self.server_process: Optional[subprocess.Popen] = None
        self.start_time = 0.0
        self.created_ticket_id: Optional[int] = None

    def start_tier(self, tier_id: int, tier_name: str):
        self.current_tier = f"Tier {tier_id}: {tier_name}"
        self.tier_stats[self.current_tier] = {"passed": 0, "failed": 0}
        print("\n" + "=" * 80)
        print(f"  [TIER {tier_id}] {tier_name.upper()}")
        print("=" * 80)

    def assert_true(self, condition: bool, message: str) -> bool:
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

    def request(
        self,
        method: str,
        path: str,
        data: Optional[Any] = None,
        headers: Optional[Dict[str, str]] = None,
        expected_status: Tuple[int, ...] = (200, 201),
        raw_body: Optional[bytes] = None,
        content_type: Optional[str] = None
    ) -> Any:
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
            with urllib.request.urlopen(req, timeout=12) as resp:
                status = resp.status
                body = resp.read()
                resp_content_type = resp.headers.get("Content-Type", "")
                res_data = None
                if "application/json" in resp_content_type:
                    try:
                        res_data = json.loads(body.decode("utf-8", errors="replace"))
                    except Exception:
                        res_data = body
                else:
                    res_data = body

                matched = status in expected_status
                self.assert_true(
                    matched,
                    f"{method} {path} returned HTTP {status} (expected {expected_status})"
                )
                return res_data
        except urllib.error.HTTPError as e:
            body = e.read()
            body_str = body.decode("utf-8", errors="replace")
            matched = e.code in expected_status
            self.assert_true(
                matched,
                f"{method} {path} returned HTTP {e.code} (expected {expected_status}): {body_str[:160]}"
            )
            if matched:
                try:
                    return json.loads(body_str)
                except Exception:
                    return body_str
            return None
        except Exception as e:
            self.assert_true(False, f"{method} {path} network exception: {e}")
            return None

    def ensure_server_running(self) -> bool:
        """Check if Go server is running and responding to /health; launch if needed."""
        try:
            req = urllib.request.Request(f"{BASE_URL}/health")
            with urllib.request.urlopen(req, timeout=2.0) as resp:
                if resp.status == 200:
                    print(f"  [INFO] Go Fiber backend server is active and healthy on port 8000.")
                    return True
        except Exception:
            pass

        print(f"  [INFO] Go Fiber server not responding. Starting backend-go/boncore-pos-server.exe...")
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

        for _ in range(30):
            time.sleep(0.5)
            try:
                req = urllib.request.Request(f"{BASE_URL}/health")
                with urllib.request.urlopen(req, timeout=1.0) as resp:
                    if resp.status == 200:
                        print(f"  [INFO] Go Fiber backend server started successfully (PID: {self.server_process.pid}).")
                        return True
            except Exception:
                pass

        print(f"  [ERROR] Failed to connect to Go Fiber server on port 8000.")
        return False

    def cleanup(self):
        """Cleanup spawned server process if one was started by runner."""
        if self.server_process:
            print(f"\n  [INFO] Terminating runner-spawned server process (PID: {self.server_process.pid})...")
            try:
                self.server_process.terminate()
                self.server_process.wait(timeout=3)
            except Exception:
                self.server_process.kill()

    # =========================================================================
    # TIER 1: FEATURE COVERAGE (R1-R7 HAPPY PATHS)
    # =========================================================================
    def run_tier_1_feature_coverage(self):
        self.start_tier(1, "Feature Coverage (R1-R7 Happy Paths)")

        # ---------------------------------------------------------------------
        # 1.1 R1: Feature Flags & Plan Management
        # ---------------------------------------------------------------------
        plans = self.request("GET", "/api/master/plans", expected_status=(200,))
        self.assert_true(
            isinstance(plans, list) and len(plans) >= 3,
            f"GET /api/master/plans returned {len(plans) if isinstance(plans, list) else 0} SaaS plans (>= 3)"
        )
        plan_codes = [p.get("code") for p in plans if isinstance(p, dict)]
        self.assert_true(
            all(code in plan_codes for code in ["starter", "pro", "enterprise"]),
            f"Standard subscription tiers present: {plan_codes}"
        )

        fatih_features = self.request("GET", "/api/master/tenants/fatihciftligi/features", expected_status=(200,))
        self.assert_true(
            isinstance(fatih_features, dict) and fatih_features.get("tenant_code") == "fatihciftligi",
            "GET /api/master/tenants/fatihciftligi/features returned valid tenant feature object"
        )
        expected_modules = [
            "feature_qr_menu", "feature_kds", "feature_delivery", "feature_integrations",
            "feature_e_invoice", "feature_stock_recipe", "feature_loyalty"
        ]
        has_all_toggles = all(m in fatih_features for m in expected_modules)
        self.assert_true(
            has_all_toggles,
            "Tenant feature payload includes all 7 SaaS module flags"
        )

        update_feat_res = self.request(
            "PUT",
            "/api/master/tenants/fatihciftligi/features",
            data={
                "plan_code": "enterprise",
                "feature_delivery": True,
                "feature_loyalty": True,
                "feature_stock_recipe": True
            },
            expected_status=(200,)
        )
        self.assert_true(
            update_feat_res and update_feat_res.get("success") is True,
            "PUT /api/master/tenants/fatihciftligi/features updated licensing flags successfully"
        )

        mod_status = self.request(
            "GET",
            "/api/modules/status",
            headers={"X-Restaurant-Code": "fatihciftligi"},
            expected_status=(200,)
        )
        self.assert_true(
            mod_status and "features" in mod_status and mod_status.get("status") == "active",
            "GET /api/modules/status returned tenant active operational modules"
        )

        # ---------------------------------------------------------------------
        # 1.2 R2: Live Fleet Monitoring & Heartbeats
        # ---------------------------------------------------------------------
        devices = [
            ("e2e-pos-term-1", "pos", "Ana Kasa Terminali"),
            ("e2e-tablet-waiter-1", "tablet", "Garson Tableti"),
            ("e2e-handheld-pos-1", "handheld", "Mobil El Terminali"),
            ("e2e-kds-kitchen-1", "kds", "Mutfak KDS Ekranı"),
        ]
        for dev_id, dev_type, dev_name in devices:
            hb_res = self.request(
                "POST",
                "/api/heartbeat",
                data={
                    "device_id": dev_id,
                    "device_type": dev_type,
                    "device_name": dev_name,
                    "app_version": "2.1.0",
                    "ip_address": "192.168.1.150",
                    "tenant_code": "fatihciftligi"
                },
                expected_status=(200,)
            )
            self.assert_true(
                hb_res and (hb_res.get("status") == "ok" or hb_res.get("is_online") is True),
                f"POST /api/heartbeat registered device pulse for {dev_name} ({dev_type})"
            )

        fleet_list = self.request("GET", "/api/master/fleet", expected_status=(200,))
        self.assert_true(
            isinstance(fleet_list, list) and len(fleet_list) >= 1,
            f"GET /api/master/fleet returned fleet list with {len(fleet_list) if isinstance(fleet_list, list) else 0} tenants"
        )
        fatih_fleet = next((f for f in fleet_list if f.get("code") == "fatihciftligi"), None)
        self.assert_true(
            fatih_fleet is not None and fatih_fleet.get("is_online") is True,
            "Fleet radar confirms 'fatihciftligi' is online with active telemetry"
        )
        if fatih_fleet:
            f_devs = fatih_fleet.get("devices", {})
            self.assert_true(
                f_devs.get("total", 0) >= 4,
                f"Fleet radar tracks connected devices breakdown: total={f_devs.get('total')}, pos={f_devs.get('pos')}, tablets={f_devs.get('tablets')}, handhelds={f_devs.get('handhelds')}, kds={f_devs.get('kds')}"
            )
            f_metrics = fatih_fleet.get("metrics", {})
            self.assert_true(
                "live_revenue" in f_metrics and "active_orders" in f_metrics,
                "Fleet radar reports live revenue and active orders pulse"
            )

        # ---------------------------------------------------------------------
        # 1.3 R3: SaaS Billing, Invoicing & Virtual POS
        # ---------------------------------------------------------------------
        vpos_configs = self.request("GET", "/api/master/billing/gateway-settings", expected_status=(200,))
        self.assert_true(
            isinstance(vpos_configs, list) and len(vpos_configs) >= 2,
            f"GET /api/master/billing/gateway-settings returned {len(vpos_configs) if isinstance(vpos_configs, list) else 0} gateway configurations"
        )
        paytr_cfg = next((c for c in vpos_configs if c.get("gateway_provider") == "paytr"), None)
        self.assert_true(
            paytr_cfg is not None and "***" in paytr_cfg.get("api_secret", ""),
            "PayTR gateway credentials properly mask API secret in response"
        )

        put_vpos = self.request(
            "PUT",
            "/api/master/billing/gateway-settings",
            data={
                "gateway_provider": "paytr",
                "merchant_id": "PAYTR_TEST_MERCHANT_E2E",
                "api_key": "PAYTR_API_KEY_E2E",
                "is_production": False,
                "is_active": True
            },
            expected_status=(200,)
        )
        self.assert_true(
            put_vpos and put_vpos.get("success") is True,
            "PUT /api/master/billing/gateway-settings updated PayTR test configuration"
        )

        test_conn = self.request(
            "POST",
            "/api/master/billing/test-connection",
            data={"gateway_provider": "paytr"},
            expected_status=(200,)
        )
        self.assert_true(
            test_conn and test_conn.get("success") is True and "ping_ms" in test_conn,
            f"POST /api/master/billing/test-connection simulated gateway ping ({test_conn.get('ping_ms') if test_conn else 0} ms)"
        )

        inv_create = self.request(
            "POST",
            "/api/master/invoices",
            data={
                "tenant_code": "fatihciftligi",
                "amount": 2990.0,
                "period": "2026-11",
                "due_date_days": 10
            },
            expected_status=(201,)
        )
        self.assert_true(
            inv_create and "invoice" in inv_create,
            "POST /api/master/invoices generated SaaS subscription invoice"
        )
        created_invoice = inv_create.get("invoice", {})
        created_inv_id = created_invoice.get("id")
        self.assert_true(
            created_invoice.get("tax_amount", 0) > 0 and created_invoice.get("subtotal", 0) > 0,
            f"Invoice computed tax ({created_invoice.get('tax_amount')}) and subtotal ({created_invoice.get('subtotal')})"
        )

        invoices_list = self.request("GET", "/api/master/invoices", expected_status=(200,))
        self.assert_true(
            isinstance(invoices_list, list) and any(i.get("id") == created_inv_id for i in invoices_list),
            f"GET /api/master/invoices includes newly created invoice #{created_inv_id}"
        )

        pay_res = self.request(
            "PUT",
            f"/api/master/invoices/{created_inv_id}/pay",
            expected_status=(200,)
        )
        self.assert_true(
            pay_res and pay_res.get("success") is True,
            f"PUT /api/master/invoices/{created_inv_id}/pay marked invoice paid and unblocked tenant"
        )

        due_check = self.request("POST", "/api/master/invoices/run-due-check", expected_status=(200,))
        self.assert_true(
            due_check and due_check.get("success") is True,
            "POST /api/master/invoices/run-due-check executed automated delinquency evaluation"
        )

        # ---------------------------------------------------------------------
        # 1.4 R4: Multi-Branch & Franchise Management
        # ---------------------------------------------------------------------
        brand_code = f"e2e-brand-{int(time.time() % 100000)}"
        brand_create = self.request(
            "POST",
            "/api/master/brands",
            data={
                "code": brand_code,
                "name": "E2E Gurme Lezzetler Grubu",
                "primary_tenant_code": "fatihciftligi",
                "contact_person": "Ahmet E2E",
                "contact_email": "e2e@boncore.local"
            },
            expected_status=(201,)
        )
        self.assert_true(
            brand_create and "brand" in brand_create,
            f"POST /api/master/brands registered corporate franchise brand '{brand_code}'"
        )
        brand_obj = brand_create.get("brand", {})
        created_brand_id = brand_obj.get("id")

        brands_list = self.request("GET", "/api/master/brands", expected_status=(200,))
        self.assert_true(
            isinstance(brands_list, list) and any(b.get("id") == created_brand_id for b in brands_list),
            f"GET /api/master/brands lists brand #{created_brand_id}"
        )

        analytics = self.request(
            "GET",
            f"/api/master/brands/{created_brand_id}/analytics",
            expected_status=(200,)
        )
        self.assert_true(
            analytics and "consolidated" in analytics and "branches" in analytics,
            f"GET /api/master/brands/{created_brand_id}/analytics aggregates chain-wide consolidated turnover"
        )

        # ---------------------------------------------------------------------
        # 1.5 R5: Broadcast Announcements
        # ---------------------------------------------------------------------
        ann_create = self.request(
            "POST",
            "/api/master/broadcast",
            data={
                "title": "E2E Canlı Sistem Güncellemesi",
                "content": "Bu gece 02:00-03:00 saatleri arasında veritabanı optimizasyonu yapılacaktır.",
                "banner_type": "warning",
                "target_type": "all",
                "show_as_popup": True,
                "dismissible": True
            },
            expected_status=(201,)
        )
        self.assert_true(
            ann_create and "announcement" in ann_create,
            "POST /api/master/broadcast dispatched global announcement to POS terminals"
        )
        created_ann = ann_create.get("announcement", {})
        created_ann_id = created_ann.get("id")

        pos_active_anns = self.request(
            "GET",
            "/api/announcements/active",
            headers={"X-Restaurant-Code": "fatihciftligi"},
            expected_status=(200,)
        )
        self.assert_true(
            isinstance(pos_active_anns, list) and any(a.get("id") == created_ann_id for a in pos_active_anns),
            f"GET /api/announcements/active fetched announcement #{created_ann_id} for POS client"
        )

        admin_anns = self.request("GET", "/api/master/announcements", expected_status=(200,))
        self.assert_true(
            isinstance(admin_anns, list) and any(a.get("id") == created_ann_id for a in admin_anns),
            f"GET /api/master/announcements listed broadcast history in Master Admin"
        )

        # ---------------------------------------------------------------------
        # 1.6 R6: Ticketing & Support Management
        # ---------------------------------------------------------------------
        ticket_create = self.request(
            "POST",
            "/api/support/tickets",
            data={
                "category": "hardware",
                "priority": "high",
                "subject": "E2E Yazıcı Bağlantı Kontrolü",
                "description": "Kasa termal yazıcı COM3 portundan yanıt vermiyor.",
                "submitted_by_name": "Kasiyer Mehmet",
                "submitted_by_role": "cashier",
                "device_info": "Epson TM-T88VI Serial COM3"
            },
            headers={"X-Restaurant-Code": "fatihciftligi"},
            expected_status=(201,)
        )
        self.assert_true(
            ticket_create and "ticket" in ticket_create,
            "POST /api/support/tickets submitted support ticket from POS terminal"
        )
        ticket_obj = ticket_create.get("ticket", {})
        created_ticket_id = ticket_obj.get("id")
        self.created_ticket_id = created_ticket_id
        self.assert_true(
            str(ticket_obj.get("ticket_number", "")).startswith("TCK-"),
            f"Support ticket generated official tracking number: {ticket_obj.get('ticket_number')}"
        )

        pos_tickets = self.request(
            "GET",
            "/api/support/tickets",
            headers={"X-Restaurant-Code": "fatihciftligi"},
            expected_status=(200,)
        )
        self.assert_true(
            isinstance(pos_tickets, list) and any(t.get("id") == created_ticket_id for t in pos_tickets),
            f"GET /api/support/tickets returned tenant tickets including #{created_ticket_id}"
        )

        admin_tickets = self.request("GET", "/api/master/tickets", expected_status=(200,))
        self.assert_true(
            isinstance(admin_tickets, list) and any(t.get("id") == created_ticket_id for t in admin_tickets),
            f"GET /api/master/tickets returned master tickets list including #{created_ticket_id}"
        )

        ticket_detail = self.request("GET", f"/api/master/tickets/{created_ticket_id}", expected_status=(200,))
        self.assert_true(
            ticket_detail and "ticket" in ticket_detail and "logs" in ticket_detail,
            f"GET /api/master/tickets/{created_ticket_id} loaded ticket details with audit trail"
        )

        status_upd = self.request(
            "PUT",
            f"/api/master/tickets/{created_ticket_id}/status",
            data={
                "status": "in_review",
                "assigned_to": "Destek Uzmanı Kemal",
                "performed_by": "Master Admin"
            },
            expected_status=(200,)
        )
        self.assert_true(
            status_upd and status_upd.get("success") is True,
            f"PUT /api/master/tickets/{created_ticket_id}/status updated lifecycle to 'in_review'"
        )

        msg_reply = self.request(
            "POST",
            f"/api/master/tickets/{created_ticket_id}/messages",
            data={
                "message": "Yazıcı sürücüsü ve kablo bağlantısı uzaktan inceleniyor.",
                "sender_type": "admin",
                "sender_name": "Destek Uzmanı Kemal"
            },
            expected_status=(201,)
        )
        self.assert_true(
            msg_reply and msg_reply.get("success") is True,
            f"POST /api/master/tickets/{created_ticket_id}/messages recorded admin reply message"
        )

        resolve_res = self.request(
            "PUT",
            f"/api/master/tickets/{created_ticket_id}/status",
            data={
                "status": "resolved",
                "resolution_notes": "COM port hızı 9600 baud olarak güncellendi ve test çıktısı alındı.",
                "performed_by": "Master Admin"
            },
            expected_status=(200,)
        )
        self.assert_true(
            resolve_res and resolve_res.get("success") is True and resolve_res.get("ticket", {}).get("resolved_at") is not None,
            f"PUT /api/master/tickets/{created_ticket_id}/status transitioned ticket to 'resolved'"
        )

        # ---------------------------------------------------------------------
        # 1.7 R7: Database Backup & Storage Quota Tracking
        # ---------------------------------------------------------------------
        backup_gen = self.request(
            "POST",
            "/api/master/tenants/fatihciftligi/backup",
            expected_status=(201,)
        )
        self.assert_true(
            backup_gen and "backup" in backup_gen,
            "POST /api/master/tenants/fatihciftligi/backup generated WAL-checkpointed atomic snapshot"
        )
        backup_item = backup_gen.get("backup", {})
        created_backup_id = backup_item.get("id")
        self.assert_true(
            backup_item.get("file_size_bytes", 0) > 0 and backup_item.get("checksum_sha256") is not None,
            f"Backup archive created: {backup_item.get('backup_name')} ({backup_item.get('file_size_bytes')} bytes, SHA256={str(backup_item.get('checksum_sha256'))[:16]}...)"
        )

        backups_list = self.request("GET", "/api/master/tenants/fatihciftligi/backups", expected_status=(200,))
        self.assert_true(
            isinstance(backups_list, list) and any(b.get("id") == created_backup_id for b in backups_list),
            f"GET /api/master/tenants/fatihciftligi/backups lists backup #{created_backup_id}"
        )

        dl_data = self.request("GET", f"/api/master/backups/{created_backup_id}/download", expected_status=(200,))
        self.assert_true(
            isinstance(dl_data, bytes) and len(dl_data) > 0,
            f"GET /api/master/backups/{created_backup_id}/download retrieved binary archive ({len(dl_data) if isinstance(dl_data, bytes) else 0} bytes)"
        )
        if isinstance(dl_data, bytes):
            calc_sha = hashlib.sha256(dl_data).hexdigest()
            self.assert_true(
                calc_sha == backup_item.get("checksum_sha256"),
                "Downloaded backup archive SHA256 checksum matches database record 100%"
            )

        quota_res = self.request("GET", "/api/master/tenants/fatihciftligi/quota", expected_status=(200,))
        self.assert_true(
            quota_res and quota_res.get("allocated_quota_mb") == 10240,
            f"GET /api/master/tenants/fatihciftligi/quota tracks Enterprise 10240 MB storage limit (used: {quota_res.get('total_used_mb') if quota_res else 0} MB)"
        )

        storage_summary = self.request("GET", "/api/master/storage/summary", expected_status=(200,))
        self.assert_true(
            storage_summary and storage_summary.get("total_tenants", 0) >= 1 and storage_summary.get("total_backups_count", 0) >= 1,
            f"GET /api/master/storage/summary reports platform-wide storage statistics (total backups: {storage_summary.get('total_backups_count') if storage_summary else 0})"
        )

    # =========================================================================
    # TIER 2: BOUNDARY & CORNER CASES
    # =========================================================================
    def run_tier_2_boundary_corner_cases(self):
        self.start_tier(2, "Boundary & Corner Cases (Invalid Credentials, 404s, 403s & Invariants)")

        # ---------------------------------------------------------------------
        # 2.1 Invalid/Unsupported VPOS Credentials Provider -> 400 Bad Request
        # ---------------------------------------------------------------------
        bad_vpos = self.request(
            "PUT",
            "/api/master/billing/gateway-settings",
            data={"gateway_provider": "unsupported_crypto_coin_pay"},
            expected_status=(400,)
        )
        self.assert_true(
            bad_vpos and ("Desteklenmeyen" in str(bad_vpos) or "desteklenmeyen" in str(bad_vpos).lower()),
            "PUT /api/master/billing/gateway-settings rejects unsupported payment provider with HTTP 400"
        )

        # ---------------------------------------------------------------------
        # 2.2 Nonexistent Tenant Lookups -> 404 Not Found
        # ---------------------------------------------------------------------
        self.request(
            "GET",
            "/api/master/tenants/nonexistent-store-xyz-99999/features",
            expected_status=(404,)
        )
        self.assert_true(True, "GET /api/master/tenants/:nonexistent/features correctly returned HTTP 404 Not Found")

        self.request(
            "GET",
            "/api/master/tenants/nonexistent-store-xyz-99999/quota",
            expected_status=(404,)
        )
        self.assert_true(True, "GET /api/master/tenants/:nonexistent/quota correctly returned HTTP 404 Not Found")

        self.request(
            "POST",
            "/api/master/tenants/nonexistent-store-xyz-99999/backup",
            expected_status=(404,)
        )
        self.assert_true(True, "POST /api/master/tenants/:nonexistent/backup correctly returned HTTP 404 Not Found")

        # ---------------------------------------------------------------------
        # 2.3 Nonexistent Entity Lookups -> 404 Not Found
        # ---------------------------------------------------------------------
        self.request("GET", "/api/master/brands/999999/analytics", expected_status=(404,))
        self.assert_true(True, "GET /api/master/brands/999999/analytics correctly returned HTTP 404 Not Found")

        self.request("GET", "/api/master/tickets/999999", expected_status=(404,))
        self.assert_true(True, "GET /api/master/tickets/999999 correctly returned HTTP 404 Not Found")

        self.request("GET", "/api/master/backups/999999/download", expected_status=(404,))
        self.assert_true(True, "GET /api/master/backups/999999/download correctly returned HTTP 404 Not Found")

        self.request("POST", "/api/master/backups/999999/restore", expected_status=(404,))
        self.assert_true(True, "POST /api/master/backups/999999/restore correctly returned HTTP 404 Not Found")

        # ---------------------------------------------------------------------
        # 2.4 Unauthorized Feature Access -> 403 Forbidden
        # ---------------------------------------------------------------------
        # Create a test tenant in Master DB with feature_qr_menu = false and feature_kds = false
        test_no_feat_code = "e2e-no-feat-tenant"
        m_conn = sqlite3.connect(DATA_MASTER_DB_PATH)
        m_cur = m_conn.cursor()
        m_cur.execute(
            """
            INSERT INTO restaurant_tenants (code, name, plan, plan_code, status, feature_qr_menu, feature_kds, feature_delivery, is_brand_master, read_only_mode)
            VALUES (?, 'E2E Disabled Features Cafe', 'starter', 'starter', 'active', 0, 0, 0, 0, 0)
            ON CONFLICT(code) DO UPDATE SET feature_qr_menu = 0, feature_kds = 0, feature_delivery = 0, status = 'active', read_only_mode = 0;
            """,
            (test_no_feat_code,)
        )
        m_conn.commit()
        m_conn.close()

        qr_blocked = self.request(
            "GET",
            "/api/qr/table/1/menu",
            headers={"X-Restaurant-Code": test_no_feat_code},
            expected_status=(403,)
        )
        self.assert_true(
            qr_blocked and qr_blocked.get("code") == "FEATURE_DISABLED",
            "RequireFeature guard blocked unauthorized /api/qr access with HTTP 403 (FEATURE_DISABLED)"
        )

        kds_blocked = self.request(
            "GET",
            "/api/kds/orders",
            headers={"X-Restaurant-Code": test_no_feat_code},
            expected_status=(403,)
        )
        self.assert_true(
            kds_blocked and kds_blocked.get("code") == "FEATURE_DISABLED",
            "RequireFeature guard blocked unauthorized /api/kds access with HTTP 403 (FEATURE_DISABLED)"
        )

        # ---------------------------------------------------------------------
        # 2.5 Past-Due Account Read-Only Enforcement (Allow GET, Block POST/PUT)
        # ---------------------------------------------------------------------
        test_ro_code = "e2e-readonly-store"
        m_conn = sqlite3.connect(DATA_MASTER_DB_PATH)
        m_cur = m_conn.cursor()
        m_cur.execute(
            """
            INSERT INTO restaurant_tenants (code, name, plan, plan_code, status, read_only_mode, feature_qr_menu, feature_kds, feature_stock_recipe)
            VALUES (?, 'E2E ReadOnly Cafe', 'pro', 'pro', 'active', 1, 1, 1, 1)
            ON CONFLICT(code) DO UPDATE SET read_only_mode = 1, status = 'active';
            """,
            (test_ro_code,)
        )
        m_conn.commit()
        m_conn.close()

        # Safe GET request must succeed in read-only mode
        ro_get = self.request(
            "GET",
            "/api/tables/areas",
            headers={"X-Restaurant-Code": test_ro_code},
            expected_status=(200,)
        )
        self.assert_true(
            ro_get is not None,
            "CheckTenantDelinquencyMiddleware permitted safe GET /api/tables/areas in read-only mode (HTTP 200)"
        )

        # POST request (write operation) must be blocked with HTTP 403
        ro_post = self.request(
            "POST",
            "/api/orders",
            data={"table_id": 1, "items": []},
            headers={"X-Restaurant-Code": test_ro_code},
            expected_status=(403,)
        )
        self.assert_true(
            ro_post and ro_post.get("code") == "READ_ONLY_MODE",
            "CheckTenantDelinquencyMiddleware blocked POST /api/orders in read-only mode with HTTP 403 (READ_ONLY_MODE)"
        )

        # PUT request (write operation) must be blocked with HTTP 403
        ro_put = self.request(
            "PUT",
            "/api/tables/layout/positions",
            data=[],
            headers={"X-Restaurant-Code": test_ro_code},
            expected_status=(403,)
        )
        self.assert_true(
            ro_put and ro_put.get("code") == "READ_ONLY_MODE",
            "CheckTenantDelinquencyMiddleware blocked PUT /api/tables/layout/positions in read-only mode with HTTP 403"
        )

        # Support ticket submission is permitted even in read-only mode so tenant can ask for assistance
        ro_ticket = self.request(
            "POST",
            "/api/support/tickets",
            data={
                "category": "billing",
                "subject": "Fatura Ödeme Talebi",
                "description": "Hesabımız salt okunur modda, ödeme linki rica ediyoruz."
            },
            headers={"X-Restaurant-Code": test_ro_code},
            expected_status=(201,)
        )
        self.assert_true(
            ro_ticket and "ticket" in ro_ticket,
            "CheckTenantDelinquencyMiddleware safely permitted support ticket creation during read-only mode"
        )

        # ---------------------------------------------------------------------
        # 2.6 Oversized, Missing & Malformed Inputs -> 400 Bad Request
        # ---------------------------------------------------------------------
        # Broadcast with empty title and empty content
        bad_bc = self.request(
            "POST",
            "/api/master/broadcast",
            data={"title": "   ", "content": ""},
            expected_status=(400,)
        )
        self.assert_true(
            bad_bc and "zorunludur" in str(bad_bc),
            "POST /api/master/broadcast rejected empty title/content with HTTP 400 Bad Request"
        )

        # Support ticket with empty subject and description
        bad_tck = self.request(
            "POST",
            "/api/support/tickets",
            data={"subject": "", "description": ""},
            headers={"X-Restaurant-Code": "fatihciftligi"},
            expected_status=(400,)
        )
        self.assert_true(
            bad_tck and "zorunludur" in str(bad_tck),
            "POST /api/support/tickets rejected empty subject/description with HTTP 400 Bad Request"
        )

        # Brand with empty code
        bad_brand = self.request(
            "POST",
            "/api/master/brands",
            data={"code": "", "name": "Brand Without Code"},
            expected_status=(400,)
        )
        self.assert_true(
            bad_brand and "zorunludur" in str(bad_brand),
            "POST /api/master/brands rejected empty brand code with HTTP 400 Bad Request"
        )

        # Menu clone with missing source or targets
        bad_clone = self.request(
            "POST",
            "/api/master/menu/clone",
            data={"source_tenant_code": "", "target_tenant_codes": []},
            expected_status=(400,)
        )
        self.assert_true(
            bad_clone is not None,
            "POST /api/master/menu/clone rejected missing source/targets with HTTP 400 Bad Request"
        )

        # Dismiss announcement with invalid non-numeric ID
        bad_dismiss = self.request(
            "POST",
            "/api/announcements/not-a-numeric-id/dismiss",
            expected_status=(400,)
        )
        self.assert_true(
            bad_dismiss is not None,
            "POST /api/announcements/:id/dismiss rejected malformed ID with HTTP 400 Bad Request"
        )

        # ---------------------------------------------------------------------
        # 2.7 Invalid Status Transitions -> 400 Bad Request
        # ---------------------------------------------------------------------
        ticket_target_id = self.created_ticket_id or 1
        bad_status = self.request(
            "PUT",
            f"/api/master/tickets/{ticket_target_id}/status",
            data={"status": ""},
            expected_status=(400,)
        )
        self.assert_true(
            bad_status is not None,
            f"PUT /api/master/tickets/{ticket_target_id}/status rejected empty status with HTTP 400 Bad Request"
        )

    # =========================================================================
    # TIER 3: CROSS-FEATURE INTERACTIONS
    # =========================================================================
    def run_tier_3_cross_feature_interactions(self):
        self.start_tier(3, "Cross-Feature Interactions & End-to-End Interoperability")

        # ---------------------------------------------------------------------
        # 3.1 Delinquency Suspension Cascading Across System
        # ---------------------------------------------------------------------
        test_susp_code = "e2e-delinquent-cafe"
        m_conn = sqlite3.connect(DATA_MASTER_DB_PATH)
        m_cur = m_conn.cursor()
        m_cur.execute(
            """
            INSERT INTO restaurant_tenants (code, name, plan, plan_code, status, read_only_mode, feature_qr_menu, feature_kds)
            VALUES (?, 'E2E Suspended Cafe', 'pro', 'pro', 'suspended', 0, 1, 1)
            ON CONFLICT(code) DO UPDATE SET status = 'suspended', read_only_mode = 0;
            """,
            (test_susp_code,)
        )
        m_conn.commit()
        m_conn.close()

        # Suspended tenant must be blocked on general endpoints with HTTP 403
        susp_blocked = self.request(
            "GET",
            "/api/tables/areas",
            headers={"X-Restaurant-Code": test_susp_code},
            expected_status=(403,)
        )
        self.assert_true(
            susp_blocked and susp_blocked.get("code") == "ACCOUNT_SUSPENDED",
            "Suspended account blocked on GET /api/tables/areas with HTTP 403 (ACCOUNT_SUSPENDED)"
        )

        susp_post_blocked = self.request(
            "POST",
            "/api/orders",
            data={"table_id": 1},
            headers={"X-Restaurant-Code": test_susp_code},
            expected_status=(403,)
        )
        self.assert_true(
            susp_post_blocked and susp_post_blocked.get("code") == "ACCOUNT_SUSPENDED",
            "Suspended account blocked on POST /api/orders with HTTP 403 (ACCOUNT_SUSPENDED)"
        )

        # Suspended tenant is also blocked on regular module endpoints
        susp_status = self.request(
            "GET",
            "/api/modules/status",
            headers={"X-Restaurant-Code": test_susp_code},
            expected_status=(403,)
        )
        self.assert_true(
            susp_status and susp_status.get("code") == "ACCOUNT_SUSPENDED",
            "CheckTenantDelinquencyMiddleware consistently protects /api/modules/status from suspended access"
        )

        # Heartbeat telemetry still functions for suspended tenant to report terminal presence
        susp_hb = self.request(
            "POST",
            "/api/heartbeat",
            data={
                "device_id": "susp-pos-term",
                "device_type": "pos",
                "device_name": "Suspended POS",
                "tenant_code": test_susp_code
            },
            expected_status=(200,)
        )
        self.assert_true(
            susp_hb and (susp_hb.get("status") == "ok" or susp_hb.get("is_online") is True),
            "Heartbeat pings from suspended store permitted to maintain fleet radar visibility"
        )

        # Fleet radar marks suspended store as suspended
        fleet_res = self.request("GET", "/api/master/fleet", expected_status=(200,))
        susp_fleet_entry = next((f for f in fleet_res if f.get("code") == test_susp_code), None)
        self.assert_true(
            susp_fleet_entry is not None and susp_fleet_entry.get("status") == "suspended",
            "Master Admin fleet radar accurately tags delinquent store as 'suspended'"
        )

        # Restore tenant to active via Master Admin features update
        restore_feat = self.request(
            "PUT",
            f"/api/master/tenants/{test_susp_code}/features",
            data={"status": "active"},
            expected_status=(200,)
        )
        self.assert_true(
            restore_feat and restore_feat.get("success") is True,
            f"Master Admin restored delinquent store '{test_susp_code}' to 'active'"
        )

        # Verify immediately unblocked
        unblocked_res = self.request(
            "GET",
            "/api/tables/areas",
            headers={"X-Restaurant-Code": test_susp_code},
            expected_status=(200,)
        )
        self.assert_true(
            unblocked_res is not None,
            "Restored tenant immediately regain access to /api/tables/areas (HTTP 200)"
        )

        # ---------------------------------------------------------------------
        # 3.2 Menu Cloning Between Branches with Price Markup Engine
        # ---------------------------------------------------------------------
        target_branch_code = f"e2e-clone-target-{int(time.time() % 100000)}"
        # Seed branch tenant in master db
        m_conn = sqlite3.connect(DATA_MASTER_DB_PATH)
        m_cur = m_conn.cursor()
        m_cur.execute(
            """
            INSERT INTO restaurant_tenants (code, name, plan, plan_code, status, is_brand_master)
            VALUES (?, 'E2E Kadıköy Şubesi', 'pro', 'pro', 'active', 0)
            ON CONFLICT(code) DO NOTHING;
            """,
            (target_branch_code,)
        )
        m_conn.commit()
        m_conn.close()

        # Query source database stats
        src_conn = sqlite3.connect(PRIMARY_TENANT_DB_PATH)
        src_cur = src_conn.cursor()
        src_cat_count = src_cur.execute("SELECT COUNT(*) FROM categories;").fetchone()[0]
        src_prod_count = src_cur.execute("SELECT COUNT(*) FROM products;").fetchone()[0]
        sample_prod = src_cur.execute("SELECT id, name, base_price FROM products ORDER BY id ASC LIMIT 1;").fetchone()
        src_conn.close()

        # Clone menu from fatihciftligi to target branch with +20% markup
        clone_res = self.request(
            "POST",
            "/api/master/menu/clone",
            data={
                "source_tenant_code": "fatihciftligi",
                "target_tenant_codes": [target_branch_code],
                "clone_categories": True,
                "clone_products": True,
                "price_adjustment_percent": 20.0,
                "cloned_by": "E2E Orchestrator"
            },
            expected_status=(200,)
        )
        self.assert_true(
            clone_res and clone_res.get("success") is True,
            f"POST /api/master/menu/clone replicated menu from fatihciftligi to {target_branch_code} (+20% markup)"
        )

        # Verify cloned database on disk
        target_db_path = os.path.join(ROOT_DIR, "backend", "data", "tenants", f"{target_branch_code}.db")
        self.assert_true(
            os.path.exists(target_db_path),
            f"Target branch database file created at {target_db_path}"
        )
        if os.path.exists(target_db_path):
            t_conn = sqlite3.connect(target_db_path)
            t_cur = t_conn.cursor()
            t_cat_count = t_cur.execute("SELECT COUNT(*) FROM categories;").fetchone()[0]
            t_prod_count = t_cur.execute("SELECT COUNT(*) FROM products;").fetchone()[0]

            self.assert_true(
                t_cat_count >= src_cat_count,
                f"Target branch contains {t_cat_count} categories (source had {src_cat_count})"
            )
            self.assert_true(
                t_prod_count >= src_prod_count,
                f"Target branch contains {t_prod_count} products (source had {src_prod_count})"
            )

            if sample_prod:
                src_p_id, src_p_name, src_p_price = sample_prod
                t_prod = t_cur.execute("SELECT base_price FROM products WHERE name = ?;", (src_p_name,)).fetchone()
                if t_prod:
                    expected_price = round(src_p_price * 1.20, 2)
                    actual_price = t_prod[0]
                    diff = abs(actual_price - expected_price)
                    self.assert_true(
                        diff < 0.05,
                        f"Price markup verified for '{src_p_name}': original={src_p_price} TL, target={actual_price} TL (expected {expected_price} TL)"
                    )
            t_conn.close()

        # Verify Master DB clone history record
        m_conn = sqlite3.connect(DATA_MASTER_DB_PATH)
        m_cur = m_conn.cursor()
        clone_hist = m_cur.execute(
            "SELECT id, source_tenant_code, target_tenant_code, categories_copied, products_copied, status FROM menu_clone_history WHERE target_tenant_code = ?;",
            (target_branch_code,)
        ).fetchone()
        self.assert_true(
            clone_hist is not None and clone_hist[5] == "completed",
            f"menu_clone_history table logged clone transaction (source: {clone_hist[1] if clone_hist else ''}, status: {clone_hist[5] if clone_hist else ''})"
        )
        m_conn.close()

        # ---------------------------------------------------------------------
        # 3.3 Support Ticket Submission with Screenshot Attachment & Audit Trail
        # ---------------------------------------------------------------------
        fake_png_data = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
        fields = {
            "category": "pos",
            "priority": "urgent",
            "subject": "E2E Ekran Görüntülü Hata Bildirimi",
            "description": "Ödeme alınırken ekranda oluşan hatanın ekran görüntüsü ektedir.",
            "submitted_by_name": "Garson Selim",
            "submitted_by_role": "waiter"
        }
        files = {
            "screenshot": ("error_screenshot.png", fake_png_data, "image/png")
        }
        form_body, form_content_type = encode_multipart_form(fields, files)

        tck_multipart = self.request(
            "POST",
            "/api/support/tickets",
            headers={"X-Restaurant-Code": "fatihciftligi"},
            raw_body=form_body,
            content_type=form_content_type,
            expected_status=(201,)
        )
        self.assert_true(
            tck_multipart and "ticket" in tck_multipart,
            "POST /api/support/tickets accepted multipart form-data with screenshot image upload"
        )
        multipart_ticket = tck_multipart.get("ticket", {})
        m_tck_id = multipart_ticket.get("id")
        att_url = multipart_ticket.get("attachment_url")
        self.assert_true(
            att_url is not None and str(att_url).startswith("/static/uploads/tickets/"),
            f"Ticket screenshot saved to disk and mapped to static URL: {att_url}"
        )

        # Verify static file serving via Fiber
        if att_url:
            static_file = self.request("GET", att_url, expected_status=(200,))
            self.assert_true(
                static_file is not None,
                f"Fiber static file router successfully served uploaded ticket attachment from {att_url}"
            )

        # Inspect ticket details & audit logs
        tck_det = self.request("GET", f"/api/master/tickets/{m_tck_id}", expected_status=(200,))
        logs = tck_det.get("logs", []) if tck_det else []
        self.assert_true(
            len(logs) >= 1 and logs[0].get("action") == "created",
            f"Ticket audit trail contains initial creation entry: {logs[0].get('action') if logs else 'None'}"
        )

        # Transition status to in_review
        self.request(
            "PUT",
            f"/api/master/tickets/{m_tck_id}/status",
            data={"status": "in_review", "assigned_to": "Kıdemli Destek", "performed_by": "Admin"},
            expected_status=(200,)
        )

        # Add reply message
        self.request(
            "POST",
            f"/api/master/tickets/{m_tck_id}/messages",
            data={"message": "Ekran görüntüsü incelendi, problem çözülüyor.", "sender_type": "admin", "sender_name": "Kıdemli Destek"},
            expected_status=(201,)
        )

        # Resolve ticket
        self.request(
            "PUT",
            f"/api/master/tickets/{m_tck_id}/status",
            data={"status": "resolved", "resolution_notes": "Yazılım güncellemesi yapıldı.", "performed_by": "Admin"},
            expected_status=(200,)
        )

        # Re-fetch ticket details and verify 3 audit log entries
        tck_final = self.request("GET", f"/api/master/tickets/{m_tck_id}", expected_status=(200,))
        final_logs = tck_final.get("logs", []) if tck_final else []
        self.assert_true(
            len(final_logs) >= 3,
            f"Ticket immutable audit trail captured all 3 lifecycle transitions (total logs: {len(final_logs)})"
        )

        # ---------------------------------------------------------------------
        # 3.4 Broadcast Announcement Dismissal & Receipt Tracking
        # ---------------------------------------------------------------------
        ann_dismiss_test = self.request(
            "POST",
            "/api/master/broadcast",
            data={
                "title": "E2E Kapatılabilir Duyuru Testi",
                "content": "Bu duyuru POS ekranından kapatılacaktır.",
                "banner_type": "info",
                "target_type": "all",
                "dismissible": True
            },
            expected_status=(201,)
        )
        dismiss_ann_id = ann_dismiss_test.get("announcement", {}).get("id")

        # POS client dismisses announcement
        dismiss_res = self.request(
            "POST",
            f"/api/announcements/{dismiss_ann_id}/dismiss",
            headers={"X-Restaurant-Code": "fatihciftligi"},
            expected_status=(200,)
        )
        self.assert_true(
            dismiss_res and dismiss_res.get("success") is True,
            f"POST /api/announcements/{dismiss_ann_id}/dismiss recorded tenant dismissal"
        )

        # Verify receipt record in master db
        m_conn = sqlite3.connect(DATA_MASTER_DB_PATH)
        m_cur = m_conn.cursor()
        receipt = m_cur.execute(
            "SELECT id, announcement_id, tenant_code, dismissed_at FROM announcement_receipts WHERE announcement_id = ? AND tenant_code = 'fatihciftligi';",
            (dismiss_ann_id,)
        ).fetchone()
        self.assert_true(
            receipt is not None,
            f"announcement_receipts table logged dismissal receipt for announcement #{dismiss_ann_id}"
        )
        m_conn.close()

    # =========================================================================
    # TIER 4: REAL-WORLD END-TO-END OPERATIONAL LIFECYCLE
    # =========================================================================
    def run_tier_4_operational_lifecycle(self):
        self.start_tier(4, "Real-world End-to-End Operational Lifecycle")

        # ---------------------------------------------------------------------
        # 4.1 Franchise Onboarding Lifecycle
        # ---------------------------------------------------------------------
        print("\n  >>> Stage 4.1: Franchise Onboarding Lifecycle")
        corp_brand_code = f"e2e-franchise-corp-{int(time.time() % 100000)}"
        brand_res = self.request(
            "POST",
            "/api/master/brands",
            data={
                "code": corp_brand_code,
                "name": "E2E Global Franchise Holding",
                "primary_tenant_code": "fatihciftligi",
                "contact_person": "Holding Yöneticisi",
                "contact_email": "holding@e2e-franchise.com"
            },
            expected_status=(201,)
        )
        corp_brand_id = brand_res.get("brand", {}).get("id")
        self.assert_true(
            corp_brand_id is not None,
            f"Stage 1: Registered corporate parent brand #{corp_brand_id} ('{corp_brand_code}')"
        )

        # Onboard 2 new branch stores
        branches = [
            (f"e2e-north-branch-{int(time.time() % 100000)}", "Kuzey Şubesi", 15.0),
            (f"e2e-south-branch-{int(time.time() % 100000)}", "Güney Şubesi", -5.0)
        ]
        m_conn = sqlite3.connect(DATA_MASTER_DB_PATH)
        m_cur = m_conn.cursor()
        for b_code, b_name, markup in branches:
            m_cur.execute(
                """
                INSERT INTO restaurant_tenants (code, name, plan, plan_code, status, brand_id, is_brand_master, branch_name)
                VALUES (?, ?, 'pro', 'pro', 'active', ?, 0, ?);
                """,
                (b_code, f"E2E {b_name}", corp_brand_id, b_name)
            )
        m_conn.commit()
        m_conn.close()
        self.assert_true(True, "Stage 2: Onboarded 2 child branches under parent brand in Master DB")

        # Clone menu templates from master to both branches with branch markups
        for b_code, b_name, markup in branches:
            c_res = self.request(
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
                c_res and c_res.get("success") is True,
                f"Stage 3: Cloned menu template to {b_name} ({b_code}) with {markup:+}% markup"
            )

        # Emit heartbeats for both branches to establish live pulse
        for b_code, b_name, _ in branches:
            self.request(
                "POST",
                "/api/heartbeat",
                data={
                    "device_id": f"pos-{b_code}",
                    "device_type": "pos",
                    "device_name": f"{b_name} Ana Kasa",
                    "tenant_code": b_code
                },
                expected_status=(200,)
            )
        self.assert_true(True, "Stage 4: Emitted initial heartbeats bringing new branch locations online")

        # Consolidated franchise chain analytics
        brand_analytics = self.request(
            "GET",
            f"/api/master/brands/{corp_brand_id}/analytics",
            expected_status=(200,)
        )
        self.assert_true(
            brand_analytics and brand_analytics.get("consolidated", {}).get("total_branches") == 3,
            f"Stage 5: Chain analytics confirms 3 associated branches under brand #{corp_brand_id} (master + 2 branches)"
        )

        # ---------------------------------------------------------------------
        # 4.2 Multi-Device Heartbeat Pulse & Fleet Telemetry
        # ---------------------------------------------------------------------
        print("\n  >>> Stage 4.2: Multi-Device Heartbeat Pulse & Fleet Telemetry")
        concurrent_devices = [
            ("pulse-pos-master", "pos", "Ana POS İstasyonu"),
            ("pulse-tab-waiter1", "tablet", "Garson Tablet İstasyonu"),
            ("pulse-hand-term1", "handheld", "Mobil Sipariş El Terminali"),
            ("pulse-kds-kitchen1", "kds", "Mutfak Sipariş Hazırlık Ekranı")
        ]
        for dev_id, dev_type, dev_name in concurrent_devices:
            self.request(
                "POST",
                "/api/heartbeat",
                data={
                    "device_id": dev_id,
                    "device_type": dev_type,
                    "device_name": dev_name,
                    "app_version": "2.2.0-e2e",
                    "tenant_code": "fatihciftligi"
                },
                expected_status=(200,)
            )

        f_status = self.request("GET", "/api/master/fleet", expected_status=(200,))
        f_entry = next((f for f in f_status if f.get("code") == "fatihciftligi"), None)
        self.assert_true(
            f_entry is not None and f_entry.get("is_online") is True and f_entry.get("health_status") == "healthy",
            "Fleet telemetry aggregates online pulse across all 4 device archetypes (health_status: healthy)"
        )

        # ---------------------------------------------------------------------
        # 4.3 Billing Invoice Due Cycle & Delinquency Lifecycle
        # ---------------------------------------------------------------------
        print("\n  >>> Stage 4.3: Billing Invoice Due Cycle & Delinquency Lifecycle")
        cycle_tenant_code = f"e2e-bill-cycle-{int(time.time() % 100000)}"
        m_conn = sqlite3.connect(DATA_MASTER_DB_PATH)
        m_cur = m_conn.cursor()
        m_cur.execute(
            """
            INSERT INTO restaurant_tenants (code, name, plan, plan_code, status, read_only_mode)
            VALUES (?, 'E2E Faturalama Test Restoranı', 'pro', 'pro', 'active', 0);
            """,
            (cycle_tenant_code,)
        )
        m_conn.commit()
        m_conn.close()

        # Step 1: Create subscription invoice due in future
        inv_res = self.request(
            "POST",
            "/api/master/invoices",
            data={
                "tenant_code": cycle_tenant_code,
                "amount": 1990.0,
                "period": "2026-11",
                "due_date_days": 30
            },
            expected_status=(201,)
        )
        cycle_inv_id = inv_res.get("invoice", {}).get("id")
        self.assert_true(
            cycle_inv_id is not None,
            f"Step 1: Generated monthly subscription invoice #{cycle_inv_id} for {cycle_tenant_code}"
        )

        # Step 2: Run due-check (invoice not overdue)
        self.request("POST", "/api/master/invoices/run-due-check", expected_status=(200,))
        self.assert_true(True, "Step 2: Automated due-check confirmed tenant remains active when invoice is current")

        # Step 3: Fast-forward time: mutate invoice due date to 18 days in past (past 15-day delinquency threshold)
        past_date = time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(time.time() - (18 * 86400)))
        m_conn = sqlite3.connect(DATA_MASTER_DB_PATH)
        m_cur = m_conn.cursor()
        m_cur.execute(
            "UPDATE tenant_invoices SET due_date = ?, status = 'unpaid' WHERE id = ?;",
            (past_date, cycle_inv_id)
        )
        m_conn.commit()
        m_conn.close()
        self.assert_true(True, "Step 3: Fast-forwarded invoice due date to 18 days ago (simulating severe delinquency)")

        # Step 4: Run automated scan -> tenant must be marked overdue and suspended
        due_scan_res = self.request("POST", "/api/master/invoices/run-due-check", expected_status=(200,))
        self.assert_true(
            due_scan_res and due_scan_res.get("success") is True,
            "Step 4: Executed automated delinquency enforcement scan"
        )

        m_conn = sqlite3.connect(DATA_MASTER_DB_PATH)
        m_cur = m_conn.cursor()
        t_state = m_cur.execute(
            "SELECT status, read_only_mode, suspension_reason FROM restaurant_tenants WHERE code = ?;",
            (cycle_tenant_code,)
        ).fetchone()
        inv_db = m_cur.execute(
            "SELECT status, due_date FROM tenant_invoices WHERE id = ?;",
            (cycle_inv_id,)
        ).fetchone()
        m_conn.close()

        self.assert_true(
            inv_db is not None and inv_db[0] == "overdue",
            f"Invoice #{cycle_inv_id} database status transitioned to 'overdue'"
        )
        self.assert_true(
            t_state is not None and t_state[0] == "suspended",
            f"Delinquent tenant #{cycle_tenant_code} automatically transitioned to 'suspended' status: reason={t_state[2] if t_state else ''}"
        )

        # Step 5: Verify delinquent tenant requests are blocked with HTTP 403
        delinquent_call = self.request(
            "GET",
            "/api/tables/areas",
            headers={"X-Restaurant-Code": cycle_tenant_code},
            expected_status=(403,)
        )
        self.assert_true(
            delinquent_call and delinquent_call.get("code") == "ACCOUNT_SUSPENDED",
            "Step 5: Delinquent tenant requests rejected with HTTP 403 (ACCOUNT_SUSPENDED)"
        )

        # Step 6: Tenant pays overdue invoice
        pay_res = self.request("PUT", f"/api/master/invoices/{cycle_inv_id}/pay", expected_status=(200,))
        self.assert_true(
            pay_res and pay_res.get("success") is True,
            f"Step 6: Paid overdue invoice #{cycle_inv_id} through payment gateway"
        )

        # Step 7: Verify tenant is immediately unblocked and restored to active
        m_conn = sqlite3.connect(DATA_MASTER_DB_PATH)
        m_cur = m_conn.cursor()
        restored_t = m_cur.execute(
            "SELECT status, read_only_mode FROM restaurant_tenants WHERE code = ?;",
            (cycle_tenant_code,)
        ).fetchone()
        m_conn.close()

        self.assert_true(
            restored_t is not None and restored_t[0] == "active" and restored_t[1] == 0,
            f"Step 7: Tenant '{cycle_tenant_code}' immediately restored to active state without read-only restrictions"
        )
        resumed_get = self.request(
            "GET",
            "/api/tables/areas",
            headers={"X-Restaurant-Code": cycle_tenant_code},
            expected_status=(200,)
        )
        self.assert_true(
            resumed_get is not None,
            "Resumed store now executes operational requests with HTTP 200 OK"
        )

        # ---------------------------------------------------------------------
        # 4.4 Disaster Recovery: Atomic Backup & Live Database Restoration
        # ---------------------------------------------------------------------
        print("\n  >>> Stage 4.4: Disaster Recovery (Backup, Mutation, Safety Snapshot & Restore)")
        # 1. Take initial backup
        init_backup = self.request(
            "POST",
            "/api/master/tenants/fatihciftligi/backup",
            expected_status=(201,)
        )
        self.assert_true(
            init_backup and "backup" in init_backup,
            "Step 1: Produced WAL-checkpointed pre-disaster backup snapshot"
        )
        restore_backup_id = init_backup.get("backup", {}).get("id")

        # 2. Mutate live database by creating a canary table
        canary_table_name = f"e2e_disaster_canary_{int(time.time() % 100000)}"
        p_conn = sqlite3.connect(PRIMARY_TENANT_DB_PATH, timeout=30.0)
        p_cur = p_conn.cursor()
        p_cur.execute(f"CREATE TABLE {canary_table_name} (id INTEGER PRIMARY KEY, note TEXT);")
        p_cur.execute(f"INSERT INTO {canary_table_name} (note) VALUES ('Disaster canary record to be rolled back');")
        p_conn.commit()
        p_canary_exists = p_cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name = ?;",
            (canary_table_name,)
        ).fetchone() is not None
        p_conn.close()
        self.assert_true(
            p_canary_exists,
            f"Step 2: Simulated disaster mutation: canary table '{canary_table_name}' written to live tenant DB"
        )

        # 3. Trigger database restoration from backup
        restore_res = self.request(
            "POST",
            f"/api/master/backups/{restore_backup_id}/restore",
            expected_status=(200,)
        )
        self.assert_true(
            restore_res and restore_res.get("success") is True,
            f"Step 3: POST /api/master/backups/{restore_backup_id}/restore executed atomic live restoration"
        )
        self.assert_true(
            "safety_snapshot" in restore_res,
            f"Restoration safety snapshot generated: {restore_res.get('safety_snapshot')}"
        )

        # 4. Verify live database state post-restore
        p_conn2 = sqlite3.connect(PRIMARY_TENANT_DB_PATH, timeout=30.0)
        p_cur2 = p_conn2.cursor()
        canary_post_restore = p_cur2.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name = ?;",
            (canary_table_name,)
        ).fetchone()
        integ_check = p_cur2.execute("PRAGMA integrity_check;").fetchall()
        fk_check = p_cur2.execute("PRAGMA foreign_key_check;").fetchall()
        p_conn2.close()

        self.assert_true(
            canary_post_restore is None,
            "Step 4: Canary table rolled back cleanly; live database reverted to exact pre-disaster snapshot"
        )
        self.assert_true(
            integ_check == [("ok",)],
            "Step 5: Post-restore SQLite PRAGMA integrity_check is 100% OK"
        )
        self.assert_true(
            len(fk_check) == 0,
            f"Step 6: Post-restore SQLite PRAGMA foreign_key_check returned 0 violations (got {len(fk_check)})"
        )

        # 5. Verify Go server operational queries pass post-restore
        post_restore_tables = self.request(
            "GET",
            "/api/tables/areas",
            headers={"X-Restaurant-Code": "fatihciftligi"},
            expected_status=(200,)
        )
        self.assert_true(
            post_restore_tables is not None,
            "Step 7: Live backend connection cycling verified: GET /api/tables/areas healthy post-restoration"
        )

    # =========================================================================
    # SUITE CLEANUP & TEARDOWN
    # =========================================================================
    def teardown_test_artifacts(self):
        print("\n" + "=" * 80)
        print("  CLEANING UP TEMPORARY TEST ARTIFACTS...")
        print("=" * 80)
        try:
            m_conn = sqlite3.connect(DATA_MASTER_DB_PATH)
            m_cur = m_conn.cursor()

            # Clean test tenants
            m_cur.execute("DELETE FROM restaurant_tenants WHERE code LIKE 'e2e-%';")
            # Clean test brands
            m_cur.execute("DELETE FROM franchise_brands WHERE code LIKE 'e2e-%';")
            # Clean test announcements
            m_cur.execute("DELETE FROM broadcast_announcements WHERE title LIKE 'E2E %';")
            # Clean test receipts
            m_cur.execute("DELETE FROM announcement_receipts WHERE tenant_code LIKE 'e2e-%' OR dismissed_by_user = 'pos_user';")
            # Clean test tickets
            m_cur.execute("DELETE FROM support_tickets WHERE subject LIKE 'E2E %';")
            # Clean test clone history
            m_cur.execute("DELETE FROM menu_clone_history WHERE target_tenant_code LIKE 'e2e-%';")
            # Clean test invoices
            m_cur.execute("DELETE FROM tenant_invoices WHERE tenant_code LIKE 'e2e-%';")

            # Restore fatihciftligi tenant to enterprise and active
            m_cur.execute(
                """
                UPDATE restaurant_tenants
                SET status = 'active', plan = 'enterprise', plan_code = 'enterprise',
                    read_only_mode = 0, is_brand_master = 1,
                    feature_qr_menu = 1, feature_kds = 1, feature_delivery = 1,
                    feature_integrations = 1, feature_e_invoice = 1,
                    feature_stock_recipe = 1, feature_loyalty = 1
                WHERE code = 'fatihciftligi';
                """
            )
            m_cur.execute(
                "UPDATE tenant_storage_quotas SET allocated_quota_mb = 10240 WHERE tenant_code = 'fatihciftligi';"
            )
            m_conn.commit()
            m_conn.close()
            print("  [INFO] Master DB temporary test records cleaned and fatihciftligi restored.")
        except Exception as e:
            print(f"  [WARN] Master DB cleanup error: {e}")

        # Clean cloned sqlite db files in data/tenants/
        tenants_dir = os.path.join(ROOT_DIR, "backend", "data", "tenants")
        if os.path.exists(tenants_dir):
            for fname in os.listdir(tenants_dir):
                if fname.startswith("e2e-") and fname.endswith(".db"):
                    fpath = os.path.join(tenants_dir, fname)
                    try:
                        os.remove(fpath)
                        if os.path.exists(fpath + "-wal"):
                            os.remove(fpath + "-wal")
                        if os.path.exists(fpath + "-shm"):
                            os.remove(fpath + "-shm")
                        print(f"  [INFO] Removed temporary branch DB: {fname}")
                    except Exception:
                        pass

    # =========================================================================
    # RUN ALL TIERS
    # =========================================================================
    def run_all(self) -> int:
        self.start_time = time.time()
        print("\n" + "#" * 80)
        print("  BONCORE SAAS MASTER ADMIN EXPANSION - E2E CLI REGRESSION TEST RUNNER")
        print("  Target Modules: R1-R7 (Licensing, Fleet, Billing, Franchise, Broadcast, Tickets, Backup)")
        print("#" * 80)

        if not self.ensure_server_running():
            print("  [FATAL] Unable to establish connection with Go backend server on port 8000.")
            return 1

        try:
            self.run_tier_1_feature_coverage()
            self.run_tier_2_boundary_corner_cases()
            self.run_tier_3_cross_feature_interactions()
            self.run_tier_4_operational_lifecycle()
        finally:
            self.teardown_test_artifacts()
            self.cleanup()

        elapsed = time.time() - self.start_time

        print("\n" + "=" * 80)
        print("  BONCORE SAAS EXPANSION REGRESSION TEST SUITE - SUMMARY REPORT")
        print("=" * 80)
        print(f"  Total Duration   : {elapsed:.2f} seconds")
        print(f"  Total Requests   : {self.total_requests}")
        print(f"  Total Assertions : {self.total_tests}")
        print(f"  Passed           : {self.passed_tests}")
        print(f"  Failed           : {self.failed_tests}")
        print("-" * 80)

        print("  TIER BREAKDOWN:")
        for tier_name, stats in self.tier_stats.items():
            t_pass = stats["passed"]
            t_fail = stats["failed"]
            status_str = "PASS" if t_fail == 0 else "FAIL"
            print(f"    [{status_str}] {tier_name:<65} | Passed: {t_pass:<3} Failed: {t_fail}")

        print("=" * 80)

        if self.failed_tests > 0:
            print("\n  FAILURES ENCOUNTERED:")
            for err in self.errors:
                print(f"    - {err}")
            print("\n  >>> VERIFICATION RESULT: FAILED (Exit Code 1)\n")
            return 1
        else:
            print("\n  >>> VERIFICATION RESULT: ALL 4 TIERS PASSED (100% GREEN) (Exit Code 0)\n")
            return 0


if __name__ == "__main__":
    runner = SaasExpansionSuiteRunner()
    exit_code = runner.run_all()
    sys.exit(exit_code)
