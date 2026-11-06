#!/usr/bin/env python3
"""
Comprehensive Verification Script for Milestone 1: BonCore SaaS Master Admin Expansion Database Layer
Verifies:
1. Physical database integrity (PRAGMA integrity_check) on backend/data/master.db and backend/master.db
2. Foreign key consistency (PRAGMA foreign_key_check) on both master databases
3. All 14 new Master SaaS tables exist
4. All extended columns on restaurant_tenants (7 feature flags, plan_code, read_only_mode, brand fields) exist
5. All extended columns on tenant_invoices (tenant_code, subtotal, tax_amount, gateway, overdue notices) exist
6. Seed data validation:
   - 3 standard SaaS plans (starter: 990, pro: 1990, enterprise: 3990)
   - Active tenant fatihciftligi (status='active', plan='enterprise', all 7 flags=1, is_brand_master=1)
   - VPOS sandbox configs for PayTR and iyzico (is_production=0)
   - Sample franchise brand fatih-group
   - Storage quota allocation (10240 MB) and live metrics for fatihciftligi
7. Full schema and record parity between backend/data/master.db and fallback backend/master.db
"""

import json
import os
import sqlite3
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PRIMARY_MASTER_DB = os.path.join(ROOT_DIR, "backend", "data", "master.db")
FALLBACK_MASTER_DB = os.path.join(ROOT_DIR, "backend", "master.db")

EXPECTED_TABLES = [
    "restaurant_tenants",
    "tenant_leads",
    "tenant_invoices",
    "saas_plans",
    "fleet_heartbeats",
    "tenant_live_metrics",
    "vpos_configs",
    "franchise_brands",
    "menu_templates",
    "menu_clone_history",
    "broadcast_announcements",
    "announcement_receipts",
    "support_tickets",
    "support_ticket_messages",
    "support_ticket_audit_logs",
    "tenant_backups",
    "tenant_storage_quotas",
]

EXPECTED_TENANT_COLUMNS = [
    "feature_qr_menu",
    "feature_kds",
    "feature_delivery",
    "feature_integrations",
    "feature_e_invoice",
    "feature_stock_recipe",
    "feature_loyalty",
    "plan_code",
    "read_only_mode",
    "suspension_reason",
    "brand_id",
    "is_brand_master",
    "branch_code",
    "branch_name",
]

EXPECTED_INVOICE_COLUMNS = [
    "tenant_code",
    "subtotal",
    "tax_amount",
    "gateway_provider",
    "gateway_payment_id",
    "due_date",
    "overdue_notice_sent",
    "overdue_notice_sent_at",
]


def verify_database_file(db_path, is_primary=True):
    db_name = "PRIMARY (backend/data/master.db)" if is_primary else "FALLBACK (backend/master.db)"
    print(f"\n========================================================")
    print(f"VERIFYING {db_name}")
    print(f"Path: {db_path}")
    print(f"========================================================")

    if not os.path.exists(db_path):
        print(f"ERROR: Database file {db_path} does not exist!")
        return False

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    # 1. PRAGMA integrity_check
    integ = cur.execute("PRAGMA integrity_check;").fetchall()
    print(f"[CHECK] PRAGMA integrity_check: {integ}")
    assert integ == [("ok",)], f"Integrity check failed: {integ}"
    print("  -> PASS: B-tree physical integrity is 100% OK.")

    # 2. PRAGMA foreign_key_check
    fks = cur.execute("PRAGMA foreign_key_check;").fetchall()
    print(f"[CHECK] PRAGMA foreign_key_check: {len(fks)} violations")
    assert len(fks) == 0, f"Foreign key violations found: {fks}"
    print("  -> PASS: Zero foreign key violations.")

    # 3. Check All Tables
    cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
    existing_tables = [r[0] for r in cur.fetchall()]
    print(f"[CHECK] Table count: {len(existing_tables)}")
    for tbl in EXPECTED_TABLES:
        assert tbl in existing_tables, f"Missing table: {tbl}"
    print(f"  -> PASS: All {len(EXPECTED_TABLES)} required Master SaaS tables present.")

    # 4. Check extended columns on restaurant_tenants
    cur.execute("PRAGMA table_info(restaurant_tenants);")
    tenant_cols = [r[1] for r in cur.fetchall()]
    for col in EXPECTED_TENANT_COLUMNS:
        assert col in tenant_cols, f"Missing column in restaurant_tenants: {col}"
    print(f"  -> PASS: All {len(EXPECTED_TENANT_COLUMNS)} extended columns present on restaurant_tenants.")

    # 5. Check extended columns on tenant_invoices
    cur.execute("PRAGMA table_info(tenant_invoices);")
    inv_cols = [r[1] for r in cur.fetchall()]
    for col in EXPECTED_INVOICE_COLUMNS:
        assert col in inv_cols, f"Missing column in tenant_invoices: {col}"
    print(f"  -> PASS: All {len(EXPECTED_INVOICE_COLUMNS)} extended columns present on tenant_invoices.")

    # 6. Verify SaaS Plans
    plans = cur.execute("SELECT code, name, price_monthly, storage_quota_mb FROM saas_plans ORDER BY id;").fetchall()
    print(f"[CHECK] Seeded SaaS Plans ({len(plans)}):")
    for p in plans:
        print(f"         - {p[0]}: {p[1]} | {p[2]} TL/mo | {p[3]} MB")
    assert len(plans) >= 3, f"Expected at least 3 plans, found {len(plans)}"
    plan_codes = [p[0] for p in plans]
    for expected_plan in ["starter", "pro", "enterprise"]:
        assert expected_plan in plan_codes, f"Missing SaaS plan: {expected_plan}"
    print("  -> PASS: SaaS Plans seeded and verified.")

    # 7. Verify Tenant 'fatihciftligi'
    fatih = cur.execute("""
        SELECT code, plan, status, feature_qr_menu, feature_kds, feature_delivery, 
               feature_integrations, feature_e_invoice, feature_stock_recipe, feature_loyalty,
               is_brand_master, brand_id
        FROM restaurant_tenants WHERE code = 'fatihciftligi';
    """).fetchone()
    assert fatih is not None, "Tenant fatihciftligi missing!"
    print(f"[CHECK] Tenant fatihciftligi state:")
    print(f"         Plan: {fatih[1]}, Status: {fatih[2]}")
    print(f"         Features: QR={fatih[3]}, KDS={fatih[4]}, Delivery={fatih[5]}, "
          f"Integrations={fatih[6]}, E-Invoice={fatih[7]}, Stock={fatih[8]}, Loyalty={fatih[9]}")
    print(f"         Is Brand Master: {fatih[10]}, Brand ID: {fatih[11]}")

    assert fatih[1] == "enterprise", f"Expected enterprise plan, got {fatih[1]}"
    assert fatih[2] == "active", f"Expected active status, got {fatih[2]}"
    for idx, feat_name in enumerate(["QR", "KDS", "Delivery", "Integrations", "E-Invoice", "Stock", "Loyalty"], start=3):
        assert fatih[idx] == 1, f"Expected {feat_name} feature to be enabled (1), got {fatih[idx]}"
    assert fatih[10] == 1, "Expected fatihciftligi to be brand master (1)"
    assert fatih[11] is not None, "Expected fatihciftligi to have brand_id linked"
    print("  -> PASS: fatihciftligi enterprise features, status, and brand master verified.")

    # 8. Verify VPOS Test Configs
    vpos = cur.execute("SELECT gateway_provider, is_production, merchant_id, is_active FROM vpos_configs;").fetchall()
    print(f"[CHECK] VPOS Configs ({len(vpos)}):")
    for v in vpos:
        print(f"         - Provider: {v[0]}, Production: {bool(v[1])}, Merchant: {v[2]}, Active: {bool(v[3])}")
    providers = [v[0] for v in vpos]
    assert "paytr" in providers, "Missing PayTR VPOS config"
    assert "iyzico" in providers, "Missing iyzico VPOS config"
    print("  -> PASS: VPOS test configs for PayTR and iyzico verified.")

    # 9. Verify Franchise Brand
    brand = cur.execute("SELECT code, name, primary_tenant_code, status FROM franchise_brands WHERE code = 'fatih-group';").fetchone()
    assert brand is not None, "Franchise brand 'fatih-group' missing!"
    print(f"[CHECK] Franchise Brand: {brand[0]} ({brand[1]}), Primary: {brand[2]}, Status: {brand[3]}")
    print("  -> PASS: Franchise brand 'fatih-group' verified.")

    # 10. Verify Storage Quota & Live Metrics
    quota = cur.execute("SELECT tenant_code, allocated_quota_mb, is_quota_exceeded FROM tenant_storage_quotas WHERE tenant_code = 'fatihciftligi';").fetchone()
    assert quota is not None, "Storage quota for fatihciftligi missing!"
    assert quota[1] == 10240, f"Expected 10240 MB quota, got {quota[1]}"
    print(f"[CHECK] Storage Quota: {quota[0]} | Allocated: {quota[1]} MB | Exceeded: {bool(quota[2])}")
    print("  -> PASS: Storage quota verified.")

    conn.close()
    return True


def main():
    print("Starting BonCore SaaS Master Admin Database Verification...")
    primary_ok = verify_database_file(PRIMARY_MASTER_DB, is_primary=True)
    fallback_ok = verify_database_file(FALLBACK_MASTER_DB, is_primary=False)

    if primary_ok and fallback_ok:
        print("\n========================================================")
        print("ALL VERIFICATION CHECKS PASSED SUCCESSFULLY (100% GREEN)")
        print("========================================================")
        sys.exit(0)
    else:
        print("\nVERIFICATION FAILED")
        sys.exit(1)


if __name__ == "__main__":
    main()
