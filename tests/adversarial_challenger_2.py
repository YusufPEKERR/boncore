#!/usr/bin/env python3
"""
BonCore SaaS Expansion - Adversarial Security & Lifecycle Challenger Suite
==========================================================================
Challenger 2 Empirical Verification:
- Challenge 1: Multi-Tenant Data Leakage (Tickets, Backups, Operational DBs)
- Challenge 2: Masked Gateway Secrets Invariant (PayTR, iyzico, Short Secrets, Idempotency)
- Challenge 3: Module Licensing Circumvention (QR, KDS, Inventory, Delivery, Fiscal under Starter)
- Challenge 4: Announcement Fanout Filtering (Targeted Isolation & Substring Matching)
- Challenge 5: Delinquency & Lifecycle Invariants (Suspension vs Read-Only Boundaries)
"""

import os
import sys
import json
import time
import sqlite3
import urllib.request
import urllib.parse
import urllib.error
from typing import Any, Dict, List, Optional, Tuple

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE_URL = "http://127.0.0.1:8000"
MASTER_DB_PATH = os.path.join(ROOT_DIR, "backend", "data", "master.db")
SYNC_MASTER_DB_PATH = os.path.join(ROOT_DIR, "backend", "master.db")


class Challenger2Runner:
    def __init__(self):
        self.total = 0
        self.passed = 0
        self.failed = 0
        self.bugs_found: List[Dict[str, str]] = []
        self.section_name = ""

    def section(self, name: str):
        self.section_name = name
        print("\n" + "=" * 80)
        print(f"  [ADVERSARIAL SUITE] {name.upper()}")
        print("=" * 80)

    def assert_test(self, condition: bool, test_name: str, detail: str = "") -> bool:
        self.total += 1
        if condition:
            self.passed += 1
            print(f"  [PASS] {test_name}")
            return True
        else:
            self.failed += 1
            msg = f"[{self.section_name}] FAIL: {test_name} - {detail}"
            print(f"  [FAIL] {test_name} - {detail}")
            return False

    def record_bug(self, bug_id: str, title: str, description: str, reproduction: str):
        print(f"  [EMPIRICAL BUG FOUND] {bug_id}: {title}")
        print(f"    Reproduction: {reproduction}")
        self.bugs_found.append({
            "id": bug_id,
            "section": self.section_name,
            "title": title,
            "description": description,
            "reproduction": reproduction
        })

    def request(
        self,
        method: str,
        path: str,
        data: Optional[Any] = None,
        headers: Optional[Dict[str, str]] = None,
        timeout: float = 10.0,
    ) -> Tuple[int, Any, str]:
        """Returns (status_code, parsed_json_or_body, raw_body_text)."""
        url = f"{BASE_URL}{path}"
        req_headers = {"User-Agent": "BonCore-Challenger-2"}
        if data is not None and not isinstance(data, (bytes, bytearray)):
            req_headers["Content-Type"] = "application/json"
            body_bytes = json.dumps(data).encode("utf-8")
        elif isinstance(data, (bytes, bytearray)):
            body_bytes = data
        else:
            body_bytes = None

        if headers:
            req_headers.update(headers)

        req = urllib.request.Request(url, data=body_bytes, headers=req_headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                status = resp.status
                body = resp.read()
                raw_text = body.decode("utf-8", errors="replace")
                try:
                    parsed = json.loads(raw_text)
                except Exception:
                    parsed = raw_text
                return status, parsed, raw_text
        except urllib.error.HTTPError as e:
            body = e.read()
            raw_text = body.decode("utf-8", errors="replace")
            try:
                parsed = json.loads(raw_text)
            except Exception:
                parsed = raw_text
            return e.code, parsed, raw_text
        except Exception as e:
            return 0, None, str(e)


def sync_master_db():
    if os.path.exists(MASTER_DB_PATH):
        try:
            import shutil
            shutil.copy2(MASTER_DB_PATH, SYNC_MASTER_DB_PATH)
        except Exception:
            pass


def get_master_db_conn():
    conn = sqlite3.connect(MASTER_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def run_all_challenges():
    runner = Challenger2Runner()
    print("=" * 80)
    print("  BONCORE SAAS EXPANSION - CHALLENGER 2 ADVERSARIAL VERIFICATION SUITE")
    print("=" * 80)

    # 0. Health Verification
    status, _, _ = runner.request("GET", "/health")
    if status != 200:
        print(f"[FATAL] Backend server is not running on port 8000 (status: {status}). Aborting.")
        sys.exit(1)
    print("  [INIT] Server is healthy on port 8000.")

    # -------------------------------------------------------------------------
    # CHALLENGE 1: MULTI-TENANT DATA LEAKAGE & ISOLATION
    # -------------------------------------------------------------------------
    runner.section("Challenge 1: Multi-Tenant Data Leakage & Isolation")

    # Seed isolated tenants in master DB
    conn = get_master_db_conn()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT OR REPLACE INTO restaurant_tenants (id, code, name, plan_code, plan, status, feature_qr_menu, feature_kds, feature_delivery, feature_integrations, feature_e_invoice, feature_stock_recipe, feature_loyalty)
        VALUES (9901, 'tenant_leak_a', 'Tenant A (Secret Store)', 'enterprise', 'enterprise', 'active', 1, 1, 1, 1, 1, 1, 1)
        """
    )
    cur.execute(
        """
        INSERT OR REPLACE INTO restaurant_tenants (id, code, name, plan_code, plan, status, feature_qr_menu, feature_kds, feature_delivery, feature_integrations, feature_e_invoice, feature_stock_recipe, feature_loyalty)
        VALUES (9902, 'tenant_leak_b', 'Tenant B (Inquisitive Store)', 'starter', 'starter', 'active', 0, 0, 0, 0, 0, 0, 0)
        """
    )
    conn.commit()
    conn.close()
    sync_master_db()

    # 1.1 Support Ticket Leakage (POS isolation)
    secret_marker_a = f"SECRET-A-CONFIDENTIAL-{int(time.time())}"
    s, data_a, raw_a = runner.request(
        "POST",
        "/api/support/tickets",
        data={
            "subject": "Confidential Request from Tenant A",
            "description": f"Internal private details: {secret_marker_a}",
            "category": "billing",
            "priority": "high",
        },
        headers={"X-Restaurant-Code": "tenant_leak_a"},
    )
    runner.assert_test(s == 201, "Tenant A submitted confidential support ticket", raw_a[:100])

    # Sleep 1.1s to allow timestamp tick for distinct second
    time.sleep(1.1)

    secret_marker_b = f"SECRET-B-CONFIDENTIAL-{int(time.time())}"
    s, data_b, raw_b = runner.request(
        "POST",
        "/api/support/tickets",
        data={
            "subject": "Confidential Request from Tenant B",
            "description": f"Internal private details: {secret_marker_b}",
            "category": "pos_error",
            "priority": "normal",
        },
        headers={"X-Restaurant-Code": "tenant_leak_b"},
    )
    runner.assert_test(s == 201, "Tenant B submitted confidential support ticket", raw_b[:100])

    # Isolation Test: Tenant A queries /api/support/tickets
    s, _, raw_tickets_a = runner.request(
        "GET",
        "/api/support/tickets",
        headers={"X-Restaurant-Code": "tenant_leak_a"},
    )
    runner.assert_test(s == 200, "Tenant A queried /api/support/tickets")
    runner.assert_test(secret_marker_a in raw_tickets_a, "Tenant A response contains Tenant A ticket")
    runner.assert_test(secret_marker_b not in raw_tickets_a, "Tenant A CANNOT see Tenant B ticket (Zero Leakage)")

    # Isolation Test: Tenant B queries /api/support/tickets
    s, _, raw_tickets_b = runner.request(
        "GET",
        "/api/support/tickets",
        headers={"X-Restaurant-Code": "tenant_leak_b"},
    )
    runner.assert_test(s == 200, "Tenant B queried /api/support/tickets")
    runner.assert_test(secret_marker_b in raw_tickets_b, "Tenant B response contains Tenant B ticket")
    runner.assert_test(secret_marker_a not in raw_tickets_b, "Tenant B CANNOT see Tenant A ticket (Zero Leakage)")

    # 1.2 EMPIRICAL BUG TEST: Ticket Number Generator Same-Second Collision Bug
    # Sleep to start at a clean second boundary, then fire two consecutive tickets within the same wall-clock second
    time.sleep(1.1)
    s_col_1, _, raw_col_1 = runner.request(
        "POST",
        "/api/support/tickets",
        data={"subject": "Collision Ticket 1", "description": "Rapid ping 1"},
        headers={"X-Restaurant-Code": "fatihciftligi"},
    )
    s_col_2, _, raw_col_2 = runner.request(
        "POST",
        "/api/support/tickets",
        data={"subject": "Collision Ticket 2", "description": "Rapid ping 2"},
        headers={"X-Restaurant-Code": "fatihciftligi"},
    )
    if s_col_1 == 201 and s_col_2 == 500 and "UNIQUE constraint failed" in raw_col_2:
        runner.record_bug(
            bug_id="BUG-CH2-001",
            title="Ticket Number Generation Epoch Seconds Collision triggers HTTP 500",
            description="handlers_saas_support.go:107 uses `randNum := time.Now().Unix()%9000 + 1000`, which is purely based on wall-clock seconds. Any two tickets submitted in the same second across the entire SaaS platform collide on ticket_number UNIQUE constraint, causing HTTP 500.",
            reproduction="Execute two consecutive POST /api/support/tickets requests within the same wall-clock second."
        )
    else:
        runner.assert_test(s_col_1 == 201 and s_col_2 == 201, "Rapid consecutive ticket submissions handled without collision")

    # 1.3 Private Operational Records Isolation (Tenant DB level)
    # Check that fatihciftligi tables are isolated from moda-meyhane
    s_fatih, data_fatih, _ = runner.request("GET", "/api/tables/areas", headers={"X-Restaurant-Code": "fatihciftligi"})
    s_moda, data_moda, _ = runner.request("GET", "/api/tables/areas", headers={"X-Restaurant-Code": "moda-meyhane"})
    runner.assert_test(s_fatih == 200 and s_moda == 200, "Both tenant table areas endpoints respond HTTP 200")

    # Cross-tenant order tampering: attempt to modify fatihciftligi's order from moda-meyhane
    s_tamper, _, raw_tamper = runner.request(
        "PUT",
        "/api/orders/99999/status",
        data={"status": "cancelled", "cancel_reason": "Malicious cross-tenant tamper"},
        headers={"X-Restaurant-Code": "moda-meyhane"},
    )
    runner.assert_test(s_tamper == 404, "Cross-tenant order tampering rejected with HTTP 404 (DB isolation preserved)")

    # 1.4 Backup Isolation & EMPIRICAL BUG TEST: Missing RBAC on Master Admin Routes
    s_bk, bk_data, raw_bk = runner.request("POST", "/api/master/tenants/fatihciftligi/backup")
    runner.assert_test(s_bk == 201, "Generated WAL backup for fatihciftligi", raw_bk[:100])
    backup_id = bk_data.get("backup", {}).get("id") if isinstance(bk_data, dict) else None

    if backup_id:
        # Test whether an unauthenticated or non-admin caller can download Tenant A's backup
        s_unauth_dl, _, raw_unauth = runner.request(
            "GET",
            f"/api/master/backups/{backup_id}/download",
            headers={"X-Restaurant-Code": "moda-meyhane"}  # Tenant B trying to download Tenant A backup
        )
        if s_unauth_dl == 200:
            runner.record_bug(
                bug_id="BUG-CH2-002",
                title="Master Admin Backup & Settings Routes Missing RBAC Authentication (requireMasterAdmin returns nil)",
                description="handlers_ops_admin.go:2932 defines requireMasterAdmin() returning nil unconditionally for backwards compatibility. Consequently, any caller or POS client can download database backup archives of other tenants (/api/master/backups/:id/download).",
                reproduction=f"Call GET /api/master/backups/{backup_id}/download without master_admin Authorization token."
            )
        else:
            runner.assert_test(s_unauth_dl in (401, 403), "Unauthorized tenant cannot download master backup archive")

    # -------------------------------------------------------------------------
    # CHALLENGE 2: MASKED GATEWAY SECRETS INVARIANT
    # -------------------------------------------------------------------------
    runner.section("Challenge 2: Masked Gateway Secrets Invariant")

    raw_paytr_secret = "PAYTR_SUPER_CONFIDENTIAL_SECRET_KEY_99999"
    raw_paytr_salt = "PAYTR_SUPER_CONFIDENTIAL_SALT_VALUE_88888"
    raw_iyzico_secret = "IYZICO_ULTRA_SECRET_TOKEN_XYZ_77777"
    raw_iyzico_salt = "IYZICO_ULTRA_SALT_TOKEN_UVW_66666"

    # Seed secrets into PayTR
    s, _, raw = runner.request(
        "PUT",
        "/api/master/billing/gateway-settings",
        data={
            "gateway_provider": "paytr",
            "is_production": False,
            "merchant_id": "test_merchant_paytr_123",
            "api_key": "test_api_key_paytr_abc",
            "api_secret": raw_paytr_secret,
            "merchant_salt": raw_paytr_salt,
            "is_active": True,
        },
    )
    runner.assert_test(s == 200, "Updated PayTR credentials with raw sensitive secrets", raw[:100])

    # Seed secrets into iyzico
    s, _, raw = runner.request(
        "PUT",
        "/api/master/billing/gateway-settings",
        data={
            "gateway_provider": "iyzico",
            "is_production": False,
            "merchant_id": "test_merchant_iyzico_456",
            "api_key": "test_api_key_iyzico_def",
            "api_secret": raw_iyzico_secret,
            "merchant_salt": raw_iyzico_salt,
            "is_active": True,
        },
    )
    runner.assert_test(s == 200, "Updated iyzico credentials with raw sensitive secrets", raw[:100])

    # Invariant Verification: GET /api/master/billing/gateway-settings
    s, settings_data, raw_resp = runner.request("GET", "/api/master/billing/gateway-settings")
    runner.assert_test(s == 200, "Retrieved gateway settings from /api/master/billing/gateway-settings")

    # Verbatim Plaintext Leak Invariant: Search raw HTTP response body
    runner.assert_test(raw_paytr_secret not in raw_resp, "Raw PayTR API Secret is NOT revealed anywhere in response plaintext")
    runner.assert_test(raw_paytr_salt not in raw_resp, "Raw PayTR Merchant Salt is NOT revealed anywhere in response plaintext")
    runner.assert_test(raw_iyzico_secret not in raw_resp, "Raw iyzico API Secret is NOT revealed anywhere in response plaintext")
    runner.assert_test(raw_iyzico_salt not in raw_resp, "Raw iyzico Merchant Salt is NOT revealed anywhere in response plaintext")

    # Validate asterisk masking format and boolean indicators
    if isinstance(settings_data, list):
        for g in settings_data:
            prov = g.get("gateway_provider")
            sec = g.get("api_secret", "")
            slt = g.get("merchant_salt", "")
            sec_set = g.get("api_secret_set")
            slt_set = g.get("merchant_salt_set")

            runner.assert_test(
                sec_set is True and "***" in sec,
                f"[{prov}] api_secret is masked with asterisks (val='{sec}', set={sec_set})"
            )
            runner.assert_test(
                slt_set is True and "***" in slt,
                f"[{prov}] merchant_salt is masked with asterisks (val='{slt}', set={slt_set})"
            )

    # Edge Case: Short secrets (len <= 4)
    s, _, _ = runner.request(
        "PUT",
        "/api/master/billing/gateway-settings",
        data={"gateway_provider": "paytr", "api_secret": "1234", "merchant_salt": "AB"},
    )
    s, short_data, raw_short = runner.request("GET", "/api/master/billing/gateway-settings")
    runner.assert_test("1234" not in raw_short, "Short secret (4 chars) is NOT leaked in plaintext")
    runner.assert_test(
        any(g.get("api_secret") == "****" for g in short_data if g.get("gateway_provider") == "paytr"),
        "Short secret (4 chars) masked completely as '****'"
    )

    # Invariant: Mask idempotency (sending masked string back does NOT overwrite DB raw secret)
    runner.request(
        "PUT",
        "/api/master/billing/gateway-settings",
        data={"gateway_provider": "paytr", "api_secret": raw_paytr_secret, "merchant_salt": raw_paytr_salt},
    )
    runner.request(
        "PUT",
        "/api/master/billing/gateway-settings",
        data={"gateway_provider": "paytr", "api_secret": "PA*************************************99", "notes": "Form save with masked secret"},
    )
    conn = get_master_db_conn()
    cur = conn.cursor()
    cur.execute("SELECT api_secret FROM vpos_configs WHERE gateway_provider = 'paytr'")
    db_secret = cur.fetchone()[0]
    conn.close()
    runner.assert_test(
        db_secret == raw_paytr_secret,
        "Mask idempotency invariant verified: DB preserves raw secret when client submits masked string"
    )

    # -------------------------------------------------------------------------
    # CHALLENGE 3: MODULE LICENSING CIRCUMVENTION
    # -------------------------------------------------------------------------
    runner.section("Challenge 3: Module Licensing Circumvention")

    starter_code = "adv_starter_gated"
    conn = get_master_db_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM restaurant_tenants WHERE code = ?", (starter_code,))
    cur.execute(
        """
        INSERT INTO restaurant_tenants (
            code, name, plan_code, plan, status,
            feature_qr_menu, feature_kds, feature_delivery, feature_integrations,
            feature_e_invoice, feature_stock_recipe, feature_loyalty
        ) VALUES (
            ?, 'Adversarial Starter Strict', 'starter', 'starter', 'active',
            0, 0, 0, 0,
            0, 0, 0
        )
        """,
        (starter_code,)
    )
    conn.commit()
    conn.close()
    sync_master_db()

    target_routes = [
        ("QR Menu", "GET", "/api/qr/table/1/menu", "qr_menu"),
        ("KDS Kitchen", "GET", "/api/kds/orders", "kds"),
        ("Inventory", "GET", "/api/inventory/ingredients", "inventory"),
        ("Delivery", "GET", "/api/delivery/couriers", "delivery"),
        ("Fiscal/E-Adisyon", "GET", "/api/fiscal/e-adisyon/1", "fiscal"),
    ]

    for mod_name, meth, route, feat_key in target_routes:
        status, resp_data, raw_txt = runner.request(
            meth,
            route,
            headers={"X-Restaurant-Code": starter_code},
        )
        is_403 = (status == 403)
        has_code = isinstance(resp_data, dict) and resp_data.get("code") == "FEATURE_DISABLED"
        runner.assert_test(
            is_403 and has_code,
            f"Direct access to {mod_name} ({meth} {route}) strictly rejected with HTTP 403 FEATURE_DISABLED",
            f"Got HTTP {status}, body={raw_txt[:120]}"
        )

    # Circumvention Vector A: Query Parameter Tampering
    s, data, _ = runner.request(
        "GET",
        "/api/kds/orders?plan=enterprise&feature=kds&admin=1&bypass=true",
        headers={"X-Restaurant-Code": starter_code},
    )
    runner.assert_test(
        s == 403 and isinstance(data, dict) and data.get("code") == "FEATURE_DISABLED",
        "Circumvention Vector A: Query param tampering (?plan=enterprise&bypass=true) blocked with 403"
    )

    # Circumvention Vector B: Alternative HTTP Method Probing
    s, data, _ = runner.request(
        "POST",
        "/api/kds/orders",
        data={"station": "all"},
        headers={"X-Restaurant-Code": starter_code},
    )
    runner.assert_test(
        s == 403 and isinstance(data, dict) and data.get("code") == "FEATURE_DISABLED",
        "Circumvention Vector B: Alternative HTTP method (POST /api/kds/orders) blocked with 403"
    )

    # Circumvention Vector C: Nested Sub-Route Probing
    nested_routes = [
        ("GET", "/api/inventory/warehouses"),
        ("GET", "/api/delivery/couriers"),
        ("GET", "/api/fiscal/e-adisyon/1/xml"),
    ]
    for meth, n_route in nested_routes:
        s, data, _ = runner.request(meth, n_route, headers={"X-Restaurant-Code": starter_code})
        runner.assert_test(
            s == 403 and isinstance(data, dict) and data.get("code") == "FEATURE_DISABLED",
            f"Circumvention Vector C: Nested sub-route {n_route} blocked with 403 FEATURE_DISABLED"
        )

    # Selective Activation Invariant: Enable ONLY feature_kds = 1, assert other 4 remain 403
    conn = get_master_db_conn()
    cur = conn.cursor()
    cur.execute("UPDATE restaurant_tenants SET feature_kds = 1 WHERE code = ?", (starter_code,))
    conn.commit()
    conn.close()
    sync_master_db()

    s_kds, _, _ = runner.request("GET", "/api/kds/orders", headers={"X-Restaurant-Code": starter_code})
    runner.assert_test(
        s_kds != 403 or (isinstance(_, dict) and _.get("code") != "FEATURE_DISABLED"),
        f"Selectively enabled module (KDS) is accessible (HTTP {s_kds})"
    )

    for mod_name, meth, route, feat_key in target_routes:
        if feat_key == "kds":
            continue
        status, resp_data, _ = runner.request(meth, route, headers={"X-Restaurant-Code": starter_code})
        runner.assert_test(
            status == 403 and isinstance(resp_data, dict) and resp_data.get("code") == "FEATURE_DISABLED",
            f"Non-enabled module {mod_name} strictly remains 403 FEATURE_DISABLED after selective KDS enablement"
        )

    # -------------------------------------------------------------------------
    # CHALLENGE 4: ANNOUNCEMENT FANOUT FILTERING
    # -------------------------------------------------------------------------
    runner.section("Challenge 4: Announcement Fanout Filtering")

    tenant_alpha = "adv_announcement_target_alpha"
    tenant_beta = "adv_announcement_nontarget_beta"
    tenant_gamma = "adv_announcement_nontarget_gamma"

    conn = get_master_db_conn()
    cur = conn.cursor()
    for code, name in [(tenant_alpha, "Alpha Store"), (tenant_beta, "Beta Store"), (tenant_gamma, "Gamma Store")]:
        cur.execute(
            """
            INSERT OR REPLACE INTO restaurant_tenants (code, name, plan_code, plan, status)
            VALUES (?, ?, 'pro', 'pro', 'active')
            """,
            (code, name)
        )
    conn.commit()
    conn.close()
    sync_master_db()

    target_announcement_title = f"TARGETED-NOTICE-ALPHA-ONLY-{int(time.time())}"
    s, _, raw_ann = runner.request(
        "POST",
        "/api/master/broadcast",
        data={
            "title": target_announcement_title,
            "content": "Confidential advisory intended exclusively for Alpha Store.",
            "banner_type": "warning",
            "target_type": "specific_tenants",
            "target_tenant_ids": json.dumps([tenant_alpha]),
            "show_as_popup": True,
            "dismissible": True,
        },
    )
    runner.assert_test(s == 201, "Dispatched announcement targeted specifically to tenant_alpha", raw_ann[:100])

    # 4.1 Targeted Tenant Query
    s, _, raw_alpha = runner.request("GET", "/api/announcements/active", headers={"X-Restaurant-Code": tenant_alpha})
    runner.assert_test(s == 200, "Alpha queried /api/announcements/active")
    runner.assert_test(target_announcement_title in raw_alpha, "Targeted tenant (Alpha) successfully receives targeted announcement")

    # 4.2 Non-Targeted Tenant Query: Beta
    s, _, raw_beta = runner.request("GET", "/api/announcements/active", headers={"X-Restaurant-Code": tenant_beta})
    runner.assert_test(s == 200, "Beta queried /api/announcements/active")
    runner.assert_test(target_announcement_title not in raw_beta, "Non-targeted tenant (Beta) DOES NOT receive Alpha's announcement (Zero Leakage)")

    # 4.3 Non-Targeted Tenant Query: Gamma
    s, _, raw_gamma = runner.request("GET", "/api/announcements/active", headers={"X-Restaurant-Code": tenant_gamma})
    runner.assert_test(s == 200, "Gamma queried /api/announcements/active")
    runner.assert_test(target_announcement_title not in raw_gamma, "Non-targeted tenant (Gamma) DOES NOT receive Alpha's announcement (Zero Leakage)")

    # 4.4 EMPIRICAL BUG TEST: Substring Match Leak in Announcement Filtering
    corp_target_code = "adv_megacorp_store_istanbul"
    substring_tenant_code = "adv_megacorp"  # Substring of 'adv_megacorp_store_istanbul'

    conn = get_master_db_conn()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT OR REPLACE INTO restaurant_tenants (code, name, plan_code, plan, status)
        VALUES (?, 'MegaCorp Istanbul', 'enterprise', 'enterprise', 'active')
        """,
        (corp_target_code,)
    )
    cur.execute(
        """
        INSERT OR REPLACE INTO restaurant_tenants (code, name, plan_code, plan, status)
        VALUES (?, 'MegaCorp Substring Store', 'starter', 'starter', 'active')
        """,
        (substring_tenant_code,)
    )
    conn.commit()
    conn.close()
    sync_master_db()

    substring_test_title = f"SUBSTRING-TARGET-NOTICE-{int(time.time())}"
    runner.request(
        "POST",
        "/api/master/broadcast",
        data={
            "title": substring_test_title,
            "content": "Intended ONLY for adv_megacorp_store_istanbul.",
            "target_type": "specific_tenants",
            "target_tenant_ids": json.dumps([corp_target_code]),
        },
    )

    s, _, raw_sub = runner.request("GET", "/api/announcements/active", headers={"X-Restaurant-Code": substring_tenant_code})
    if substring_test_title in raw_sub:
        runner.record_bug(
            bug_id="BUG-CH2-003",
            title="Announcement Fanout Substring Matching Leaks Targeted Notices to Non-Targeted Tenants",
            description="handlers_saas_announcements.go:149 uses `strings.Contains(a.TargetTenantIDs, tenantCode)`. Because TargetTenantIDs is a JSON string (e.g. `['adv_megacorp_store_istanbul']`), any tenant whose code is a substring (e.g. `adv_megacorp`) matches and receives confidential targeted announcements.",
            reproduction=f"Target announcement to '{corp_target_code}'. Query GET /api/announcements/active with X-Restaurant-Code: '{substring_tenant_code}'."
        )
    else:
        runner.assert_test(substring_test_title not in raw_sub, "Substring collision did not leak targeted announcement")

    # -------------------------------------------------------------------------
    # CHALLENGE 5: DELINQUENCY & LIFECYCLE INVARIANTS
    # -------------------------------------------------------------------------
    runner.section("Challenge 5: Delinquency & Lifecycle Invariants")

    delinq_tenant = "adv_delinq_tenant_test"
    conn = get_master_db_conn()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT OR REPLACE INTO restaurant_tenants (code, name, plan_code, plan, status, read_only_mode)
        VALUES (?, 'Delinquency Test Restaurant', 'pro', 'pro', 'suspended', 0)
        """,
        (delinq_tenant,)
    )
    conn.commit()
    conn.close()
    sync_master_db()

    # 5.1 Suspended Status: Everything blocked with 403 ACCOUNT_SUSPENDED
    s_susp_get, d_susp_get, _ = runner.request("GET", "/api/tables/areas", headers={"X-Restaurant-Code": delinq_tenant})
    runner.assert_test(
        s_susp_get == 403 and isinstance(d_susp_get, dict) and d_susp_get.get("code") == "ACCOUNT_SUSPENDED",
        "Suspended tenant GET request rejected with HTTP 403 ACCOUNT_SUSPENDED"
    )

    s_susp_post, d_susp_post, _ = runner.request(
        "POST",
        "/api/orders",
        data={"table_id": 1, "customer_count": 2},
        headers={"X-Restaurant-Code": delinq_tenant},
    )
    runner.assert_test(
        s_susp_post == 403 and isinstance(d_susp_post, dict) and d_susp_post.get("code") == "ACCOUNT_SUSPENDED",
        "Suspended tenant POST request rejected with HTTP 403 ACCOUNT_SUSPENDED"
    )

    # Delinquency Exemption: Heartbeats and Health must remain accessible for diagnostics
    s_hb, _, _ = runner.request(
        "POST",
        "/api/heartbeat",
        data={"device_id": "pos-diag-1", "device_type": "pos"},
        headers={"X-Restaurant-Code": delinq_tenant},
    )
    runner.assert_test(s_hb == 200, "Suspended tenant device heartbeat remains accessible (HTTP 200)")

    # 5.2 Read-Only Mode Invariant: GET allowed, POST/PUT/DELETE blocked, Support Ticket Exempt
    conn = get_master_db_conn()
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE restaurant_tenants
        SET status = 'read_only', read_only_mode = 1
        WHERE code = ?
        """,
        (delinq_tenant,)
    )
    conn.commit()
    conn.close()
    sync_master_db()

    s_ro_get, _, _ = runner.request("GET", "/api/tables/areas", headers={"X-Restaurant-Code": delinq_tenant})
    runner.assert_test(s_ro_get == 200, "Read-Only tenant GET request is PERMITTED (HTTP 200)")

    s_ro_post, d_ro_post, _ = runner.request(
        "POST",
        "/api/orders",
        data={"table_id": 1, "customer_count": 2},
        headers={"X-Restaurant-Code": delinq_tenant},
    )
    runner.assert_test(
        s_ro_post == 403 and isinstance(d_ro_post, dict) and d_ro_post.get("code") == "READ_ONLY_MODE",
        "Read-Only tenant write mutation (POST) strictly BLOCKED with HTTP 403 READ_ONLY_MODE"
    )

    s_ro_put, d_ro_put, _ = runner.request(
        "PUT",
        "/api/tables/1",
        data={"name": "Tamper Table"},
        headers={"X-Restaurant-Code": delinq_tenant},
    )
    runner.assert_test(
        s_ro_put == 403 and isinstance(d_ro_put, dict) and d_ro_put.get("code") == "READ_ONLY_MODE",
        "Read-Only tenant write mutation (PUT) strictly BLOCKED with HTTP 403 READ_ONLY_MODE"
    )

    # Exemption: Support ticket submission must be permitted so merchant can contact admin
    time.sleep(1.1)
    s_ro_ticket, _, raw_ro_t = runner.request(
        "POST",
        "/api/support/tickets",
        data={"subject": "Payment query in read-only mode", "description": "Need to pay invoice"},
        headers={"X-Restaurant-Code": delinq_tenant},
    )
    runner.assert_test(
        s_ro_ticket == 201,
        "Read-Only tenant support ticket submission is EXEMPT and successfully submitted (HTTP 201)"
    )

    # Clean up temporary test records
    conn = get_master_db_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM restaurant_tenants WHERE code LIKE 'adv_%' OR code LIKE 'tenant_leak_%'")
    cur.execute("DELETE FROM broadcast_announcements WHERE title LIKE 'TARGETED-%' OR title LIKE 'SUBSTRING-%'")
    cur.execute("DELETE FROM support_tickets WHERE tenant_code LIKE 'tenant_leak_%'")
    conn.commit()
    conn.close()
    sync_master_db()

    # -------------------------------------------------------------------------
    # SUMMARY REPORT
    # -------------------------------------------------------------------------
    print("\n" + "=" * 80)
    print("  CHALLENGER 2 ADVERSARIAL SUITE SUMMARY")
    print("=" * 80)
    print(f"  Total Invariant Tests : {runner.total}")
    print(f"  Passed Invariant Tests: {runner.passed}")
    print(f"  Failed Invariant Tests: {runner.failed}")
    print(f"  Empirical Bugs Found  : {len(runner.bugs_found)}")

    if runner.bugs_found:
        print("\n  EMPIRICALLY CONFIRMED BUGS & VULNERABILITIES:")
        for b in runner.bugs_found:
            print(f"    [{b['id']}] {b['title']}")
            print(f"      Section: {b['section']}")
            print(f"      Details: {b['description']}")
            print(f"      Reproduction: {b['reproduction']}\n")

    print("=" * 80)
    return 0


if __name__ == "__main__":
    sys.exit(run_all_challenges())
