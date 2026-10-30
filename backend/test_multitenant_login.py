import urllib.request
import urllib.error
import json

BASE_URL = "http://127.0.0.1:8000/api/auth/login"

def try_login(restaurant_code, password):
    payload = json.dumps({"username": restaurant_code, "password": password}).encode("utf-8")
    req = urllib.request.Request(BASE_URL, data=payload, headers={"Content-Type": "application/json"})
    try:
        res = urllib.request.urlopen(req)
        data = json.loads(res.read().decode("utf-8"))
        user = data.get("user", {})
        rest = data.get("restaurant", {})
        return {
            "status": res.getcode(),
            "user_name": user.get("name"),
            "user_role": user.get("role"),
            "restaurant_name": rest.get("name"),
            "restaurant_code": rest.get("code")
        }
    except urllib.error.HTTPError as e:
        err_body = json.loads(e.read().decode("utf-8"))
        return {
            "status": e.code,
            "detail": err_body.get("detail")
        }

def run_tests():
    tests = [
        ("boncore-kadikoy", "123456", "Mudur Sifresi"),
        ("boncore-kadikoy", "1234", "Mudur PIN"),
        ("boncore-kadikoy", "2222", "Kasiyer PIN"),
        ("boncore-kadikoy", "9999", "Garson PIN"),
        ("boncore-kadikoy", "3333", "Sef PIN"),
        ("moda-meyhane", "2001", "Moda Meyhane Mudur PIN"),
        ("moda-meyhane", "2002", "Moda Meyhane Kasiyer PIN"),
        ("moda-meyhane", "2003", "Moda Meyhane Garson PIN"),
        ("boncore-kadikoy", "0000", "Hatali Sifre"),
        ("olmayan-restoran", "1234", "Olmayan Restoran"),
    ]

    print("=== MULTI-TENANT LOGIN TESTS ===")
    for r_code, pwd, label in tests:
        res = try_login(r_code, pwd)
        if res["status"] == 200:
            u_name = str(res['user_name']).encode('ascii', 'replace').decode('ascii')
            r_name = str(res['restaurant_name']).encode('ascii', 'replace').decode('ascii')
            print(f"[OK] [{label}] Restoran: {r_name} ({res['restaurant_code']}) -> User: {u_name} (Role: {res['user_role']})")
        else:
            detail = str(res['detail']).encode('ascii', 'replace').decode('ascii')
            print(f"[ERR] [{label}] HTTP {res['status']}: {detail}")

if __name__ == "__main__":
    # Ensure stats endpoint hit to trigger any seeding
    try:
        urllib.request.urlopen("http://127.0.0.1:8000/api/master/stats")
    except:
        pass
    run_tests()
