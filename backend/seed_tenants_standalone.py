import sqlite3
import os
import json
from datetime import datetime
from app.security import hash_password

TENANTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "tenants")
TEMPLATE_DB = os.path.join(TENANTS_DIR, "boncore-kadikoy.db")

def create_tenant_db_from_schema(target_code: str):
    target_path = os.path.join(TENANTS_DIR, f"{target_code}.db")
    if os.path.exists(target_path):
        os.remove(target_path)

    # Read schema DDL from template
    conn_src = sqlite3.connect(TEMPLATE_DB)
    ddl_statements = []
    for row in conn_src.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchall():
        if row[0]:
            ddl_statements.append(row[0])
    conn_src.close()

    conn_dst = sqlite3.connect(target_path)
    for ddl in ddl_statements:
        conn_dst.execute(ddl)
    conn_dst.commit()
    conn_dst.close()
    return target_path

# ==========================================
# 1. SEED MODA MEYHANE & OCAKBAŞI
# ==========================================
def seed_moda_meyhane():
    db_path = create_tenant_db_from_schema("moda-meyhane")
    conn = sqlite3.connect(db_path)
    c = conn.cursor()

    # Staff
    staff = [
        ("Murat Yılmaz (Müdür)", "moda_admin", hash_password("123456"), "2001", "manager", 2, 1),
        ("Caner Demir (Kasiyer)", "moda_kasiyer", hash_password("123456"), "2002", "cashier", 2, 1),
        ("Ali Kaya (Garson)", "moda_garson", hash_password("123456"), "2003", "waiter", 2, 1),
        ("Selim Usta (Ocakbaşı Şefi)", "moda_sef", hash_password("123456"), "2004", "chef", 2, 1),
    ]
    for s in staff:
        c.execute("INSERT INTO staff_users (name, username, password_hash, pin_code, role, restaurant_id, is_active, created_at) VALUES (?,?,?,?,?,?,?,datetime('now'))", s)

    # Settings
    settings = {
        "restaurant_name": "Moda Meyhane & Ocakbaşı",
        "company_title": "Moda Meyhane Gıda Turizm San. ve Tic. Ltd. Şti.",
        "phone": "+90 216 345 67 89",
        "email": "iletisim@modameyhane.com",
        "address": "Caferağa Mah. Moda Cad. No:112 Kadıköy / İstanbul",
        "tax_office": "Kadıköy",
        "tax_number": "1234567890",
        "wifi_name": "ModaMeyhane_Misafir",
        "wifi_password": "serefe2026",
        "instagram": "@modameyhaneocakbasi",
        "currency": "₺",
        "enable_kuver": True,
        "default_kuver_price": 50.0,
        "service_fee_rate": 10.0,
        "e_adisyon_title_text": "MODA MEYHANE E-ADİSYON",
        "footer_message": "ŞEREFE! AFİYET OLSUN • TEKRAR BEKLERİZ",
    }
    for k, v in settings.items():
        c.execute("INSERT INTO restaurant_settings (key, value) VALUES (?, ?)", (k, json.dumps(v)))

    # Areas & Tables
    areas = [
        ("Meyhane Salonu", 0),
        ("Ocakbaşı Önü", 1),
        ("Moda Terası", 2),
        ("Rakı Bahçesi", 3)
    ]
    area_ids = {}
    for a in areas:
        c.execute("INSERT INTO areas (name, order_index) VALUES (?, ?)", a)
        area_ids[a[0]] = c.lastrowid

    # Tables
    tables_data = [
        # Meyhane Salonu
        ("M-1", area_ids["Meyhane Salonu"], 4, 100.0, 100.0),
        ("M-2", area_ids["Meyhane Salonu"], 4, 250.0, 100.0),
        ("M-3", area_ids["Meyhane Salonu"], 6, 400.0, 100.0),
        ("M-4", area_ids["Meyhane Salonu"], 6, 100.0, 260.0),
        ("M-5", area_ids["Meyhane Salonu"], 4, 250.0, 260.0),
        ("M-6", area_ids["Meyhane Salonu"], 8, 400.0, 260.0),
        # Ocakbaşı Önü
        ("O-1 (Ocakbaşı)", area_ids["Ocakbaşı Önü"], 2, 100.0, 100.0),
        ("O-2 (Ocakbaşı)", area_ids["Ocakbaşı Önü"], 2, 250.0, 100.0),
        ("O-3 (Ocakbaşı)", area_ids["Ocakbaşı Önü"], 2, 400.0, 100.0),
        ("O-4 (Ocakbaşı)", area_ids["Ocakbaşı Önü"], 4, 100.0, 260.0),
        # Moda Terası
        ("T-1 (Deniz)", area_ids["Moda Terası"], 4, 100.0, 100.0),
        ("T-2 (Deniz)", area_ids["Moda Terası"], 4, 250.0, 100.0),
        ("T-3 (Teras)", area_ids["Moda Terası"], 6, 400.0, 100.0),
        ("T-4 (Teras)", area_ids["Moda Terası"], 6, 100.0, 260.0),
        # Rakı Bahçesi
        ("B-1 (Bahçe)", area_ids["Rakı Bahçesi"], 4, 100.0, 100.0),
        ("B-2 (Bahçe)", area_ids["Rakı Bahçesi"], 4, 250.0, 100.0),
        ("B-3 (Bahçe)", area_ids["Rakı Bahçesi"], 6, 400.0, 100.0),
        ("B-4 (Bahçe)", area_ids["Rakı Bahçesi"], 6, 100.0, 260.0),
    ]
    for t in tables_data:
        c.execute("INSERT INTO tables (name, area_id, seats, x, y, status) VALUES (?,?,?,?,?,'empty')", t)

    # Categories
    categories = [
        ("Soğuk Mezeler", "Salad", "#059669", 0, "kitchen"),
        ("Ara Sıcaklar", "Flame", "#d97706", 1, "kitchen"),
        ("Ocakbaşı & Kebaplar", "Beef", "#dc2626", 2, "grill"),
        ("Rakılar & İçecekler", "Wine", "#2563eb", 3, "bar"),
        ("Tatlılar", "Cake", "#7c3aed", 4, "pastry")
    ]
    cat_ids = {}
    for cat in categories:
        c.execute("INSERT INTO categories (name, icon, color, order_index, target_station, show_in_pos) VALUES (?,?,?,?,?,1)", cat)
        cat_ids[cat[0]] = c.lastrowid

    # Products
    prods = [
        # Soğuk Mezeler
        ("Haydari", cat_ids["Soğuk Mezeler"], 160.0, "kitchen", 10, "Süzme yoğurt, taze nane, sarımsak, sızma zeytinyağı"),
        ("Atom", cat_ids["Soğuk Mezeler"], 180.0, "kitchen", 10, "Kızgın tereyağında kurutulmuş acı Arnavut biberi, süzme yoğurt"),
        ("Girit Ezmesi", cat_ids["Soğuk Mezeler"], 185.0, "kitchen", 10, "Ezine peyniri, lor, Antep fıstığı, fesleğen"),
        ("Levrek Marin", cat_ids["Soğuk Mezeler"], 290.0, "kitchen", 10, "Hardal soslu marine taze levrek fileto"),
        ("Şakşuka", cat_ids["Soğuk Mezeler"], 170.0, "kitchen", 10, "Kızarmış patlıcan, biber, domates sosu"),
        ("Humus", cat_ids["Soğuk Mezeler"], 175.0, "kitchen", 10, "Tahin, nohut, kimyon, sızma zeytinyağı"),
        ("Köpoğlu", cat_ids["Soğuk Mezeler"], 170.0, "kitchen", 10, "Köz patlıcan, süzme yoğurt, domates sosu"),
        # Ara Sıcaklar
        ("Tereyağlı Karides Güveç", cat_ids["Ara Sıcaklar"], 420.0, "kitchen", 10, "Jumbo karides, sarımsak, pul biber, köy tereyağı"),
        ("Kalamar Tava", cat_ids["Ara Sıcaklar"], 380.0, "kitchen", 10, "Tarator sos ile çıtır kalamar tava"),
        ("Paçanga Böreği", cat_ids["Ara Sıcaklar"], 210.0, "kitchen", 10, "Kayseri pastırması, kaşar peyniri, kapya biber"),
        ("Sıcak Ot Kavurma", cat_ids["Ara Sıcaklar"], 190.0, "kitchen", 10, "Ege otları, zeytinyağı, sarımsaklı yoğurt"),
        # Ocakbaşı & Kebaplar
        ("Adana Kebap (Zırh)", cat_ids["Ocakbaşı & Kebaplar"], 390.0, "grill", 10, "Zırh kıyması, sumaklı soğan, lavaş ve közlenmiş sebzeler"),
        ("Urfa Kebap", cat_ids["Ocakbaşı & Kebaplar"], 390.0, "grill", 10, "Acısız zırh kıyması, lavaş ve garnitür"),
        ("Kuzu Şiş", cat_ids["Ocakbaşı & Kebaplar"], 460.0, "grill", 10, "Kuzu but parçaları, baharat marine, köz biber"),
        ("Çöp Şiş", cat_ids["Ocakbaşı & Kebaplar"], 440.0, "grill", 10, "Kuzu çöp şiş, közlenmiş domates ve biber ile"),
        ("Kuzu Pirzola (3 Kalem)", cat_ids["Ocakbaşı & Kebaplar"], 520.0, "grill", 10, "Taze kekikli ızgara kuzu pirzola"),
        ("Beyti Sarma", cat_ids["Ocakbaşı & Kebaplar"], 450.0, "grill", 10, "Lavaşa sarılı kebap, domates sos, tereyağı ve yoğurt"),
        ("Karışık Ocakbaşı Tabağı", cat_ids["Ocakbaşı & Kebaplar"], 680.0, "grill", 10, "Adana, kuzu şiş, pirzola, tavuk kanat"),
        # Rakılar & İçecekler
        ("Yeni Rakı 35cl", cat_ids["Rakılar & İçecekler"], 750.0, "bar", 20, "Geleneksel Yeni Rakı 35cl"),
        ("Yeni Rakı 70cl", cat_ids["Rakılar & İçecekler"], 1350.0, "bar", 20, "Geleneksel Yeni Rakı 70cl"),
        ("Beylerbeyi Göbek 70cl", cat_ids["Rakılar & İçecekler"], 1650.0, "bar", 20, "3 distile Beylerbeyi Göbek Rakısı 70cl"),
        ("Tekirdağ Altın Seri 70cl", cat_ids["Rakılar & İçecekler"], 1500.0, "bar", 20, "Meşe fıçılarda dinlendirilmiş Altın Seri 70cl"),
        ("Efes Özel Seri 50cl", cat_ids["Rakılar & İçecekler"], 140.0, "bar", 20, "Şişe Bira"),
        ("Şalgam Suyu (Acılı/Acısız)", cat_ids["Rakılar & İçecekler"], 45.0, "bar", 10, "Geleneksel Adana şalgamı"),
        ("Su (Cam Şişe 750ml)", cat_ids["Rakılar & İçecekler"], 40.0, "bar", 10, "Cam şişe kaynak suyu"),
        # Tatlılar
        ("Sıcak Tahin Helvası", cat_ids["Tatlılar"], 140.0, "pastry", 10, "Fırında tereyağlı sıcak güveç helva"),
        ("Antep Fıstıklı Katmer", cat_ids["Tatlılar"], 220.0, "pastry", 10, "Kaymaklı çıtır katmer"),
        ("Fırın Sütlaç", cat_ids["Tatlılar"], 120.0, "pastry", 10, "Geleneksel toprak kapta fırın sütlaç")
    ]
    for p in prods:
        c.execute("INSERT INTO products (name, category_id, base_price, station, vat_rate, description, is_available, show_in_pos) VALUES (?,?,?,?,?,?,1,1)", p)

    # Ingredients & Stock
    warehouses = [
        ("Moda Ana Depo", "WH-MODA-MAIN", 1),
        ("Mutfak & Meze Deposu", "WH-MODA-KITCHEN", 0),
        ("Bar & Rakı Deposu", "WH-MODA-BAR", 0)
    ]
    for w in warehouses:
        c.execute("INSERT INTO warehouses (name, code, is_main) VALUES (?,?,?)", w)

    ings = [
        ("Yeni Rakı 70cl", "Şişe", 800.0, 48.0, 10.0, 3),
        ("Beylerbeyi Göbek 70cl", "Şişe", 1100.0, 36.0, 8.0, 3),
        ("Kuzu Kıyma (Zırh)", "kg", 450.0, 35.0, 5.0, 2),
        ("Kuzu But / Şiş", "kg", 520.0, 25.0, 5.0, 2),
        ("Taze Karides (Ayıklanmış)", "kg", 600.0, 15.0, 3.0, 2),
        ("Tava Kalamar", "kg", 480.0, 20.0, 4.0, 2),
        ("Süzme Yoğurt", "kg", 85.0, 40.0, 8.0, 2),
        ("Ezine Peyniri", "kg", 280.0, 25.0, 5.0, 2),
        ("Levrek Fileto", "kg", 380.0, 18.0, 4.0, 2)
    ]
    for ing in ings:
        c.execute("INSERT INTO ingredients (name, unit, cost_per_unit, current_stock, min_stock_alert, warehouse_id) VALUES (?,?,?,?,?,?)", ing)

    # Cash Register
    c.execute("INSERT INTO cash_registers (status, opening_float, opened_by) VALUES ('open', 2500.0, 'Caner Demir (Kasiyer)')")

    conn.commit()
    conn.close()
    print("Moda Meyhane DB seeded successfully!")


# ==========================================
# 2. SEED ROAST & BREW SPECIALTY COFFEE
# ==========================================
def seed_roast_brew():
    db_path = create_tenant_db_from_schema("roast-brew")
    conn = sqlite3.connect(db_path)
    c = conn.cursor()

    # Staff
    staff = [
        ("Selin Aksoy (Yönetici)", "roast_admin", hash_password("123456"), "3001", "manager", 3, 1),
        ("Ece Barista (Kasiyer)", "roast_barista", hash_password("123456"), "3002", "cashier", 3, 1),
        ("Can Barista (Barista)", "roast_can", hash_password("123456"), "3003", "chef", 3, 1),
    ]
    for s in staff:
        c.execute("INSERT INTO staff_users (name, username, password_hash, pin_code, role, restaurant_id, is_active, created_at) VALUES (?,?,?,?,?,?,?,datetime('now'))", s)

    # Settings
    settings = {
        "restaurant_name": "Roast & Brew Specialty Coffee",
        "company_title": "Roast and Brew Kahvecilik A.Ş.",
        "phone": "+90 212 234 56 78",
        "email": "info@roastbrew.com",
        "address": "Sinanpaşa Mah. Şair Nedim Cad. No:22 Beşiktaş / İstanbul",
        "tax_office": "Beşiktaş",
        "tax_number": "9876543210",
        "wifi_name": "RoastBrew_WiFi",
        "wifi_password": "specialtycoffee",
        "instagram": "@roastbrewcoffee",
        "currency": "₺",
        "enable_kuver": False,
        "default_kuver_price": 0.0,
        "service_fee_rate": 0.0,
        "e_adisyon_title_text": "ROAST & BREW BİLGİ FİŞİ",
        "footer_message": "GÜZEL KAHVELERLE GÜZEL GÜNLER DİLERİZ!",
    }
    for k, v in settings.items():
        c.execute("INSERT INTO restaurant_settings (key, value) VALUES (?, ?)", (k, json.dumps(v)))

    # Areas & Tables
    areas = [
        ("Cadde Teras", 0),
        ("Kahve Salonu", 1),
        ("Bar Önü", 2)
    ]
    area_ids = {}
    for a in areas:
        c.execute("INSERT INTO areas (name, order_index) VALUES (?, ?)", a)
        area_ids[a[0]] = c.lastrowid

    tables_data = [
        ("T-1", area_ids["Cadde Teras"], 2, 100.0, 100.0),
        ("T-2", area_ids["Cadde Teras"], 2, 250.0, 100.0),
        ("T-3", area_ids["Cadde Teras"], 4, 400.0, 100.0),
        ("T-4", area_ids["Cadde Teras"], 4, 100.0, 260.0),
        ("S-1", area_ids["Kahve Salonu"], 2, 100.0, 100.0),
        ("S-2", area_ids["Kahve Salonu"], 4, 250.0, 100.0),
        ("S-3", area_ids["Kahve Salonu"], 6, 400.0, 100.0),
        ("Bar-1", area_ids["Bar Önü"], 1, 100.0, 100.0),
        ("Bar-2", area_ids["Bar Önü"], 1, 250.0, 100.0),
    ]
    for t in tables_data:
        c.execute("INSERT INTO tables (name, area_id, seats, x, y, status) VALUES (?,?,?,?,?,'empty')", t)

    # Categories
    categories = [
        ("Sıcak Kahveler", "Coffee", "#78350f", 0, "bar"),
        ("Soğuk & Demleme Kahveler", "CupSoda", "#0284c7", 1, "bar"),
        ("Fırın & Tatlılar", "Croissant", "#d97706", 2, "pastry"),
        ("Sandviç & Kahvaltı", "Utensils", "#16a34a", 3, "kitchen")
    ]
    cat_ids = {}
    for cat in categories:
        c.execute("INSERT INTO categories (name, icon, color, order_index, target_station, show_in_pos) VALUES (?,?,?,?,?,1)", cat)
        cat_ids[cat[0]] = c.lastrowid

    # Products
    prods = [
        ("Espresso (Double)", cat_ids["Sıcak Kahveler"], 80.0, "bar", 10, "Etiyopya Yirgacheffe çekirdekleri"),
        ("Americano", cat_ids["Sıcak Kahveler"], 95.0, "bar", 10, "Double shot espresso ve sıcak su"),
        ("Flat White", cat_ids["Sıcak Kahveler"], 115.0, "bar", 10, "Ristretto shot ve mikro köpüklü taze süt"),
        ("Caffe Latte", cat_ids["Sıcak Kahveler"], 110.0, "bar", 10, "Espresso ve buharlanmış barista sütü"),
        ("Cortado", cat_ids["Sıcak Kahveler"], 105.0, "bar", 10, "Eşit oranda espresso ve süt"),
        ("Cold Brew (18 Saat)", cat_ids["Soğuk & Demleme Kahveler"], 120.0, "bar", 10, "18 saat soğuk damıtılmış kahve"),
        ("Iced Latte", cat_ids["Soğuk & Demleme Kahveler"], 120.0, "bar", 10, "Buzlu espresso ve taze süt"),
        ("V60 Chemex Demleme", cat_ids["Soğuk & Demleme Kahveler"], 135.0, "bar", 10, "Seçkili single origin filtre kahve"),
        ("Tereyağlı Kruvasan", cat_ids["Fırın & Tatlılar"], 95.0, "pastry", 10, "Fransız tereyağlı çıtır kruvasan"),
        ("Bademli Kruvasan", cat_ids["Fırın & Tatlılar"], 130.0, "pastry", 10, "Badem kremalı ve file bademli"),
        ("San Sebastian Cheesecake", cat_ids["Fırın & Tatlılar"], 160.0, "pastry", 10, "Akışkan Belçika çikolatalı sos ile"),
        ("Double Chocolate Cookie", cat_ids["Fırın & Tatlılar"], 85.0, "pastry", 10, "Callebaut çikolata parçacıklı"),
        ("Avokado & Poşe Yumurta Toast", cat_ids["Sandviç & Kahvaltı"], 190.0, "kitchen", 10, "Ekşi maya ekmek üzeri ezilmiş avokado ve poşe yumurta"),
        ("Füme Etli Kruvasan Sandviç", cat_ids["Sandviç & Kahvaltı"], 180.0, "kitchen", 10, "Dana füme et, gouda peyniri, roka")
    ]
    for p in prods:
        c.execute("INSERT INTO products (name, category_id, base_price, station, vat_rate, description, is_available, show_in_pos) VALUES (?,?,?,?,?,?,1,1)", p)

    c.execute("INSERT INTO cash_registers (status, opening_float, opened_by) VALUES ('open', 1500.0, 'Ece Barista')")

    conn.commit()
    conn.close()
    print("Roast & Brew DB seeded successfully!")


# ==========================================
# 3. SEED ETILER STEAK & LOUNGE
# ==========================================
def seed_etiler_steak():
    db_path = create_tenant_db_from_schema("etiler-steak")
    conn = sqlite3.connect(db_path)
    c = conn.cursor()

    staff = [
        ("Cemil Demir (Müdür)", "etiler_admin", hash_password("123456"), "4001", "manager", 4, 1),
        ("Burak Şef (Head Chef)", "etiler_chef", hash_password("123456"), "4002", "chef", 4, 1),
    ]
    for s in staff:
        c.execute("INSERT INTO staff_users (name, username, password_hash, pin_code, role, restaurant_id, is_active, created_at) VALUES (?,?,?,?,?,?,?,datetime('now'))", s)

    settings = {
        "restaurant_name": "Etiler Steak & Lounge",
        "company_title": "Etiler Et ve Restorancılık San. Tic. A.Ş.",
        "phone": "+90 212 345 67 89",
        "address": "Nisbetiye Cad. No:45 Etiler / Beşiktaş / İstanbul",
        "tax_office": "Zincirlikuyu",
        "tax_number": "5647382910",
        "currency": "₺",
        "enable_kuver": True,
        "default_kuver_price": 75.0,
        "service_fee_rate": 12.0,
    }
    for k, v in settings.items():
        c.execute("INSERT INTO restaurant_settings (key, value) VALUES (?, ?)", (k, json.dumps(v)))

    # Areas
    c.execute("INSERT INTO areas (name, order_index) VALUES ('Steak Salonu', 0)")
    a_id = c.lastrowid
    c.execute("INSERT INTO areas (name, order_index) VALUES ('VIP Mahzen', 1)")
    v_id = c.lastrowid

    for i in range(1, 7):
        c.execute("INSERT INTO tables (name, area_id, seats, x, y, status) VALUES (?,?,?,?,?,'empty')", (f"S-{i}", a_id, 4, 100.0 + (i%3)*150.0, 100.0 + (i//3)*150.0))
    for i in range(1, 3):
        c.execute("INSERT INTO tables (name, area_id, seats, x, y, status) VALUES (?,?,?,?,?,'empty')", (f"VIP-{i}", v_id, 8, 150.0*i, 120.0))

    # Categories
    c.execute("INSERT INTO categories (name, icon, color, order_index, target_station, show_in_pos) VALUES ('Dry Aged Steakler', 'Beef', '#dc2626', 0, 'grill', 1)")
    cat_steak = c.lastrowid
    c.execute("INSERT INTO categories (name, icon, color, order_index, target_station, show_in_pos) VALUES ('Başlangıç & Şarküteri', 'Salad', '#b45309', 1, 'kitchen', 1)")
    cat_starters = c.lastrowid

    prods = [
        ("Dallas Steak (500gr)", cat_steak, 850.0, "grill", 10, "28 gün dinlendirilmiş kemikli antrikot"),
        ("Tomahawk Steak (900gr)", cat_steak, 1450.0, "grill", 10, "Özel marinasyonlu dev antrikot"),
        ("Dana Lokum (250gr)", cat_steak, 650.0, "grill", 10, "Dilimlenmiş pamuk kıvamında bonfile"),
        ("T-Bone Steak (450gr)", cat_steak, 820.0, "grill", 10, "Antrikot ve bonfile bir arada"),
        ("Dana Carpaccio", cat_starters, 340.0, "kitchen", 10, "Roka, parmesan ve trüf yağı"),
        ("Fırın Kemik İliği", cat_starters, 280.0, "kitchen", 10, "Kızarmış ekşi maya ekmekle")
    ]
    for p in prods:
        c.execute("INSERT INTO products (name, category_id, base_price, station, vat_rate, description, is_available, show_in_pos) VALUES (?,?,?,?,?,?,1,1)", p)

    c.execute("INSERT INTO cash_registers (status, opening_float, opened_by) VALUES ('open', 5000.0, 'Kasiyer')")

    conn.commit()
    conn.close()
    print("Etiler Steak DB seeded successfully!")

if __name__ == "__main__":
    seed_moda_meyhane()
    seed_roast_brew()
    seed_etiler_steak()
    print("All standalone tenant databases created & seeded!")
