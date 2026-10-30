import urllib.request
import json

BASE_URL = "http://127.0.0.1:8000/api"

def test_cookie_and_header():
    # 1. Login to Moda Meyhane
    req = urllib.request.Request(
        f"{BASE_URL}/auth/login",
        data=json.dumps({"username": "moda-meyhane", "password": "123456"}).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        cookies = resp.headers.get_all("Set-Cookie")
        cookie_header = "; ".join([c.split(";")[0] for c in cookies])
        data = json.loads(resp.read().decode("utf-8"))
        print("[OK] Login returned cookies:", cookie_header)
        token = data["access_token"]

    # 2. Test call with COOKIE ONLY (Simulating a fetch call that forgot custom headers!)
    req_cookie_only = urllib.request.Request(
        f"{BASE_URL}/tables/areas",
        headers={"Cookie": cookie_header}
    )
    with urllib.request.urlopen(req_cookie_only) as resp:
        areas = json.loads(resp.read().decode("utf-8"))
        area_names = [a["name"] for a in areas]
        ascii_names = [a.encode('ascii', 'replace').decode('ascii') for a in area_names]
        print("[OK] /tables/areas with COOKIE ONLY returned:", ascii_names)
        assert any("Meyhane" in a for a in area_names), f"Expected Meyhane Salonu, got {area_names}"
        print("[SUCCESS] Cookie resolution successfully routes to moda-meyhane.db!")

    # 3. Test call with HEADER ONLY
    req_header_only = urllib.request.Request(
        f"{BASE_URL}/products/categories",
        headers={"X-Restaurant-Code": "moda-meyhane"}
    )
    with urllib.request.urlopen(req_header_only) as resp:
        cats = json.loads(resp.read().decode("utf-8"))
        cat_names = [c["name"] for c in cats]
        ascii_cats = [c.encode('ascii', 'replace').decode('ascii') for c in cat_names]
        print("[OK] /products/categories with X-Restaurant-Code returned:", ascii_cats)
        assert any("Meze" in c for c in cat_names), f"Expected Mezeler, got {cat_names}"
        print("[SUCCESS] Header resolution successfully routes to moda-meyhane.db!")

    print("\n>>> ALL TESTS PASSED! Browser requests with or without headers route to isolated DB! <<<")

if __name__ == "__main__":
    test_cookie_and_header()
