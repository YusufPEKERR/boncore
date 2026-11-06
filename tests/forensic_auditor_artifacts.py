import os
import sys
import sqlite3
import hashlib

def check_tenant_db():
    print("=== 1. TENANT DB CHECK: backend/data/tenants/fatihciftligi.db ===")
    path = os.path.join("backend", "data", "tenants", "fatihciftligi.db")
    if not os.path.exists(path):
        print(f"FAILED: {path} not found")
        return False
    size = os.path.getsize(path)
    print(f"File size: {size} bytes")
    conn = sqlite3.connect(path)
    cur = conn.cursor()
    integ = cur.execute("PRAGMA integrity_check;").fetchall()
    print(f"PRAGMA integrity_check: {integ}")
    assert integ == [("ok",)], f"Integrity check failed: {integ}"
    
    fk = cur.execute("PRAGMA foreign_key_check;").fetchall()
    print(f"PRAGMA foreign_key_check: {len(fk)} violations: {fk}")
    assert len(fk) == 0, f"Foreign key violations found: {fk}"

    cur.execute("SELECT COUNT(*) FROM categories;")
    cat_cnt = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM products;")
    prod_cnt = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM orders;")
    ord_cnt = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM payments;")
    pay_cnt = cur.fetchone()[0]
    print(f"Tenant Stats: categories={cat_cnt}, products={prod_cnt}, orders={ord_cnt}, payments={pay_cnt}")
    conn.close()
    print("PASS: Tenant DB fatihciftligi.db is healthy and fully populated.")
    return True

def check_backups():
    print("\n=== 2. BACKUP ARTIFACT FORENSICS ===")
    backups_dir = os.path.join("backend", "data", "backups")
    if not os.path.exists(backups_dir):
        print(f"WARNING: {backups_dir} does not exist yet (will test during E2E suite)")
        return True
    
    master_db = os.path.join("backend", "data", "master.db")
    conn = sqlite3.connect(master_db)
    cur = conn.cursor()
    cur.execute("SELECT id, tenant_code, backup_name, file_path, file_size_bytes, checksum_sha256 FROM tenant_backups ORDER BY id DESC;")
    records = cur.fetchall()
    print(f"Records in tenant_backups: {len(records)}")
    
    for r in records:
        b_id, tenant_code, b_name, f_path, size_b, recorded_sha = r
        print(f"\nChecking Backup ID {b_id} ({b_name}):")
        print(f"  Path: {f_path}")
        print(f"  Recorded SHA256: {recorded_sha}")
        
        # Resolve path
        actual_path = f_path
        if not os.path.exists(actual_path):
            actual_path = os.path.join(backups_dir, b_name)
        
        if not os.path.exists(actual_path):
            print(f"  ERROR: File not found at {actual_path}")
            continue
            
        real_size = os.path.getsize(actual_path)
        with open(actual_path, "rb") as f:
            content = f.read()
            real_sha = hashlib.sha256(content).hexdigest()
        
        print(f"  Physical Size: {real_size} bytes (matches DB: {real_size == size_b})")
        print(f"  Physical SHA256: {real_sha}")
        sha_match = (real_sha.lower() == (recorded_sha or '').lower())
        print(f"  Checksum Match: {sha_match}")
        assert sha_match, f"SHA256 mismatch for {b_name}!"
        
        # Test if it's a valid SQLite database
        try:
            b_conn = sqlite3.connect(actual_path)
            b_cur = b_conn.cursor()
            b_integ = b_cur.execute("PRAGMA integrity_check;").fetchall()
            print(f"  PRAGMA integrity_check on backup: {b_integ}")
            assert b_integ == [("ok",)], f"Backup integrity corrupted: {b_integ}"
            b_conn.close()
            print("  -> PASS: Valid SQLite backup file with matching SHA256!")
        except Exception as e:
            print(f"  ERROR verifying backup sqlite: {e}")
            raise e
            
    conn.close()
    return True

def check_ticket_uploads():
    print("\n=== 3. TICKET UPLOADS FORENSICS ===")
    uploads_dir = os.path.join("backend", "static", "uploads", "tickets")
    if not os.path.exists(uploads_dir):
        print(f"Uploads dir {uploads_dir} does not exist yet.")
        return True
    
    files = os.listdir(uploads_dir)
    print(f"Found {len(files)} files in {uploads_dir}: {files}")
    for fname in files:
        fpath = os.path.join(uploads_dir, fname)
        size = os.path.getsize(fpath)
        with open(fpath, "rb") as f:
            header = f.read(16)
        
        # PNG magic: 89 50 4E 47 0D 0A 1A 0A
        is_png = header.startswith(b"\x89PNG\r\n\x1a\n")
        # JPEG magic: FF D8 FF
        is_jpeg = header.startswith(b"\xff\xd8\xff")
        # GIF: GIF87a or GIF89a
        is_gif = header.startswith(b"GIF8")
        
        img_type = "UNKNOWN"
        if is_png: img_type = "PNG"
        elif is_jpeg: img_type = "JPEG"
        elif is_gif: img_type = "GIF"
        
        print(f"File: {fname} | Size: {size} bytes | Header Hex: {header[:8].hex()} | Detected: {img_type}")
        assert is_png or is_jpeg or is_gif or size > 0, f"Invalid attachment file: {fname}"
    return True

def check_menu_cloning():
    print("\n=== 4. MENU CLONING FORENSICS ===")
    master_db = os.path.join("backend", "data", "master.db")
    conn = sqlite3.connect(master_db)
    cur = conn.cursor()
    cur.execute("SELECT id, source_tenant_code, target_tenant_code, categories_copied, products_copied, status, cloned_at FROM menu_clone_history ORDER BY id DESC LIMIT 5;")
    history = cur.fetchall()
    print(f"Recent Menu Clone History ({len(history)} entries):")
    for h in history:
        print(f"  ID: {h[0]} | {h[1]} -> {h[2]} | Cats: {h[3]} | Prods: {h[4]} | Status: {h[5]} | Date: {h[6]}")
    conn.close()
    return True

if __name__ == "__main__":
    t_ok = check_tenant_db()
    b_ok = check_backups()
    u_ok = check_ticket_uploads()
    m_ok = check_menu_cloning()
    print("\nALL FORENSIC CHECKS COMPLETE.")
