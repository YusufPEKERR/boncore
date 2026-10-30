import os
import shutil
import sqlite3
from datetime import datetime, timedelta

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BACKEND_DIR, "data")
TENANTS_DIR = os.path.join(DATA_DIR, "tenants")
OLD_DB_PATH = os.path.join(BACKEND_DIR, "boncore.db")

os.makedirs(TENANTS_DIR, exist_ok=True)
MASTER_DB_PATH = os.path.join(DATA_DIR, "master.db")

print(f"Migrating to Multi-Tenant DBs:")
print(f"Data directory: {DATA_DIR}")
print(f"Tenants directory: {TENANTS_DIR}")
print(f"Master DB path: {MASTER_DB_PATH}")

# 1. SETUP MASTER DB
conn_old = sqlite3.connect(OLD_DB_PATH) if os.path.exists(OLD_DB_PATH) else None

conn_master = sqlite3.connect(MASTER_DB_PATH)
c_m = conn_master.cursor()

c_m.execute("""
CREATE TABLE IF NOT EXISTS restaurant_tenants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    owner_name VARCHAR(100),
    phone VARCHAR(50),
    email VARCHAR(100),
    city VARCHAR(50) DEFAULT 'İstanbul',
    tax_number VARCHAR(50),
    tax_office VARCHAR(100),
    address VARCHAR(255),
    plan VARCHAR(50) DEFAULT 'pro',
    monthly_price FLOAT DEFAULT 1490.0,
    billing_cycle VARCHAR(20) DEFAULT 'monthly',
    status VARCHAR(30) DEFAULT 'active',
    trial_ends_at DATETIME,
    renewal_date DATETIME,
    payment_method VARCHAR(50) DEFAULT 'credit_card',
    payment_status VARCHAR(30) DEFAULT 'paid',
    notes TEXT,
    created_at DATETIME,
    updated_at DATETIME
);
""")

c_m.execute("""
CREATE TABLE IF NOT EXISTS tenant_leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    company_name VARCHAR(150) NOT NULL,
    business_type VARCHAR(50) DEFAULT 'restoran',
    city VARCHAR(50) DEFAULT 'İstanbul',
    status VARCHAR(30) DEFAULT 'yeni',
    notes TEXT,
    created_at DATETIME
);
""")

c_m.execute("""
CREATE TABLE IF NOT EXISTS tenant_invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL,
    invoice_no VARCHAR(50) UNIQUE NOT NULL,
    tenant_name VARCHAR(150) NOT NULL,
    period VARCHAR(50) NOT NULL,
    amount FLOAT NOT NULL,
    plan VARCHAR(50) DEFAULT 'pro',
    payment_method VARCHAR(50) DEFAULT 'credit_card',
    status VARCHAR(30) DEFAULT 'paid',
    due_date DATETIME,
    paid_at DATETIME,
    created_at DATETIME
);
""")

# Migrate from old DB if exists
if conn_old:
    try:
        tenants = conn_old.execute("SELECT * FROM restaurant_tenants").fetchall()
        for t in tenants:
            c_m.execute("INSERT OR IGNORE INTO restaurant_tenants VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", t)
        print(f"Migrated {len(tenants)} tenants to master.db")
    except Exception as e:
        print("Tenants migration note:", e)

    try:
        leads = conn_old.execute("SELECT * FROM tenant_leads").fetchall()
        for l in leads:
            c_m.execute("INSERT OR IGNORE INTO tenant_leads VALUES (?,?,?,?,?,?,?,?,?)", l)
        print(f"Migrated {len(leads)} leads to master.db")
    except Exception as e:
        print("Leads migration note:", e)

    try:
        invs = conn_old.execute("SELECT * FROM tenant_invoices").fetchall()
        for i in invs:
            c_m.execute("INSERT OR IGNORE INTO tenant_invoices VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", i)
        print(f"Migrated {len(invs)} invoices to master.db")
    except Exception as e:
        print("Invoices migration note:", e)

conn_master.commit()
conn_master.close()

# 2. SETUP BONCORE-KADIKOY (FATIH CIFTLIGI)
kadikoy_db = os.path.join(TENANTS_DIR, "boncore-kadikoy.db")
if os.path.exists(OLD_DB_PATH) and not os.path.exists(kadikoy_db):
    shutil.copy2(OLD_DB_PATH, kadikoy_db)
    print(f"Copied {OLD_DB_PATH} -> {kadikoy_db}")

# Ensure clean settings for boncore-kadikoy
conn_k = sqlite3.connect(kadikoy_db)
conn_k.execute("UPDATE restaurant_settings SET value = '\"Fatih Çiftliği & BonCore Kadıköy\"' WHERE key = 'restaurant_name'")
conn_k.commit()
conn_k.close()
print("boncore-kadikoy.db ready.")

if conn_old:
    conn_old.close()

print("Initial migration step 1 completed successfully.")
