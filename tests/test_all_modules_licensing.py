import requests
import json
import sys

BASE_URL = "http://localhost:8000"

def test_module_licensing_and_features():
    print("=== Testing 11-Module Licensing API ===")
    
    # 1. Fetch current features for tenant 1
    res = requests.get(f"{BASE_URL}/api/master/tenants/1/features")
    assert res.status_code == 200, f"Failed GET features: {res.status_code} {res.text}"
    features = res.json()
    print("Initial Tenant Features:", json.dumps(features, indent=2))
    
    expected_keys = [
        "feature_qr_menu", "feature_kds", "feature_delivery", "feature_integrations",
        "feature_e_invoice", "feature_stock_recipe", "feature_loyalty",
        "feature_hotel", "feature_kiosk", "feature_reservations", "feature_cost_profit"
    ]
    for k in expected_keys:
        assert k in features, f"Missing key in features: {k}"
    print("[PASS] All 11 module keys present in GET /api/master/tenants/1/features")
    
    # 2. Test "Select All Modules" (All True)
    all_true_payload = {k: True for k in expected_keys}
    res = requests.put(f"{BASE_URL}/api/master/tenants/1/features", json=all_true_payload)
    assert res.status_code == 200, f"Failed PUT all true: {res.status_code} {res.text}"
    updated = res.json()["tenant"]
    for k in expected_keys:
        assert updated[k] is True, f"Key {k} should be True, got {updated[k]}"
    print("[PASS] Successfully enabled ALL 11 modules via PUT /api/master/tenants/1/features")
    
    # 3. Verify via GET /api/modules/status for tenant
    res = requests.get(f"{BASE_URL}/api/modules/status", headers={"X-Tenant-Code": "fatihciftligi"})
    assert res.status_code == 200, f"Failed GET /api/modules/status: {res.status_code} {res.text}"
    mod_status = res.json()["features"]
    assert mod_status.get("hotel") is True, f"Hotel feature should be True: {mod_status}"
    assert mod_status.get("kiosk") is True, f"Kiosk feature should be True: {mod_status}"
    assert mod_status.get("reservations") is True, f"Reservations feature should be True: {mod_status}"
    assert mod_status.get("cost_profit") is True, f"CostProfit feature should be True: {mod_status}"
    print("[PASS] Verified /api/modules/status reflects hotel, kiosk, reservations, cost_profit")
    
    # 4. Test Selective Toggle (Disable Hotel & Kiosk)
    custom_payload = {
        "feature_hotel": False,
        "feature_kiosk": False
    }
    res = requests.put(f"{BASE_URL}/api/master/tenants/1/features", json=custom_payload)
    assert res.status_code == 200, f"Failed PUT selective: {res.status_code}"
    updated = res.json()["tenant"]
    assert updated["feature_hotel"] is False, "Hotel should be False"
    assert updated["feature_kiosk"] is False, "Kiosk should be False"
    assert updated["feature_reservations"] is True, "Reservations should remain True"
    
    # Re-enable all for normal operation
    requests.put(f"{BASE_URL}/api/master/tenants/1/features", json=all_true_payload)
    print("[PASS] Selective module toggle verified and re-enabled all modules")
    print("=== ALL TESTS PASSED SUCCESSFULLY! ===")

if __name__ == "__main__":
    try:
        test_module_licensing_and_features()
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
