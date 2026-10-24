import os
import csv
import sqlite3

CATEGORY_ORDER_AND_META = [
    ("ÇİFTLİK KUZU", "Flame", "#dc2626", "grill"),
    ("ÇİFTLİK DANA", "Flame", "#b91c1c", "grill"),
    ("ÇİFTLİK TAVUK", "Utensils", "#ea580c", "grill"),
    ("KÖFTE", "Flame", "#d97706", "grill"),
    ("YÖRESEL KEBAP", "Flame", "#e11d48", "grill"),
    ("MENÜLER", "Utensils", "#f97316", "kitchen"),
    ("KAHVALTI", "Coffee", "#f59e0b", "kitchen"),
    ("ŞARKÜTERİ", "Utensils", "#10b981", "kitchen"),
    ("SOĞUK İÇECEKLER", "CupSoda", "#0284c7", "bar"),
    ("TATLI", "Cake", "#8b5cf6", "pastry"),
    ("DONDURMA", "IceCream", "#ec4899", "pastry"),
    ("DİĞER", "Sparkles", "#6366f1", "kitchen"),
    ("MANAV", "Salad", "#16a34a", "kitchen"),
    ("KURU GIDA", "Wheat", "#ca8a04", "kitchen"),
    ("BAHARAT", "Sparkles", "#9333ea", "kitchen"),
    ("HAMMADDE", "Package", "#475569", "kitchen"),
    ("AMBALAJ", "Box", "#64748b", "kitchen"),
    ("DETERJAN", "Droplets", "#06b6d4", "kitchen"),
]


def migrate_and_seed_stock(db_path: str = None, force: bool = False):
    if not db_path:
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        db_path = os.path.join(base_dir, "boncore.db")

    csv_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "stock_seed_data.csv")
    if not os.path.exists(csv_path):
        print(f"CSV file not found at {csv_path}")
        return

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    cols = [r[1] for r in cur.execute("PRAGMA table_info(ingredients)").fetchall()]
    new_columns = [
        ("product_code", "VARCHAR(50) DEFAULT ''"),
        ("category_name", "VARCHAR(100) DEFAULT 'DİĞER'"),
        ("kitchen_group", "VARCHAR(100) DEFAULT 'MUTFAK'"),
        ("revenue_center", "VARCHAR(100) DEFAULT 'Ana Kanal'"),
    ]
    for col_name, col_def in new_columns:
        if col_name not in cols:
            cur.execute(f"ALTER TABLE ingredients ADD COLUMN {col_name} {col_def}")
            print(f"Added column {col_name} to ingredients")

    # Check if old non-Excel categories or products exist
    old_cat_check = cur.execute(
        "SELECT COUNT(*) FROM categories WHERE name IN ('Başlangıçlar & Çorbalar', 'Kebap & Izgaralar', 'Burger & Atıştırmalık', 'Taş Fırın Pizza', 'Kokteyl & Bar')"
    ).fetchone()[0]
    prod_count = cur.execute("SELECT COUNT(*) FROM products").fetchone()[0]
    ing_count = cur.execute("SELECT COUNT(*) FROM ingredients").fetchone()[0]

    if force or old_cat_check > 0 or prod_count < 200 or ing_count < 200:
        with open(csv_path, "r", encoding="utf-8") as f:
            reader = csv.reader(f)
            header = next(reader)
            rows = [r for r in reader if len(r) >= 9 and r[2].strip()]

        # Clear old menu and stock tables completely so only Excel items exist
        cur.execute("DELETE FROM modifier_options")
        cur.execute("DELETE FROM modifier_groups")
        cur.execute("DELETE FROM product_variants")
        cur.execute("DELETE FROM recipes")
        cur.execute("DELETE FROM products")
        cur.execute("DELETE FROM categories")
        cur.execute("DELETE FROM ingredients")

        # Discover all categories in CSV and order them according to CATEGORY_ORDER_AND_META
        csv_cats = []
        for r in rows:
            c_name = (r[1].strip() or "DİĞER").upper()
            if c_name not in csv_cats:
                csv_cats.append(c_name)

        cat_id_map = {}
        cat_station_map = {}
        order_idx = 1

        for c_name, icon, color, station in CATEGORY_ORDER_AND_META:
            if c_name in csv_cats:
                cur.execute(
                    "INSERT INTO categories (id, name, icon, color, order_index, target_station) VALUES (?, ?, ?, ?, ?, ?)",
                    (order_idx, c_name, icon, color, order_idx, station),
                )
                cat_id_map[c_name] = order_idx
                cat_station_map[c_name] = station
                order_idx += 1

        for c_name in csv_cats:
            if c_name not in cat_id_map:
                cur.execute(
                    "INSERT INTO categories (id, name, icon, color, order_index, target_station) VALUES (?, ?, ?, ?, ?, ?)",
                    (order_idx, c_name, "Utensils", "#f97316", order_idx, "kitchen"),
                )
                cat_id_map[c_name] = order_idx
                cat_station_map[c_name] = "kitchen"
                order_idx += 1

        # Insert every Excel row into both ingredients and products, and link via recipes
        for idx, r in enumerate(rows, start=1):
            p_code = r[0].strip() or str(1000 + idx)
            cat_name = (r[1].strip() or "DİĞER").upper()
            name = r[2].strip()
            k_group = (r[3].strip() or "MUTFAK").upper()
            rev_center = r[4].strip() or "Ana Kanal"
            try:
                stock_qty = float(r[5].strip())
            except Exception:
                stock_qty = 0.0

            crit_raw = r[6].strip()
            if crit_raw in ("-", ""):
                min_alert = 0.0
            else:
                try:
                    min_alert = float(crit_raw)
                except Exception:
                    min_alert = 0.0

            unit = r[7].strip() or "Adet"
            try:
                unit_cost = float(r[8].strip())
            except Exception:
                unit_cost = 0.0

            wh_id = 3 if k_group in ("BAR", "İÇECEK") else (1 if k_group in ("DEPO", "AMBALAJ", "DETERJAN", "KURU GIDA") else 2)

            cur.execute(
                """
                INSERT INTO ingredients (
                    id, product_code, category_name, name, kitchen_group,
                    revenue_center, unit, cost_per_unit, current_stock,
                    min_stock_alert, warehouse_id
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (idx, r[0].strip(), cat_name, name, k_group, rev_center, unit, unit_cost, stock_qty, min_alert, wh_id),
            )

            cat_id = cat_id_map[cat_name]
            station = cat_station_map.get(cat_name, "kitchen")
            if k_group == "İÇECEK":
                station = "bar"

            cur.execute(
                """
                INSERT INTO products (
                    id, category_id, name, description, base_price,
                    plu_code, barcode, vat_rate, station, is_available,
                    calories, allergens, is_vegan, is_spicy
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    idx,
                    cat_id,
                    name,
                    f"{cat_name} • {k_group} ({unit})",
                    unit_cost,
                    p_code,
                    f"869{10000 + idx}",
                    10.0,
                    station,
                    1,
                    None,
                    "[]",
                    0,
                    1 if "ACI" in name.upper() or "ADANA" in name.upper() else 0,
                ),
            )

            cur.execute(
                """
                INSERT INTO recipes (product_id, ingredient_id, amount, waste_percentage)
                VALUES (?, ?, 1.0, 0.0)
                """,
                (idx, idx),
            )

        # Update any existing order_items that had old sample product names so all order history also uses real Excel products
        sample_replacements = [
            ("Tereyağlı Süzme Mercimek Çorbası", "FIRIN SÜTLAÇ", 245.0),
            ("Sıcak Pastırmalı Humus", "PASTIRMA", 400.0),
            ("Zırh Kıyma Adana Kebap", "ADANA KEBAP", 985.0),
            ("Izgara Bonfile Lokum (250gr)", "KUZU LOKUM", 950.0),
            ("BonCore Double Smash Burger", "HAMBURGER MENÜ", 570.0),
            ("Napoli Margherita Pizza", "KASAP KÖFTE", 675.0),
            ("San Sebastian Cheesecake", "MAGNOLYA", 245.0),
            ("Özel Hatay Künefesi", "KÜNEFE", 400.0),
            ("Caffe Latte (Single Origin)", "KUTU PEPSİ", 110.0),
            ("Yayık Köpüklü Açık Ayran", "KÖPÜKLÜ BARDAK AYRAN", 110.0),
            ("Smoked Passion Mezcalita", "BÜYÜK SU", 70.0),
            ("Kol", "KUTU PEPSİ", 110.0),
        ]
        for old_name, new_name, fallback_price in sample_replacements:
            new_prod_row = cur.execute(
                "SELECT id, name, base_price FROM products WHERE UPPER(TRIM(name)) = UPPER(TRIM(?))",
                (new_name,),
            ).fetchone()
            if new_prod_row:
                cur.execute(
                    "UPDATE order_items SET product_id = ?, product_name = ? WHERE product_name = ?",
                    (new_prod_row[0], new_prod_row[1], old_name),
                )

        conn.commit()
        total_cats = cur.execute("SELECT COUNT(*) FROM categories").fetchone()[0]
        total_prods = cur.execute("SELECT COUNT(*) FROM products").fetchone()[0]
        total_ing = cur.execute("SELECT COUNT(*) FROM ingredients").fetchone()[0]
        print(
            f"Unified DB seeded: {total_cats} categories, {total_prods} POS products, and {total_ing} stock report items in {db_path}"
        )
    else:
        print(f"Unified DB already up to date ({prod_count} products, {ing_count} ingredients)")

    conn.close()


if __name__ == "__main__":
    migrate_and_seed_stock(force=True)
