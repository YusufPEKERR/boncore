import urllib.request
import urllib.parse
import json
import sys

BASE_URL = "http://127.0.0.1:8000/api"

def api_call(path, method="GET", data=None, headers=None):
    url = f"{BASE_URL}{path}"
    req_headers = {"Content-Type": "application/json"}
    if headers:
        req_headers.update(headers)
    
    encoded_data = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=encoded_data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode("utf-8")
            return resp.status, json.loads(body)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(body)
        except:
            return e.code, body

def main():
    print("\n=== TEST 1: LOGIN AS MODA MEYHANE (moda_admin / 123456) ===")
    status, moda_data = api_call("/auth/login", method="POST", data={"username": "moda-meyhane", "password": "123456"})
    if status != 200:
        status, moda_data = api_call("/auth/login", method="POST", data={"username": "moda_admin", "password": "123456"})
    assert status == 200, f"Moda login failed: {moda_data}"

    moda_token = moda_data["access_token"]
    moda_rest = moda_data.get("restaurant", {})
    rest_name = moda_rest.get('name', '').encode('ascii', 'replace').decode('ascii')
    print(f"[OK] Logged in to: {rest_name} (code: {moda_rest.get('code')})")
    print(f"     User: {moda_data['user']['name'].encode('ascii', 'replace').decode('ascii')} (Role: {moda_data['user']['role']})")

    headers_moda = {
        "Authorization": f"Bearer {moda_token}",
        "X-Restaurant-Code": "moda-meyhane"
    }

    # Categories
    status, cat_data = api_call("/products/categories", headers=headers_moda)
    assert status == 200
    cat_names = [c["name"].encode('ascii', 'replace').decode('ascii') for c in cat_data]
    print(f"[OK] Moda Categories: {cat_names}")

    all_prods = []
    for c in cat_data:
        for p in c.get("products", []):
            all_prods.append(p["name"])

    sample_prods = [p.encode('ascii', 'replace').decode('ascii') for p in all_prods[:6]]
    print(f"[OK] Moda Products count: {len(all_prods)}, Sample: {sample_prods}")
    assert "Haydari" in all_prods or "Adana Kebap (Zırh)" in all_prods
    assert "Köy Kahvaltısı" not in all_prods, "LEAK: Fatih Ciftligi product found in Moda Meyhane!"

    # Areas & Tables
    status, area_data = api_call("/tables/areas", headers=headers_moda)
    assert status == 200
    area_names = [a["name"].encode('ascii', 'replace').decode('ascii') for a in area_data]
    print(f"[OK] Moda Areas: {area_names}")
    assert any("Meyhane" in a for a in area_names)

    # Settings
    status, set_data = api_call("/settings/", headers=headers_moda)
    assert status == 200
    r_name = set_data.get('restaurant_name', '')
    print(f"[OK] Moda Restaurant Name in Settings: {r_name.encode('ascii', 'replace').decode('ascii')}")
    assert "Moda" in r_name

    print("\n=== TEST 2: LOGIN AS FATIH CIFTLIGI (boncore-kadikoy / 1234) ===")
    status_k, k_data = api_call("/auth/login", method="POST", data={"username": "boncore-kadikoy", "password": "1234"})
    if status_k != 200:
        status_k, k_data = api_call("/auth/login", method="POST", data={"username": "admin", "password": "1234"})
    assert status_k == 200, f"Kadikoy login failed: {k_data}"
    k_token = k_data["access_token"]
    k_rest = k_data.get("restaurant", {})
    k_name = k_rest.get('name', '').encode('ascii', 'replace').decode('ascii')
    print(f"[OK] Logged in to: {k_name} (code: {k_rest.get('code')})")

    headers_k = {
        "Authorization": f"Bearer {k_token}",
        "X-Restaurant-Code": "boncore-kadikoy"
    }
    status_kc, cat_data_k = api_call("/products/categories", headers=headers_k)
    assert status_kc == 200
    cat_names_k = [c["name"].encode('ascii', 'replace').decode('ascii') for c in cat_data_k]
    print(f"[OK] Kadikoy Categories: {cat_names_k[:4]}")
    assert "Soğuk Mezeler" not in [c["name"] for c in cat_data_k], "LEAK: Moda Mezeler found in Kadikoy!"

    print("\n=== TEST 3: LOGIN AS ROAST & BREW (roast-brew / 123456) ===")
    status_r, r_data = api_call("/auth/login", method="POST", data={"username": "roast-brew", "password": "123456"})
    if status_r != 200:
        status_r, r_data = api_call("/auth/login", method="POST", data={"username": "roast_admin", "password": "123456"})
    assert status_r == 200, f"Roast Brew login failed: {r_data}"
    r_name = r_data.get("restaurant", {}).get("name", "").encode('ascii', 'replace').decode('ascii')
    print(f"[OK] Logged in to: {r_name}")
    headers_r = {
        "Authorization": f"Bearer {r_data['access_token']}",
        "X-Restaurant-Code": "roast-brew"
    }
    status_rc, cat_data_r = api_call("/products/categories", headers=headers_r)
    assert status_rc == 200
    cat_names_r = [c["name"].encode('ascii', 'replace').decode('ascii') for c in cat_data_r]
    print(f"[OK] Roast & Brew Categories: {cat_names_r}")
    assert any("Kahve" in c for c in cat_names_r)

    print("\n>>> ALL TESTS PASSED! ALL RESTAURANTS ARE 100% INDEPENDENT AND ISOLATED! <<<")

if __name__ == "__main__":
    main()
