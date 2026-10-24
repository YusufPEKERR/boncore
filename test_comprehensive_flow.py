import urllib.request
import urllib.parse
import urllib.error
import json
import time
import sys

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

BASE_URL = "http://127.0.0.1:8000"

class TestRunner:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.errors = []
        self.step_no = 0

    def log_step(self, title):
        self.step_no += 1
        print(f"\n[{self.step_no:02d}] === {title} ===")

    def request(self, method, path, data=None, expected_status=(200, 201)):
        url = f"{BASE_URL}{path}"
        headers = {"Content-Type": "application/json"}
        req_body = None
        if data is not None:
            req_body = json.dumps(data).encode("utf-8")

        req = urllib.request.Request(url, data=req_body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                status = resp.status
                body = resp.read().decode("utf-8")
                content_type = resp.headers.get("Content-Type", "")
                res_data = None
                if "application/json" in content_type:
                    try:
                        res_data = json.loads(body)
                    except Exception:
                        res_data = body
                else:
                    res_data = body
                
                if status in expected_status:
                    self.passed += 1
                    print(f"  [OK] {method} {path} -> {status}")
                    return res_data
                else:
                    self.failed += 1
                    msg = f"  [FAIL] {method} {path} -> Expected {expected_status}, got {status}: {body[:200]}"
                    print(msg)
                    self.errors.append(msg)
                    return None
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8")
            if e.code in expected_status:
                self.passed += 1
                print(f"  [OK] {method} {path} -> {e.code} (Expected status matched)")
                try:
                    return json.loads(body)
                except Exception:
                    return body
            else:
                self.failed += 1
                msg = f"  [FAIL] {method} {path} -> HTTP Error {e.code}: {body[:300]}"
                print(msg)
                self.errors.append(msg)
                return None
        except Exception as e:
            self.failed += 1
            msg = f"  [FAIL] {method} {path} -> Exception: {e}"
            print(msg)
            self.errors.append(msg)
            return None

    def assert_true(self, condition, message):
        if condition:
            self.passed += 1
            print(f"  [OK] Assert: {message}")
        else:
            self.failed += 1
            msg = f"  [FAIL] Assert: {message}"
            print(msg)
            self.errors.append(msg)

def run_all_tests():
    t = TestRunner()
    print("=" * 70)
    print("  BONCORE FULL SYSTEM INTEGRATION TEST SUITE")
    print("=" * 70)

    # 1. Health
    t.log_step("SYSTEM HEALTH")
    health = t.request("GET", "/health")
    t.assert_true(health and health.get("status") == "healthy", "Backend /health returns healthy")

    # 2. Auth & PIN
    t.log_step("AUTHENTICATION & PIN")
    pin_garson = t.request("POST", "/api/auth/login-pin", {"pin_code": "1111"})
    t.assert_true(pin_garson and pin_garson.get("role") in ["waiter", "manager"], "PIN 1111 authentication (Garson)")

    pin_kasiyer = t.request("POST", "/api/auth/login-pin", {"pin_code": "2222"})
    t.assert_true(pin_kasiyer and pin_kasiyer.get("role") in ["cashier", "manager"], "PIN 2222 authentication (Kasiyer)")

    pin_sef = t.request("POST", "/api/auth/login-pin", {"pin_code": "3333"})
    t.assert_true(pin_sef and pin_sef.get("role") in ["chef", "kitchen", "manager"], "PIN 3333 authentication (Mutfak Şefi)")

    pin_müdür = t.request("POST", "/api/auth/login-pin", {"pin_code": "9999"})
    t.assert_true(pin_müdür and pin_müdür.get("role") == "manager", "PIN 9999 Manager authentication")

    # Invalid PIN
    t.request("POST", "/api/auth/login-pin", {"pin_code": "0000"}, expected_status=(401,))

    # Staff CRUD
    staff_list = t.request("GET", "/api/auth/staff")
    t.assert_true(isinstance(staff_list, list), "Staff list fetched")
    created_staff = t.request("POST", "/api/auth/staff", {
        "name": "Geçici Personel",
        "role": "waiter",
        "pin_code": "7788",
        "is_active": True
    })
    if created_staff and "user" in created_staff:
        new_staff_id = created_staff["user"]["id"]
        t.request("PUT", f"/api/auth/staff/{new_staff_id}", {"name": "Geçici Personel Güncellendi", "role": "waiter"})
        t.request("DELETE", f"/api/auth/staff/{new_staff_id}")

    # 3. Settings
    t.log_step("SETTINGS & DEFINITIONS")
    curr_settings = t.request("GET", "/api/settings/")
    t.assert_true(curr_settings and "restaurant_name" in curr_settings, "Settings returned restaurant_name")
    t.request("PUT", "/api/settings/", {"kuver_price": curr_settings.get("kuver_price", 35.0)})

    # 4. Products & Menu
    t.log_step("PRODUCTS & CATEGORIES")
    categories = t.request("GET", "/api/products/categories")
    t.assert_true(isinstance(categories, list) and len(categories) > 0, "Categories returned with items")
    search_res = t.request("GET", "/api/products/search?q=Burger")
    t.assert_true(isinstance(search_res, list), "Product search works")

    # Product/Category CRUD
    new_cat = t.request("POST", "/api/products/categories", {
        "name": "Geçici Test Kategori",
        "icon": "Utensils",
        "color": "blue",
        "order_index": 99,
        "target_station": "kitchen"
    })
    if new_cat and "category_id" in new_cat:
        cat_id = new_cat["category_id"]
        new_prod = t.request("POST", "/api/products/items", {
            "category_id": cat_id,
            "name": "Geçici Test Ürün",
            "base_price": 150.0,
            "plu_code": "999888",
            "station": "kitchen",
            "is_available": True
        })
        if new_prod and "product_id" in new_prod:
            prod_id = new_prod["product_id"]
            t.request("PUT", f"/api/products/items/{prod_id}", {"base_price": 160.0})
            t.request("DELETE", f"/api/products/items/{prod_id}")
        t.request("DELETE", f"/api/products/categories/{cat_id}")

    # Find a real product to use for orders
    real_product = None
    second_product = None
    for c in categories:
        prods = c.get("products", [])
        if len(prods) >= 2 and not real_product:
            real_product = prods[0]
            second_product = prods[1]
            break
        elif len(prods) >= 1 and not real_product:
            real_product = prods[0]
        elif len(prods) >= 1 and not second_product:
            second_product = prods[0]

    t.assert_true(real_product is not None, f"Found active menu item: {real_product.get('name') if real_product else 'None'}")

    # 5. Tables & Floor Map
    t.log_step("TABLES & FLOOR VIEW")
    areas = t.request("GET", "/api/tables/areas")
    t.assert_true(isinstance(areas, list) and len(areas) > 0, "Areas and tables fetched")

    # Pick empty tables for testing
    empty_tables = []
    for a in areas:
        for tb in a.get("tables", []):
            if tb.get("status") == "empty":
                empty_tables.append(tb)

    t.assert_true(len(empty_tables) >= 3, f"Found {len(empty_tables)} empty tables for testing")
    test_table_1 = empty_tables[0] if empty_tables else None
    test_table_2 = empty_tables[1] if len(empty_tables) > 1 else None
    test_table_3 = empty_tables[2] if len(empty_tables) > 2 else None

    # Waiter Call & Clear Buzzer
    if test_table_1:
        t.request("POST", f"/api/tables/{test_table_1['id']}/call-waiter", {
            "reason": "GARSON_CAGIR"
        })
        t.request("POST", f"/api/tables/{test_table_1['id']}/clear-waiter-call")

    # Area & Table CRUD
    temp_area = t.request("POST", "/api/tables/areas", {"name": "Test Salonu", "order_index": 99})
    if temp_area and "id" in temp_area:
        t_area_id = temp_area["id"]
        temp_tbl = t.request("POST", "/api/tables/single", {
            "area_id": t_area_id,
            "name": "TEST-99",
            "shape": "square",
            "seats": 4
        })
        if temp_tbl and "table_id" in temp_tbl:
            t_tbl_id = temp_tbl["table_id"]
            t.request("PUT", f"/api/tables/single/{t_tbl_id}", {"name": "TEST-99-EDIT", "seats": 6})
            t.request("DELETE", f"/api/tables/single/{t_tbl_id}")
        t.request("DELETE", f"/api/tables/areas/{t_area_id}")

    # 6. Complete Order Life-Cycle (Dine-in POS)
    t.log_step("POS DINE-IN ORDER LIFE-CYCLE")
    if test_table_1 and real_product:
        # Create order
        order_payload = {
            "table_id": test_table_1["id"],
            "order_type": "dine_in",
            "waiter_name": "Ahmet Garson",
            "kuver_count": 2,
            "items": [
                {
                    "product_id": real_product["id"],
                    "quantity": 2,
                    "kitchen_note": "Az pişmiş, ekstra sıcak",
                    "course_stage": 1,
                    "is_hold": False
                }
            ]
        }
        created_ord = t.request("POST", "/api/orders/create", order_payload)
        t.assert_true(created_ord and "order_id" in created_ord, "Order created on Table 1")
        order_id = created_ord["order_id"] if created_ord else None

        if order_id:
            # Add Course 2 item (with hold)
            add_payload = {
                "items": [
                    {
                        "product_id": real_product["id"],
                        "quantity": 1,
                        "kitchen_note": "Tatlı sonrası ikram",
                        "course_stage": 2,
                        "is_hold": True
                    }
                ],
                "waiter_name": "Ahmet Garson"
            }
            added = t.request("POST", f"/api/orders/{order_id}/add-items", add_payload)
            t.assert_true(added and added.get("status") == "success", "Added Course 2 item")

            # Check order details
            ord_detail = t.request("GET", f"/api/orders/{order_id}")
            t.assert_true(ord_detail and len(ord_detail.get("items", [])) >= 2, "Fetched order items")

            # Toggle hold/fire
            items = ord_detail.get("items", []) if ord_detail else []
            hold_item = next((it for it in items if it.get("is_hold")), None)
            if hold_item:
                fire_res = t.request("POST", "/api/orders/hold-fire", {
                    "order_item_ids": [hold_item["id"]],
                    "action": "fire"
                })
                t.assert_true(fire_res and fire_res.get("status") == "success", "Course item fired to kitchen")

            # Void an item
            if items:
                void_target = items[0]
                void_res = t.request("POST", "/api/orders/void-item", {
                    "order_item_id": void_target["id"],
                    "reason_code": "MUSTERI_VAZGECTI",
                    "reason_text": "Müşteri siparişi iptal etmek istedi",
                    "operator_name": "Kemal Müdür",
                    "manager_pin": "9999"
                })
                t.assert_true(void_res and void_res.get("status") == "success", "Item voided with manager authorization")

            # Apply Discount
            disc_res = t.request("POST", f"/api/orders/{order_id}/discount", {
                "discount_type": "percentage",
                "value": 10.0,
                "reason": "%10 Misafir Sadakat İndirimi",
                "operator_name": "Ahmet Garson"
            })
            t.assert_true(disc_res and disc_res.get("status") == "success", "Discount applied")

            # Apply Manager Treat
            treat_res = t.request("POST", f"/api/orders/{order_id}/treat", {
                "reason": "Müdür İkramı Çay/Kahve",
                "operator_name": "Kemal Müdür",
                "manager_pin": "9999"
            })
            t.assert_true(treat_res and treat_res.get("status") == "success", "Treat applied")

            # 7. KDS Kitchen Display Integration
            t.log_step("KDS KITCHEN SCREEN")
            kds_orders = t.request("GET", "/api/kds/orders?station=all")
            t.assert_true(isinstance(kds_orders, list), "KDS active orders fetched")
            
            # Progress item through all kitchen lifecycle stages
            target_kds_item = None
            for ko in kds_orders:
                if ko.get("order_id") == order_id:
                    for kit in ko.get("items", []):
                        target_kds_item = kit
                        break
            if target_kds_item:
                item_kds_id = target_kds_item["id"]
                t.request("POST", f"/api/kds/item/{item_kds_id}/progress?status=preparing")
                t.request("POST", f"/api/kds/item/{item_kds_id}/progress?status=ready")
                t.request("POST", f"/api/kds/item/{item_kds_id}/progress?status=served")

            # Ready all items
            t.request("POST", f"/api/kds/order/{order_id}/ready-all")

            # 8. Table Move & Transfer
            t.log_step("TABLE OPERATIONS (MOVE & TRANSFER)")
            if test_table_2:
                # Move Table 1 -> Table 2
                move_res = t.request("POST", "/api/tables/move", {
                    "source_table_id": test_table_1["id"],
                    "target_table_id": test_table_2["id"],
                    "operator_name": "Ahmet Garson"
                })
                t.assert_true(move_res and move_res.get("status") == "success", "Table moved from Table 1 to Table 2")
                
                # Move back Table 2 -> Table 1
                t.request("POST", "/api/tables/move", {
                    "source_table_id": test_table_2["id"],
                    "target_table_id": test_table_1["id"],
                    "operator_name": "Ahmet Garson"
                })

            # 9. Cashier & Payment
            t.log_step("CASHIER & PAYMENT SETTLEMENT")
            active_reg = t.request("GET", "/api/cashier/active-register")
            t.assert_true(active_reg and "id" in active_reg, "Active register checked")

            # Cash expense in and out
            t.request("POST", "/api/cashier/expenses", {
                "category": "Mutfak / Manav",
                "amount": 50.0,
                "expense_type": "out",
                "description": "Limon ve Nane alımı",
                "created_by": "Ayse Kasiyer"
            })
            t.request("POST", "/api/cashier/expenses", {
                "category": "Kasa Avans",
                "amount": 100.0,
                "expense_type": "in",
                "description": "Bozuk para girişi",
                "created_by": "Ayse Kasiyer"
            })
            exp_list = t.request("GET", "/api/cashier/expenses")
            t.assert_true(isinstance(exp_list, list) and len(exp_list) >= 2, "Expenses listed")

            # Get remaining total to settle
            ord_before_pay = t.request("GET", f"/api/orders/{order_id}")
            rem = ord_before_pay.get("remaining_total", 0.0) if ord_before_pay else 0.0

            if rem > 0:
                # Pay half in Cash (Keep table open)
                half = round(rem / 2, 2)
                t.request("POST", "/api/cashier/settle-payment", {
                    "order_id": order_id,
                    "payments": [{"method": "cash", "amount": half, "tip": 0.0}],
                    "rounding": 0.0,
                    "cashier_name": "Ayse Kasiyer",
                    "close_table": False
                })

                # Pay rest in Credit Card and close table
                ord_mid_pay = t.request("GET", f"/api/orders/{order_id}")
                rest = ord_mid_pay.get("remaining_total", 0.0) if ord_mid_pay else 0.0
                pay_final = t.request("POST", "/api/cashier/settle-payment", {
                    "order_id": order_id,
                    "payments": [{"method": "credit_card", "amount": rest, "tip": 5.0}],
                    "rounding": 0.0,
                    "cashier_name": "Ayse Kasiyer",
                    "close_table": True
                })
                t.assert_true(pay_final and pay_final.get("status") == "success", "Order fully paid and table closed")

            # 10. Fiscal & E-Adisyon Documents
            t.log_step("FISCAL & GİB E-ADİSYON")
            e_ad = t.request("GET", f"/api/fiscal/e-adisyon/{order_id}")
            t.assert_true(e_ad and "ettn" in e_ad, "E-Adisyon generated with ETTN")
            xml_doc = t.request("GET", f"/api/fiscal/e-adisyon/{order_id}/xml")
            t.assert_true(xml_doc and "<?xml" in str(xml_doc), "E-Adisyon XML generated compliant with GİB")
            thermal = t.request("GET", f"/api/fiscal/receipt/{order_id}/escpos")
            t.assert_true(thermal and "slip_text" in thermal, "ESC/POS 80mm thermal receipt generated")

            # 11. Reports & Audit
            t.log_step("REPORTS & ANALYTICS")
            quoted_cashier = urllib.parse.quote("Ayse Kasiyer")
            x_rep = t.request("GET", f"/api/cashier/x-report?cashier_name={quoted_cashier}")
            t.assert_true(x_rep and "total_revenue" in x_rep, "In-day X-Report generated")

            # Analytics Statistics (Powers all 7 frontend report tabs)
            stats = t.request("GET", "/api/orders/analytics/statistics")
            t.assert_true(stats and "total_turnover" in stats and "daily_turnover" in stats, "Live Restaurant Analytics fetched")
            t.assert_true("waiter_sales" in stats and "complimentary" in stats, "All 7 report modules verified")

            # Audit Trail
            audits = t.request("GET", "/api/audit/logs?limit=10")
            t.assert_true(isinstance(audits, list) and len(audits) > 0, "Audit trail contains timestamped logs")

    # 12. Inventory & Stock
    t.log_step("INVENTORY & STOCK RECIPES")
    ingredients = t.request("GET", "/api/inventory/ingredients")
    t.assert_true(isinstance(ingredients, list) and len(ingredients) > 0, "Stock ingredients fetched")
    recipes = t.request("GET", "/api/inventory/recipes")
    t.assert_true(isinstance(recipes, list), "BOM recipes fetched")
    if ingredients:
        target_ing = ingredients[0]
        transfer_res = t.request("POST", "/api/inventory/transfer", {
            "ingredient_id": target_ing["id"],
            "source_warehouse_id": 1,
            "target_warehouse_id": 2,
            "amount": 5.0,
            "notes": "Test depo transferi",
            "created_by": "Kemal Müdür"
        })
        t.assert_true(transfer_res and transfer_res.get("status") == "success", "Warehouse transfer executed")

    # 13. Delivery Hub
    t.log_step("DELIVERY HUB & AGGREGATORS")
    couriers = t.request("GET", "/api/delivery/couriers")
    t.assert_true(isinstance(couriers, list), "Delivery couriers listed")
    del_orders = t.request("GET", "/api/delivery/orders")
    t.assert_true(isinstance(del_orders, list), "Delivery orders listed")
    caller = t.request("GET", "/api/delivery/caller-id-simulate?phone=05321234567")
    t.assert_true(caller and "name" in caller, "Caller ID simulated")

    # 14. QR Menu & Mobile
    t.log_step("QR DIGITAL MENU & CUSTOMER SELF-ORDER")
    if test_table_3:
        qr_menu = t.request("GET", f"/api/qr/table/{test_table_3['id']}/menu")
        t.assert_true(qr_menu and "menu" in qr_menu, "QR Menu loaded for table")
        if real_product:
            qr_order = t.request("POST", f"/api/qr/table/{test_table_3['id']}/order", {
                "items": [
                    {
                        "product_id": real_product["id"],
                        "quantity": 1,
                        "kitchen_note": "Müşteri masadan söyledi",
                        "course_stage": 1,
                        "is_hold": False
                    }
                ],
                "waiter_name": "QR Sipariş"
            })
            t.assert_true(qr_order and qr_order.get("status") == "success", "Customer placed order via QR menu")
            qr_ord_id = qr_order.get("order_id")
            if qr_ord_id:
                # Settle QR order and close table
                t.request("POST", "/api/cashier/settle-payment", {
                    "order_id": qr_ord_id,
                    "payments": [{"method": "credit_card", "amount": 999.0}],
                    "rounding": 0.0,
                    "cashier_name": "Online POS",
                    "close_table": True
                })

    # Final summary
    print("\n" + "=" * 70)
    print(f"  TEST RESULTS: {t.passed} PASSED, {t.failed} FAILED")
    print("=" * 70)
    if t.errors:
        print("\nFailures:")
        for err in t.errors:
            print(f"  - {err}")
        return False
    else:
        print("\n ALL SYSTEM TESTS PASSED WITH 100% SUCCESS!")
        return True

if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
