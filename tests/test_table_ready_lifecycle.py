import requests
import sys

sys.stdout.reconfigure(encoding='utf-8')

BASE_URL = "http://127.0.0.1:8000"
HEADERS = {"X-Tenant-Code": "fatihciftligi"}

def test_table_ready_lifecycle():
    print("=== Testing Table Ready Lifecycle: Only Ready When All Items Are Ready ===")

    # 1. Fetch tables/areas to find a test table and a product
    res = requests.get(f"{BASE_URL}/api/tables/areas", headers=HEADERS)
    assert res.status_code == 200, f"Failed fetch areas: {res.text}"
    areas = res.json()
    assert len(areas) > 0, "No areas found"
    
    # Pick first available table
    table = None
    for area in areas:
        for t in area.get("tables", []):
            if t.get("status") == "empty":
                table = t
                break
        if table:
            break
            
    if not table:
        table = areas[0]["tables"][0]
        
    table_id = table["id"]
    print(f"[INFO] Using test table ID {table_id} ('{table['name']}')")

    # Fetch products from /api/products/categories
    cat_res = requests.get(f"{BASE_URL}/api/products/categories", headers=HEADERS)
    assert cat_res.status_code == 200, f"Failed fetch categories: {cat_res.text}"
    categories = cat_res.json()
    products = [p for c in categories for p in c.get("products", [])]
    assert len(products) >= 2, "Need at least 2 products for test"
    p1 = products[0]
    p2 = products[1]
    print(f"[INFO] Products: {p1['name']} (ID {p1['id']}), {p2['name']} (ID {p2['id']})")

    # Clean up any pre-existing open order on this table first
    if table.get("active_order"):
        old_order_id = table["active_order"]["id"]
        requests.post(f"{BASE_URL}/api/orders/{old_order_id}/cancel", headers=HEADERS)

    # 2. Step 1: Create an order with 2 items on the table
    order_payload = {
        "table_id": table_id,
        "order_type": "dine_in",
        "waiter_name": "Garson Test",
        "items": [
            {"product_id": p1["id"], "quantity": 1},
            {"product_id": p2["id"], "quantity": 1}
        ]
    }
    create_res = requests.post(f"{BASE_URL}/api/orders/create", json=order_payload, headers=HEADERS)
    assert create_res.status_code in [200, 201], f"Failed create order: {create_res.text}"
    order_data = create_res.json()
    order_id = order_data.get("id") or order_data.get("order_id")
    print(f"[PASS] Created Order ID {order_id} with 2 items")

    # Check areas: Table MUST NOT be ready (both items are preparing)
    areas_res = requests.get(f"{BASE_URL}/api/tables/areas", headers=HEADERS)
    target_table = next(t for a in areas_res.json() for t in a["tables"] if t["id"] == table_id)
    assert target_table.get("has_ready_items") is False, "Table must NOT be ready when items are preparing"
    print("[PASS] Verified: Table is NOT ready when newly entered order has preparing items")

    # Fetch KDS order items to get item IDs
    kds_res = requests.get(f"{BASE_URL}/api/kds/orders", headers=HEADERS)
    assert kds_res.status_code == 200
    kds_orders = kds_res.json()
    kds_order = next((o for o in kds_orders if o["order_no"] == order_data["order_no"] or o["order_id"] == order_id or o.get("id") == order_id), None)
    assert kds_order is not None, f"Order {order_id} not found in KDS"
    items = kds_order["items"]
    assert len(items) >= 2, f"Expected at least 2 items, got {len(items)}"
    item1_id = items[0]["id"]
    item2_id = items[1]["id"]

    # 3. Step 2: Mark ONLY Item 1 as 'ready' in KDS
    prog_res1 = requests.post(f"{BASE_URL}/api/kds/item/{item1_id}/progress?status=ready", headers=HEADERS)
    assert prog_res1.status_code == 200
    print(f"[PASS] Marked Item 1 ({items[0]['product_name']}) as 'ready'")

    # Check areas: Table MUST STILL NOT be ready because Item 2 is still preparing!
    areas_res = requests.get(f"{BASE_URL}/api/tables/areas", headers=HEADERS)
    target_table = next(t for a in areas_res.json() for t in a["tables"] if t["id"] == table_id)
    assert target_table.get("has_ready_items") is False, "Table must NOT be ready when only 1 of 2 items is ready!"
    print("[PASS] Verified: Table is NOT ready when only 1 item is ready and 1 item is still preparing")

    # 4. Step 3: Mark Item 2 as 'ready' in KDS (now ALL items are ready!)
    prog_res2 = requests.post(f"{BASE_URL}/api/kds/item/{item2_id}/progress?status=ready", headers=HEADERS)
    assert prog_res2.status_code == 200
    print(f"[PASS] Marked Item 2 ({items[1]['product_name']}) as 'ready'")

    # Check areas: NOW Table MUST be ready!
    areas_res = requests.get(f"{BASE_URL}/api/tables/areas", headers=HEADERS)
    target_table = next(t for a in areas_res.json() for t in a["tables"] if t["id"] == table_id)
    assert target_table.get("has_ready_items") is True, "Table MUST be ready when all items are ready!"
    print("[PASS] Verified: Table IS READY when ALL items are ready!")

    # 5. Step 4: User enters a NEW order / new item on this table (e.g. coffee / dessert)
    add_payload = {
        "table_id": table_id,
        "order_type": "dine_in",
        "waiter_name": "Garson Test",
        "items": [
            {"product_id": p1["id"], "quantity": 1}
        ]
    }
    add_res = requests.post(f"{BASE_URL}/api/orders/create", json=add_payload, headers=HEADERS)
    assert add_res.status_code in [200, 201]
    print("[PASS] Added a new item to the table")

    # Check areas: Table MUST IMMEDIATELY STOP BEING READY!
    areas_res = requests.get(f"{BASE_URL}/api/tables/areas", headers=HEADERS)
    target_table = next(t for a in areas_res.json() for t in a["tables"] if t["id"] == table_id)
    assert target_table.get("has_ready_items") is False, "Table MUST NOT be ready after entering a new order/item!"
    print("[PASS] Verified: Table immediately stops showing as ready when new order/item is entered!")

    # 6. Cleanup: cancel or close order to leave table empty
    requests.post(f"{BASE_URL}/api/orders/{order_id}/cancel", headers=HEADERS)
    print(f"[PASS] Cleaned up test order {order_id}")
    print("=== All tests passed successfully! ===")

if __name__ == "__main__":
    test_table_ready_lifecycle()
