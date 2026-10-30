import sqlite3
import os

db_path = os.path.join("backend", "boncore.db")
conn = sqlite3.connect(db_path)
tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
print("Tables in boncore.db:", tables)
for t in ["restaurant_tenants", "categories", "products", "staff_users", "areas", "tables"]:
    if t in tables:
        count = conn.execute(f"SELECT count(*) FROM {t}").fetchone()[0]
        print(f"Table {t}: {count} rows")
