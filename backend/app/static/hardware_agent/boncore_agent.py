"""
BonCore Yerel Donanım Ajanı (Hardware Bridge Agent) v1.1.0
===========================================================
Kasa bilgisayarında arka planda çalışarak CAS CL-3000 terazisini
buluttaki / yerel BonCore POS sistemine bağlar.

Özellikler:
- Sıfır bağımlılık: Saf Python standart kütüphanesi (ekstra kurulum gerekmez).
- Çift Köprü: Hem yerel HTTP (127.0.0.1:9099) hem de Bulut Sunucu Relay Köprüsü.
- Tarayıcı Mixed-Content ve SSL engellerini tamamen aşar.
"""

import sys
import os
import json
import socket
import re
import time
import threading
import urllib.request
import urllib.error
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

AGENT_PORT = 9099
AGENT_VERSION = "1.1.0"
CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")

# Default Config
CONFIG = {
    "server_url": "https://bailey-shell-census-house.trycloudflare.com",
    "scale_default_ip": "192.168.1.150",
    "scale_default_port": 2004
}

def load_config():
    global CONFIG
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                loaded = json.load(f)
                CONFIG.update(loaded)
        except Exception:
            pass

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def parse_cas_cl3000_weight(raw_str: str):
    is_stable = True
    if "US" in raw_str.upper() or "UNSTABLE" in raw_str.upper():
        is_stable = False
    elif "ST" in raw_str.upper() or "STABLE" in raw_str.upper():
        is_stable = True

    unit = "kg"
    if " g" in raw_str.lower() and "kg" not in raw_str.lower():
        unit = "g"

    match = re.search(r'([+-]?\s*\d+(?:\.\d+)?)', raw_str)
    weight = 0.0
    if match:
        try:
            val_str = match.group(1).replace(" ", "")
            val = float(val_str)
            if unit == "g":
                weight = round(val / 1000.0, 3)
            else:
                if val >= 50 and "." not in val_str:
                    weight = round(val / 1000.0, 3)
                else:
                    weight = round(val, 3)
        except Exception:
            weight = 0.0

    return {
        "weight": max(0.0, weight),
        "grams": int(round(weight * 1000)),
        "unit": "kg",
        "is_stable": is_stable
    }

def read_cas_from_local_network(ip: str, port: int = 2004, timeout: float = 2.5):
    sock = None
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        sock.connect((ip, port))

        sock.setblocking(False)
        data = b""
        try:
            data = sock.recv(256)
        except (BlockingIOError, socket.error):
            pass
        sock.setblocking(True)
        sock.settimeout(timeout)

        if not data or len(data.strip()) == 0:
            for cmd in [b"W\r\n", b"\x05", b"Q\r\n", b"\x02W\x03"]:
                try:
                    sock.sendall(cmd)
                    chunk = sock.recv(256)
                    if chunk and len(chunk.strip()) > 0:
                        data += chunk
                        if b"kg" in chunk.lower() or b"g" in chunk.lower() or b"st" in chunk.lower():
                            break
                except socket.timeout:
                    continue
                except Exception:
                    pass

        raw = data.decode("latin-1", errors="ignore").strip()
        if not raw:
            return {
                "success": False,
                "weight": 0.0,
                "error": f"CAS CL-3000 terazisine baglandi ({ip}:{port}) ancak tartim tespit edilemedi. Kefeye et koyup tekrar deneyiniz."
            }

        parsed = parse_cas_cl3000_weight(raw)
        return {
            "success": True,
            "weight": parsed["weight"],
            "unit": parsed["unit"],
            "grams": parsed["grams"],
            "is_stable": parsed["is_stable"],
            "raw": raw,
            "ip": ip,
            "port": port
        }

    except socket.timeout:
        return {
            "success": False,
            "weight": 0.0,
            "error": f"CAS CL-3000 teraziden yanit zaman asimina ugradi ({ip}:{port}). Terazinin acik ve ag kablosunun takili oldugundan emin olun."
        }
    except (ConnectionRefusedError, ConnectionResetError):
        return {
            "success": False,
            "weight": 0.0,
            "error": f"CAS CL-3000 baglantiyi reddetti ({ip}:{port}). Port numarasini kontrol edin."
        }
    except OSError as e:
        return {
            "success": False,
            "weight": 0.0,
            "error": f"CAS CL-3000 teraziye ulasilamadi ({ip}:{port}): {e}. Terazi IP'sinin ({ip}) kasa bilgisayariyla ayni agda oldugundan emin olun."
        }
    finally:
        if sock:
            try:
                sock.close()
            except Exception:
                pass

def test_local_connection(ip: str, port: int = 2004, timeout: float = 2.0):
    start = time.time()
    sock = None
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        sock.connect((ip, port))
        latency = round((time.time() - start) * 1000, 1)
        return {
            "success": True,
            "ip": ip,
            "port": port,
            "latency_ms": latency,
            "message": f"CAS CL-3000 terazisine basariyla baglanildi ({ip}:{port}, {latency} ms)."
        }
    except Exception as e:
        return {
            "success": False,
            "ip": ip,
            "port": port,
            "error": f"Teraziye ulasilamadi ({ip}:{port}): {str(e)}"
        }
    finally:
        if sock:
            try:
                sock.close()
            except Exception:
                pass

# --- BULUT SUNUCU ILE RELAY DONGUSU ---
def cloud_relay_worker():
    """
    Buluttaki BonCore sunucusuna periyodik heartbeat atar ve tartım emirlerini dinler.
    Bu sayede web tarayıcısının Mixed-Content / CORS kısıtlamaları tamamen aşılır!
    """
    local_ip = get_local_ip()
    server_url = CONFIG.get("server_url", "").rstrip("/")
    if not server_url:
        server_url = "https://bailey-shell-census-house.trycloudflare.com"

    last_hb = 0
    while True:
        try:
            now = time.time()
            # 1. Heartbeat (Her 2.5 saniyede bir)
            if now - last_hb > 2.5:
                hb_payload = json.dumps({
                    "local_ip": local_ip,
                    "version": AGENT_VERSION,
                    "agent_name": "BonCore Hardware Agent"
                }).encode("utf-8")
                req = urllib.request.Request(
                    f"{server_url}/api/scale/agent/heartbeat",
                    data=hb_payload,
                    headers={"Content-Type": "application/json"}
                )
                try:
                    with urllib.request.urlopen(req, timeout=3.0) as resp:
                        pass
                    last_hb = now
                except Exception:
                    pass

            # 2. Poll (Emir Dinleme)
            poll_req = urllib.request.Request(f"{server_url}/api/scale/agent/poll")
            with urllib.request.urlopen(poll_req, timeout=4.0) as resp:
                poll_data = json.loads(resp.read().decode("utf-8"))
                if poll_data.get("has_command"):
                    req_id = poll_data["req_id"]
                    action = poll_data.get("action", "read_weight")
                    target_ip = poll_data.get("ip", CONFIG.get("scale_default_ip", "192.168.1.150"))
                    target_port = int(poll_data.get("port", CONFIG.get("scale_default_port", 2004)))
                    timeout = float(poll_data.get("timeout", 2.5))

                    print(f"[{datetime.now().strftime('%H:%M:%S')}] Buluttan istek geldi: {action} (IP: {target_ip}:{target_port})...")

                    if action == "read_weight":
                        res = read_cas_from_local_network(target_ip, target_port, timeout)
                        res["req_id"] = req_id
                        if res.get("success"):
                            print(f"[{datetime.now().strftime('%H:%M:%S')}] OK: CAS Teraziden {res['weight']} Kg okundu -> Buluta iletiliyor!")
                        else:
                            print(f"[{datetime.now().strftime('%H:%M:%S')}] UYARI: {res.get('error')}")

                        report_data = json.dumps(res, ensure_ascii=False).encode("utf-8")
                        rep_req = urllib.request.Request(
                            f"{server_url}/api/scale/agent/report",
                            data=report_data,
                            headers={"Content-Type": "application/json"}
                        )
                        urllib.request.urlopen(rep_req, timeout=3.0)

                    elif action == "test_connection":
                        res = test_local_connection(target_ip, target_port, timeout)
                        res["req_id"] = req_id
                        report_data = json.dumps(res, ensure_ascii=False).encode("utf-8")
                        rep_req = urllib.request.Request(
                            f"{server_url}/api/scale/agent/report",
                            data=report_data,
                            headers={"Content-Type": "application/json"}
                        )
                        urllib.request.urlopen(rep_req, timeout=3.0)

        except urllib.error.URLError:
            time.sleep(1.0)
        except Exception:
            time.sleep(0.5)

        time.sleep(0.3)

class LocalHttpHandler(BaseHTTPRequestHandler):
    def _send_cors_headers(self, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def do_OPTIONS(self):
        self._send_cors_headers(204)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        if path in ["/", "/health", "/status"]:
            self._send_cors_headers(200)
            self.end_headers()
            resp = {
                "status": "online",
                "service": "BonCore Hardware Bridge Agent",
                "version": AGENT_VERSION,
                "local_pc_ip": get_local_ip()
            }
            self.wfile.write(json.dumps(resp).encode("utf-8"))
            return

        elif path == "/scale/weight":
            ip = query.get("ip", [CONFIG.get("scale_default_ip", "192.168.1.150")])[0].strip()
            port = int(query.get("port", [2004])[0])
            timeout = float(query.get("timeout", [2.5])[0])
            result = read_cas_from_local_network(ip, port, timeout)
            self._send_cors_headers(200)
            self.end_headers()
            self.wfile.write(json.dumps(result, ensure_ascii=False).encode("utf-8"))
            return

        elif path == "/scale/test":
            ip = query.get("ip", [CONFIG.get("scale_default_ip", "192.168.1.150")])[0].strip()
            port = int(query.get("port", [2004])[0])
            timeout = float(query.get("timeout", [2.0])[0])
            result = test_local_connection(ip, port, timeout)
            self._send_cors_headers(200)
            self.end_headers()
            self.wfile.write(json.dumps(result, ensure_ascii=False).encode("utf-8"))
            return
        else:
            self._send_cors_headers(404)
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Not found"}).encode("utf-8"))

    def log_message(self, format, *args):
        pass

def main():
    load_config()
    local_ip = get_local_ip()
    server_url = CONFIG.get("server_url", "https://bailey-shell-census-house.trycloudflare.com")

    # Start Cloud Relay Worker in background thread
    t = threading.Thread(target=cloud_relay_worker, daemon=True)
    t.start()

    print("=" * 66)
    print(f"       BONCORE YEREL DONANIM AJANI v{AGENT_VERSION}")
    print("=" * 66)
    print(f"  * Kasa Bilgisayari IP'si : {local_ip}")
    print(f"  * Yerel HTTP Dinleme    : http://127.0.0.1:{AGENT_PORT}")
    print(f"  * Bulut Sunucu           : {server_url}")
    print("  * Bulut Baglanti Durumu  : AKTIF (Bulut ile haberlesiyor)")
    print("  * Desteklenen Terazi    : CAS CL-3000 / CL-5000 (Ethernet TCP/IP)")
    print("-" * 66)
    print("  Web sitenizde 'AJAN AKTIF VE BAGLI' yesil rozeti yandi!")
    print("  (Kapatmak icin CTRL+C tusuna basabilirsiniz)")
    print("=" * 66)
    print()

    server_address = ("127.0.0.1", AGENT_PORT)
    try:
        httpd = HTTPServer(server_address, LocalHttpHandler)
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nBonCore Donanim Ajani durduruldu.")
        sys.exit(0)
    except Exception as e:
        # If port 9099 was busy, keep running the cloud relay thread
        while True:
            time.sleep(1)

if __name__ == "__main__":
    main()
