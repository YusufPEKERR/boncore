import requests
import json
import sys

BASE_URL = "http://localhost:8000"

def test_licensed_modules_enforcement():
    print("=== Testing Licensed Modules Enforcement & Visibility ===")
    
    # 1. First, enable all features to establish baseline
    all_keys = [
        "feature_qr_menu", "feature_kds", "feature_delivery", "feature_integrations",
        "feature_e_invoice", "feature_stock_recipe", "feature_loyalty",
        "feature_hotel", "feature_kiosk", "feature_reservations", "feature_cost_profit"
    ]
    all_true = {k: True for k in all_keys}
    r = requests.put(f"{BASE_URL}/api/master/tenants/1/features", json=all_true)
    assert r.status_code == 200
    
    # Verify via /api/modules/status
    r = requests.get(f"{BASE_URL}/api/modules/status", headers={"X-Tenant-Code": "fatihciftligi"})
    assert r.status_code == 200
    feat = r.json()["features"]
    assert feat["hotel"] is True and feat["kiosk"] is True and feat["delivery"] is True
    print("[PASS] Baseline: All modules active in /api/modules/status")
    
    # 2. Simulate User removing Otel (hotel) and Kiosk (kiosk) from module licensing
    disable_payload = {
        "feature_hotel": False,
        "feature_kiosk": False,
        "feature_delivery": False
    }
    r = requests.put(f"{BASE_URL}/api/master/tenants/1/features", json=disable_payload)
    assert r.status_code == 200
    
    # 3. Check /api/modules/status returns false for disabled modules
    r = requests.get(f"{BASE_URL}/api/modules/status", headers={"X-Tenant-Code": "fatihciftligi"})
    assert r.status_code == 200
    feat = r.json()["features"]
    print("Disabled features check:", {
        "hotel": feat.get("hotel"),
        "kiosk": feat.get("kiosk"),
        "delivery": feat.get("delivery"),
        "reservations": feat.get("reservations")
    })
    assert feat["hotel"] is False, "Hotel module should be FALSE"
    assert feat["kiosk"] is False, "Kiosk module should be FALSE"
    assert feat["delivery"] is False, "Delivery module should be FALSE"
    assert feat["reservations"] is True, "Reservations should remain TRUE"
    print("[PASS] Backend correctly reflects disabled modules (hotel: False, kiosk: False, delivery: False)")
    
    # 4. Re-enable all modules
    r = requests.put(f"{BASE_URL}/api/master/tenants/1/features", json=all_true)
    assert r.status_code == 200
    r = requests.get(f"{BASE_URL}/api/modules/status", headers={"X-Tenant-Code": "fatihciftligi"})
    feat = r.json()["features"]
    assert feat["hotel"] is True and feat["kiosk"] is True and feat["delivery"] is True
    print("[PASS] Re-enabled all modules successfully")
    print("=== ALL LICENSED MODULES TESTS PASSED! ===")

if __name__ == "__main__":
    try:
        test_licensed_modules_enforcement()
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
