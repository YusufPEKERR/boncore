"""
Milestone 3 Independent Verification Script: Frontend React/TS Error Handling & Role Workflows
Validates:
  1. RootErrorBoundary in main.tsx and RootErrorBoundary.tsx existence
  2. Safeguarded .toFixed calls in MenuIntegrationOperations and CashierManagement
  3. Safe JSON.parse in AdisyoSettings
  4. API fetch interceptor resilience against 500/502/504 non-JSON responses
  5. npm test command registered and passing with 0 failures
  6. All 6 role workflows (Garson, Kasiyer, Mutfak, Yonetici, Admin, SuperAdmin) connecting to port 8000
"""

import os
import sys
import json
import urllib.request
import urllib.error
import subprocess

PASS_COUNT = 0
FAIL_COUNT = 0

def check(name, condition, details=""):
    global PASS_COUNT, FAIL_COUNT
    if condition:
        PASS_COUNT += 1
        print(f" [PASS] {name}")
    else:
        FAIL_COUNT += 1
        print(f"![FAIL] {name}: {details}")

def main():
    print("=" * 70)
    print(" RUNNING MILESTONE 3 FRONTEND AUDIT & VERIFICATION SUITE")
    print("=" * 70)

    base_dir = r"c:\Users\Administrator\Documents\BonCore\frontend"

    # 1. RootErrorBoundary
    root_eb_path = os.path.join(base_dir, "src", "components", "common", "RootErrorBoundary.tsx")
    check("RootErrorBoundary component exists", os.path.exists(root_eb_path))

    with open(root_eb_path, "r", encoding="utf-8") as f:
        eb_content = f.read()
    check("RootErrorBoundary implements getDerivedStateFromError", "getDerivedStateFromError" in eb_content)
    check("RootErrorBoundary renders branded recovery screen", "Bir Sorun Oluştu" in eb_content)
    check("RootErrorBoundary provides reload button", "Sayfayı Yenile" in eb_content)

    main_path = os.path.join(base_dir, "src", "main.tsx")
    with open(main_path, "r", encoding="utf-8") as f:
        main_content = f.read()
    check("main.tsx wraps App with RootErrorBoundary", "<RootErrorBoundary>" in main_content)
    check("main.tsx catches unhandledrejection", "unhandledrejection" in main_content)

    # 2. Safeguarded .toFixed calls
    menu_ops_path = os.path.join(base_dir, "src", "components", "integrations", "MenuIntegrationOperations.tsx")
    with open(menu_ops_path, "r", encoding="utf-8") as f:
        menu_content = f.read()
    check("MenuIntegrationOperations safeguards p.base_price with Number()", "Number(p.base_price" in menu_content)

    cashier_mgmt_path = os.path.join(base_dir, "src", "components", "cashier", "CashierManagement.tsx")
    with open(cashier_mgmt_path, "r", encoding="utf-8") as f:
        cashier_content = f.read()
    check("CashierManagement safeguards total_revenue with Number()", "Number(xReport?.total_revenue" in cashier_content)
    check("CashierManagement safeguards cash_in_drawer with Number()", "Number(xReport?.cash_in_drawer" in cashier_content)
    check("CashierManagement safeguards credit_card amount with Number()", "Number(xReport?.payment_breakdown?.credit_card?.amount" in cashier_content)
    check("CashierManagement safeguards total_expenses with Number()", "Number(xReport?.total_expenses" in cashier_content)

    # 3. Safe JSON.parse in AdisyoSettings
    settings_path = os.path.join(base_dir, "src", "components", "settings", "AdisyoSettings.tsx")
    with open(settings_path, "r", encoding="utf-8") as f:
        settings_content = f.read()
    check("AdisyoSettings wraps cachedDiscounts JSON.parse in try/catch", "try {\n          setDiscounts(JSON.parse(cachedDiscounts));" in settings_content or "setDiscounts(JSON.parse(cachedDiscounts));\n        } catch" in settings_content)

    # 4. API Fetch Interceptor
    api_path = os.path.join(base_dir, "src", "services", "api.ts")
    with open(api_path, "r", encoding="utf-8") as f:
        api_content = f.read()
    check("api.ts intercepts response.json()", "response.json = async function" in api_content)
    check("api.ts catches non-JSON HTML 500/502/504 errors", "is_non_json: true" in api_content)
    check("api.ts surfaces error toasts via boncore_toast event", "boncore_toast" in api_content)
    check("api.ts exports showToast helper", "export function showToast" in api_content)

    # 5. npm test script in package.json
    pkg_path = os.path.join(base_dir, "package.json")
    with open(pkg_path, "r", encoding="utf-8") as f:
        pkg_json = json.load(f)
    check("package.json defines 'test' script", "test" in pkg_json.get("scripts", {}))

    # Run npm test
    res = subprocess.run(["npm", "test"], cwd=base_dir, capture_output=True, text=True, shell=True)
    check("npm test runs and passes with 0 failures", res.returncode == 0, res.stderr or res.stdout)

    # 6. Verify All 6 Role Initial Views on Backend Port 8000
    roles = [
        {"role": "garson", "pin": "1111", "endpoint": "/api/tables/areas", "expected_key": None},
        {"role": "kasiyer", "pin": "2222", "endpoint": "/api/cashier/active-register", "expected_key": "status"},
        {"role": "mutfak", "pin": "3333", "endpoint": "/api/kds/orders?station=mutfak", "expected_key": None},
        {"role": "yonetici", "pin": "9999", "endpoint": "/api/orders/analytics/statistics?date_range=today", "expected_key": "status"},
        {"role": "admin", "pin": "0000", "endpoint": "/api/settings", "expected_key": "restaurant_name"}
    ]

    for r in roles:
        # PIN login
        req_data = json.dumps({"pin_code": r["pin"]}).encode()
        req = urllib.request.Request("http://127.0.0.1:8000/api/auth/login-pin", data=req_data, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read().decode())
                token = data.get("access_token")
                check(f"Role {r['role']} (PIN {r['pin']}) authenticates successfully", token is not None)
                
                # Role Initial API Fetch
                role_req = urllib.request.Request(
                    f"http://127.0.0.1:8000{r['endpoint']}",
                    headers={"Authorization": f"Bearer {token}", "X-Restaurant-Code": "fatihciftligi"}
                )
                with urllib.request.urlopen(role_req) as role_resp:
                    role_data = json.loads(role_resp.read().decode())
                    check(f"Role {r['role']} accesses {r['endpoint']} with HTTP 200", role_resp.status == 200)
        except Exception as e:
            check(f"Role {r['role']} operational workflow", False, str(e))

    # SuperAdmin Master Admin Login
    master_req_data = json.dumps({"username": "superadmin", "password": "masteradmin2026"}).encode()
    master_req = urllib.request.Request("http://127.0.0.1:8000/api/master/login", data=master_req_data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(master_req) as resp:
            data = json.loads(resp.read().decode())
            master_token = data.get("access_token")
            check("SuperAdmin authenticates against /api/master/login", master_token is not None)

            tenants_req = urllib.request.Request("http://127.0.0.1:8000/api/master/tenants", headers={"Authorization": f"Bearer {master_token}"})
            with urllib.request.urlopen(tenants_req) as t_resp:
                t_data = json.loads(t_resp.read().decode())
                check("SuperAdmin retrieves tenants list (/api/master/tenants)", t_resp.status == 200 and len(t_data) >= 1)
    except Exception as e:
        check("SuperAdmin master workflow", False, str(e))

    print("=" * 70)
    print(f" AUDIT RESULTS: {PASS_COUNT} PASSED, {FAIL_COUNT} FAILED")
    print("=" * 70)
    if FAIL_COUNT > 0:
        sys.exit(1)

if __name__ == "__main__":
    main()
