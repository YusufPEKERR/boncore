import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.models.user import StaffUser
from app.models.table import Area, Table
from app.models.product import Category, Product, ProductVariant, ModifierGroup, ModifierOption, Ingredient, Recipe
from app.models.inventory import Warehouse, WarehouseStock
from app.models.delivery import Courier
from app.models.cashier import CashRegister

logger = logging.getLogger("boncore.seed")

async def seed_initial_data(db: AsyncSession):
    """
    Seeds initial rich realistic Turkish restaurant dataset if database is fresh.
    """
    user_check = await db.execute(select(StaffUser).limit(1))
    if user_check.scalar_one_or_none():
        logger.info("Database already seeded. Skipping initial data injection.")
        return

    logger.info("Seeding realistic restaurant dataset...")

    # 1. Staff Users & 4-digit PINs
    staff_members = [
        StaffUser(name="Ahmet Garson", pin_code="1111", role="waiter"),
        StaffUser(name="Ayşe Kasiyer", pin_code="2222", role="cashier"),
        StaffUser(name="Mehmet Şef", pin_code="3333", role="chef"),
        StaffUser(name="Kemal Müdür", pin_code="9999", role="manager"),
    ]
    db.add_all(staff_members)

    # 2. Warehouses
    warehouses = [
        Warehouse(name="Ana Depo (Merkez)", code="WH-MAIN", is_main=True),
        Warehouse(name="Mutfak Deposu", code="WH-KITCHEN", is_main=False),
        Warehouse(name="Bar Deposu", code="WH-BAR", is_main=False),
    ]
    db.add_all(warehouses)
    await db.flush()

    # 3. Ingredients (Hammaddeler)
    ingredients = [
        Ingredient(name="Dana & Kuzu Kıyma", unit="gr", cost_per_unit=0.45, current_stock=25000.0, min_stock_alert=3000.0, warehouse_id=2),
        Ingredient(name="Antrikot / Bonfile", unit="gr", cost_per_unit=0.75, current_stock=15000.0, min_stock_alert=2000.0, warehouse_id=2),
        Ingredient(name="Burger Ekmeği (Brioche)", unit="adet", cost_per_unit=12.0, current_stock=120.0, min_stock_alert=20.0, warehouse_id=2),
        Ingredient(name="Kaşar & Mozzarella Peyniri", unit="gr", cost_per_unit=0.28, current_stock=18000.0, min_stock_alert=2500.0, warehouse_id=2),
        Ingredient(name="Cheddar Peyniri", unit="gr", cost_per_unit=0.35, current_stock=8000.0, min_stock_alert=1000.0, warehouse_id=2),
        Ingredient(name="Domates & Sos Harcı", unit="gr", cost_per_unit=0.08, current_stock=30000.0, min_stock_alert=4000.0, warehouse_id=2),
        Ingredient(name="Tereyağı (Köy)", unit="gr", cost_per_unit=0.32, current_stock=10000.0, min_stock_alert=1500.0, warehouse_id=2),
        Ingredient(name="Patates (Kızartmalık)", unit="gr", cost_per_unit=0.05, current_stock=50000.0, min_stock_alert=8000.0, warehouse_id=2),
        Ingredient(name="Kahve Çekirdeği (Specialty)", unit="gr", cost_per_unit=0.60, current_stock=9000.0, min_stock_alert=1000.0, warehouse_id=3),
        Ingredient(name="Barista Sütü", unit="ml", cost_per_unit=0.03, current_stock=40000.0, min_stock_alert=5000.0, warehouse_id=3),
    ]
    db.add_all(ingredients)
    await db.flush()

    # 4. Areas & Floor Plan Tables
    areas_data = [
        ("Salon (İç Mekan)", 1, [
            ("S1", "square", 80.0, 80.0, 120.0, 120.0, 4),
            ("S2", "square", 240.0, 80.0, 120.0, 120.0, 4),
            ("S3", "rectangle", 400.0, 80.0, 180.0, 120.0, 6),
            ("S4", "round", 80.0, 240.0, 130.0, 130.0, 4),
            ("S5", "round", 240.0, 240.0, 130.0, 130.0, 4),
            ("S6", "rectangle", 400.0, 240.0, 200.0, 130.0, 8),
            ("BAR-1", "bar", 640.0, 80.0, 90.0, 90.0, 2),
            ("BAR-2", "bar", 640.0, 200.0, 90.0, 90.0, 2),
        ]),
        ("Bahçe (Açık Alan)", 2, [
            ("B1", "round", 80.0, 80.0, 130.0, 130.0, 4),
            ("B2", "round", 240.0, 80.0, 130.0, 130.0, 4),
            ("B3", "square", 400.0, 80.0, 120.0, 120.0, 4),
            ("B4", "rectangle", 120.0, 240.0, 180.0, 120.0, 6),
            ("B5", "rectangle", 340.0, 240.0, 180.0, 120.0, 6),
        ]),
        ("Teras (Manzara)", 3, [
            ("T1", "square", 80.0, 80.0, 120.0, 120.0, 2),
            ("T2", "square", 230.0, 80.0, 120.0, 120.0, 2),
            ("T3", "rectangle", 380.0, 80.0, 180.0, 120.0, 4),
            ("T4", "round", 160.0, 230.0, 140.0, 140.0, 5),
        ]),
        ("VIP & Loca", 4, [
            ("VIP-1", "rectangle", 100.0, 100.0, 240.0, 160.0, 10),
            ("VIP-2", "rectangle", 400.0, 100.0, 240.0, 160.0, 10),
        ])
    ]

    for a_name, order_idx, tables_list in areas_data:
        area = Area(name=a_name, order_index=order_idx)
        db.add(area)
        await db.flush()
        for t_name, shape, x, y, w, h, seats in tables_list:
            t = Table(
                area_id=area.id,
                name=t_name,
                shape=shape,
                x=x,
                y=y,
                width=w,
                height=h,
                seats=seats,
                status="empty"
            )
            db.add(t)

    # 5. Categories & Products
    cat_defs = [
        ("Başlangıçlar & Çorbalar", "Soup", "#f59e0b", 1, "kitchen"),
        ("Kebap & Izgaralar", "Flame", "#ef4444", 2, "kitchen"),
        ("Burger & Atıştırmalık", "Sandwich", "#f97316", 3, "kitchen"),
        ("Taş Fırın Pizza", "Pizza", "#84cc16", 4, "kitchen"),
        ("Tatlılar & Pastane", "Cake", "#ec4899", 5, "pastry"),
        ("Sıcak & Soğuk İçecekler", "Coffee", "#06b6d4", 6, "bar"),
        ("Kokteyl & Bar", "Wine", "#8b5cf6", 7, "bar"),
    ]

    cats = {}
    for c_name, icon, color, idx, station in cat_defs:
        cat = Category(name=c_name, icon=icon, color=color, order_index=idx, target_station=station)
        db.add(cat)
        await db.flush()
        cats[c_name] = cat

    # Products Definition
    # 5.1 Başlangıçlar
    corba = Product(
        category_id=cats["Başlangıçlar & Çorbalar"].id,
        name="Tereyağlı Süzme Mercimek Çorbası",
        description="Geleneksel mercimek çorbası, kızdırılmış köy tereyağı ve kıtır kruton ile.",
        base_price=120.0,
        plu_code="101",
        barcode="86900101",
        station="kitchen",
        calories=280,
        allergens=["Gluten", "Süt"],
        is_vegan=False,
    )
    db.add(corba)

    humus = Product(
        category_id=cats["Başlangıçlar & Çorbalar"].id,
        name="Sıcak Pastırmalı Humus",
        description="Fırınlanmış nohut ezmesi, tereyağında çevrilmiş Kayseri pastırması ve çam fıstığı.",
        base_price=240.0,
        plu_code="102",
        station="kitchen",
        calories=450,
        allergens=["Susam", "Fıstık"],
    )
    db.add(humus)

    # 5.2 Kebap & Izgara
    adana = Product(
        category_id=cats["Kebap & Izgaralar"].id,
        name="Zırh Kıyma Adana Kebap",
        description="Közlenmiş domates, biber, sumaklı soğan salatası ve tırnak pide ile.",
        base_price=390.0,
        plu_code="201",
        barcode="86900201",
        station="kitchen",
        calories=780,
        is_spicy=True,
    )
    db.add(adana)
    await db.flush()

    # Variants for Adana
    db.add_all([
        ProductVariant(product_id=adana.id, name="1 Porsiyon", price_delta=0.0, is_default=True),
        ProductVariant(product_id=adana.id, name="1.5 Porsiyon (Duble)", price_delta=180.0, is_default=False),
    ])
    # Modifier Group: Pişme & Garnitür
    mg_adana = ModifierGroup(product_id=adana.id, name="Pilav / Garnitür Seçimi", is_required=False, min_selection=0, max_selection=1)
    db.add(mg_adana)
    await db.flush()
    db.add_all([
        ModifierOption(group_id=mg_adana.id, name="Bulgur Pilavı", price=0.0),
        ModifierOption(group_id=mg_adana.id, name="Pirinç Pilavı", price=0.0),
        ModifierOption(group_id=mg_adana.id, name="Ekstra Lavaş", price=25.0),
    ])
    # Recipe for Adana
    db.add(Recipe(product_id=adana.id, ingredient_id=ingredients[0].id, amount=220.0, waste_percentage=15.0)) # 220g kıyma, %15 pişme firesi

    # Bonfile Lokum
    lokum = Product(
        category_id=cats["Kebap & Izgaralar"].id,
        name="Izgara Bonfile Lokum (250gr)",
        description="Dinlendirilmiş dana bonfile dilimleri, trüflü patates püresi ve ızgara kuşkonmaz.",
        base_price=680.0,
        plu_code="202",
        station="kitchen",
        calories=620,
    )
    db.add(lokum)
    await db.flush()
    mg_lokum = ModifierGroup(product_id=lokum.id, name="Pişme Derecesi", is_required=True, min_selection=1, max_selection=1)
    db.add(mg_lokum)
    await db.flush()
    db.add_all([
        ModifierOption(group_id=mg_lokum.id, name="Az Pişmiş (Rare)", price=0.0),
        ModifierOption(group_id=mg_lokum.id, name="Orta Pişmiş (Medium)", price=0.0),
        ModifierOption(group_id=mg_lokum.id, name="İyi Pişmiş (Well Done)", price=0.0),
    ])
    db.add(Recipe(product_id=lokum.id, ingredient_id=ingredients[1].id, amount=250.0, waste_percentage=10.0))

    # 5.3 Burger
    burger = Product(
        category_id=cats["Burger & Atıştırmalık"].id,
        name="BonCore Double Smash Burger",
        description="2x 90gr dana köfte, duble eritilmiş cheddar, karamelize soğan, gizli trüf sos ve patates kızartması.",
        base_price=360.0,
        plu_code="301",
        barcode="86900301",
        station="kitchen",
        calories=890,
        allergens=["Gluten", "Süt", "Yumurta"],
    )
    db.add(burger)
    await db.flush()
    mg_burger = ModifierGroup(product_id=burger.id, name="Ekstra Malzemeler", is_required=False, min_selection=0, max_selection=3)
    db.add(mg_burger)
    await db.flush()
    db.add_all([
        ModifierOption(group_id=mg_burger.id, name="Ekstra Cheddar Peyniri", price=35.0),
        ModifierOption(group_id=mg_burger.id, name="Dana Bacon", price=60.0),
        ModifierOption(group_id=mg_burger.id, name="Ekstra Smash Köfte (90gr)", price=95.0),
    ])
    # Recipes for burger
    db.add_all([
        Recipe(product_id=burger.id, ingredient_id=ingredients[0].id, amount=180.0, waste_percentage=12.0),
        Recipe(product_id=burger.id, ingredient_id=ingredients[2].id, amount=1.0, waste_percentage=0.0), # 1 adet ekmek
        Recipe(product_id=burger.id, ingredient_id=ingredients[4].id, amount=40.0, waste_percentage=0.0), # 40g cheddar
        Recipe(product_id=burger.id, ingredient_id=ingredients[7].id, amount=150.0, waste_percentage=5.0), # 150g patates
    ])

    # 5.4 Pizza
    pizza = Product(
        category_id=cats["Taş Fırın Pizza"].id,
        name="Napoli Margherita Pizza",
        description="San Marzano domates sosu, manda mozzarella, taze fesleğen ve sızma zeytinyağı.",
        base_price=320.0,
        plu_code="401",
        station="kitchen",
        calories=720,
        allergens=["Gluten", "Süt"],
    )
    db.add(pizza)
    await db.flush()
    db.add_all([
        ProductVariant(product_id=pizza.id, name="Orta Boy (28cm)", price_delta=0.0, is_default=True),
        ProductVariant(product_id=pizza.id, name="Büyük Boy (34cm)", price_delta=90.0, is_default=False),
    ])

    # 5.5 Tatlılar
    cheesecake = Product(
        category_id=cats["Tatlılar & Pastane"].id,
        name="San Sebastian Cheesecake",
        description="Akışkan kremamsı kıvam, sıcak Belçika çikolatası sosu ile servis edilir.",
        base_price=210.0,
        plu_code="501",
        station="pastry",
        calories=510,
        allergens=["Süt", "Yumurta"],
    )
    db.add(cheesecake)

    kunefe = Product(
        category_id=cats["Tatlılar & Pastane"].id,
        name="Özel Hatay Künefesi",
        description="Tuzsuz Antakya peyniri, çıtır kadayıf, Antep fıstığı ve Maraş kesme dondurma.",
        base_price=250.0,
        plu_code="502",
        station="pastry",
        calories=680,
        allergens=["Gluten", "Süt", "Fıstık"],
    )
    db.add(kunefe)

    # 5.6 İçecekler & Bar
    latte = Product(
        category_id=cats["Sıcak & Soğuk İçecekler"].id,
        name="Caffe Latte (Single Origin)",
        description="Taze çekilmiş espresso ve mikro köpüklü sıcak süt.",
        base_price=110.0,
        plu_code="601",
        station="bar",
        calories=140,
        allergens=["Süt"],
    )
    db.add(latte)
    await db.flush()
    db.add_all([
        Recipe(product_id=latte.id, ingredient_id=ingredients[8].id, amount=18.0, waste_percentage=0.0), # 18g kahve
        Recipe(product_id=latte.id, ingredient_id=ingredients[9].id, amount=220.0, waste_percentage=5.0), # 220ml süt
    ])

    ayran = Product(
        category_id=cats["Sıcak & Soğuk İçecekler"].id,
        name="Yayık Köpüklü Açık Ayran",
        description="Karakovan yayık ayranı, naneli ve köpüklü.",
        base_price=55.0,
        plu_code="602",
        station="bar",
        calories=80,
    )
    db.add(ayran)

    cocktail = Product(
        category_id=cats["Kokteyl & Bar"].id,
        name="Smoked Passion Mezcalita",
        description="Mezcal, çarkıfelek meyvesi püresi, taze lime, agave ve tütsü dumanı.",
        base_price=420.0,
        plu_code="701",
        station="bar",
        calories=220,
    )
    db.add(cocktail)

    # 6. Couriers
    couriers = [
        Courier(name="Burak Demir (Motor 1)", phone="0535 111 22 33", vehicle_plate="34 POS 01"),
        Courier(name="Can Kurtaran (Motor 2)", phone="0536 222 33 44", vehicle_plate="34 POS 02"),
    ]
    db.add_all(couriers)

    # 7. Initial Open Cash Register
    reg = CashRegister(
        status="open",
        opening_float=500.0,
        opened_by="Kemal Müdür",
    )
    db.add(reg)

    await db.commit()
    logger.info("Successfully seeded restaurant database with full menu, floor tables, recipes, and staff!")
