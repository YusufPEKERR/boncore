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
import struct
import re
import time
import threading
import urllib.request
import urllib.error
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

AGENT_PORT = 9099
AGENT_VERSION = "2.2.0"
EXE_DIR = os.path.dirname(os.path.abspath(sys.executable)) if getattr(sys, 'frozen', False) else os.path.dirname(os.path.abspath(__file__))
APPDATA_CONFIG_FILE = os.path.join(os.environ.get("APPDATA") or os.path.expanduser("~"), "BonCoreAgent", "config.json")
LOCAL_CONFIG_FILE = os.path.join(EXE_DIR, "config.json")

# Default Config
CONFIG = {
    "server_url": "http://77.67.29.77",
    "terminal_name": "Kasa 1",
    "scale_default_ip": "192.168.1.150",
    "scale_default_port": 2004
}

def load_config():
    global CONFIG
    for path in (APPDATA_CONFIG_FILE, LOCAL_CONFIG_FILE):
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
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

def encode_cas_cl_packet(opcode: bytes, address: int = 0, data: bytes = b"") -> bytes:
    buf = bytearray()
    buf.extend(opcode)
    buf.extend(struct.pack("<I", address))
    buf.append(ord(","))
    buf.extend(struct.pack("<H", len(data)))
    buf.append(ord(":"))
    buf.extend(data)
    buf.append(ord(":"))
    ck = sum(buf[2:]) % 256
    buf.append(ck)
    buf.append(0x0D)
    return bytes(buf)

def parse_cas_cl_response(raw_bytes: bytes):
    if not raw_bytes or len(raw_bytes) < 12:
        return None
    idx = raw_bytes.find(b"WN")
    if idx != -1 and len(raw_bytes) >= idx + 40:
        packet = raw_bytes[idx:]
        try:
            scale_id = struct.unpack("<I", packet[2:6])[0]
            data_len = struct.unpack("<H", packet[7:9])[0]
            status_data = packet[10:10+data_len]
            if len(status_data) >= 16:
                load_flag = status_data[0]
                stable_flag = status_data[1]
                unit_code = status_data[4]
                unit_str = "kg" if unit_code == 0 else "lb"
                dec_pt = status_data[5]
                divisor = float(10 ** dec_pt) if 1 <= dec_pt <= 4 else 1000.0
                weight_int = struct.unpack("<i", status_data[12:16])[0]
                weight_kg = round(weight_int / divisor, 3)
                return {
                    "found": True,
                    "weight": max(0.0, weight_kg),
                    "grams": int(round(weight_kg * 1000)),
                    "unit": unit_str,
                    "is_stable": (stable_flag == 1),
                    "load_flag": load_flag,
                    "scale_id": scale_id
                }
        except Exception:
            pass
    return None

def read_cas_from_local_network(ip: str, port: int = 2004, timeout: float = 2.5):
    sock = None
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        sock.connect((ip, port))

        sock.setblocking(False)
        data = b""
        try:
            data = sock.recv(512)
        except (BlockingIOError, socket.error):
            pass
        sock.setblocking(True)
        sock.settimeout(timeout)

        if not data or len(data.strip()) == 0:
            commands = [
                encode_cas_cl_packet(b"RN", 0),
                encode_cas_cl_packet(b"RN", 1),
                encode_cas_cl_packet(b"RN", 255),
                encode_cas_cl_packet(b"RV", 0),
                encode_cas_cl_packet(b"RV", 1),
                encode_cas_cl_packet(b"WN", 0),
                encode_cas_cl_packet(b"WN", 1),
                b"W\r\n",
                b"W\r",
                b"\x05",
                b"\x0200RC00\x03",
                b"\x0200W00\x03",
                b"\x02W\x03",
                b"Q\r\n",
                b"S\r\n"
            ]
            for cmd in commands:
                try:
                    sock.sendall(cmd)
                    time.sleep(0.06)
                    sock.settimeout(0.25)
                    chunk = sock.recv(512)
                    if chunk and len(chunk.strip()) > 0:
                        data += chunk
                        if b"WN" in chunk or b"kg" in chunk.lower() or b"g" in chunk.lower():
                            break
                except socket.timeout:
                    continue
                except Exception:
                    pass

        if data:
            cl_res = parse_cas_cl_response(data)
            if cl_res and cl_res.get("found"):
                return {
                    "success": True,
                    "weight": cl_res["weight"],
                    "unit": cl_res["unit"],
                    "grams": cl_res["grams"],
                    "is_stable": cl_res["is_stable"],
                    "raw": f"CAS-WN: {cl_res['weight']} {cl_res['unit']}",
                    "ip": ip,
                    "port": port
                }

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
    local_ip = get_local_ip()
    server_url = CONFIG.get("server_url", "").rstrip("/")
    if not server_url:
        server_url = "https://contributing-sustained-cure-posting.trycloudflare.com"

    restaurant_code = CONFIG.get("restaurant_code", "").strip()

    last_hb = 0
    connected_once = False

    while True:
        try:
            now = time.time()
            headers = {"Content-Type": "application/json"}
            if restaurant_code:
                headers["X-Restaurant-Code"] = restaurant_code

            # 1. Heartbeat (Her 2 saniyede bir)
            if now - last_hb > 2.0:
                hb_data = {
                    "local_ip": local_ip,
                    "version": AGENT_VERSION,
                    "agent_name": "BonCore Hardware Agent"
                }
                if restaurant_code:
                    hb_data["restaurant_code"] = restaurant_code

                hb_payload = json.dumps(hb_data).encode("utf-8")
                req = urllib.request.Request(
                    f"{server_url}/api/scale/agent/heartbeat",
                    data=hb_payload,
                    headers=headers
                )
                try:
                    with urllib.request.urlopen(req, timeout=3.0) as resp:
                        if not connected_once:
                            print(f"[{datetime.now().strftime('%H:%M:%S')}] >>> BULUT SUNUCUSUNA BAGLANDI! <<<")
                            print(f"[{datetime.now().strftime('%H:%M:%S')}] Sitede yesil isik yandi: AKTIF VE BAGLI")
                            connected_once = True
                    last_hb = now
                except urllib.error.URLError as err:
                    if connected_once or last_hb == 0:
                        print(f"[{datetime.now().strftime('%H:%M:%S')}] Sunucuya baglanilamiyor ({server_url}): {err.reason}. Tekrar deneniyor...")
                        connected_once = False
                    time.sleep(2.0)
                    continue

            # 2. Poll (Emir Dinleme)
            poll_url = f"{server_url}/api/scale/agent/poll"
            if restaurant_code:
                poll_url += f"?restaurant_code={urllib.parse.quote(restaurant_code)}"
            poll_req = urllib.request.Request(poll_url, headers=headers)
            with urllib.request.urlopen(poll_req, timeout=4.0) as resp:
                poll_data = json.loads(resp.read().decode("utf-8"))
                if poll_data.get("has_command"):
                    req_id = poll_data["req_id"]
                    action = poll_data.get("action", "read_weight")
                    target_ip = poll_data.get("ip", CONFIG.get("scale_default_ip", "192.168.1.150"))
                    target_port = int(poll_data.get("port", CONFIG.get("scale_default_port", 2004)))
                    timeout = float(poll_data.get("timeout", 2.5))

                    print(f"[{datetime.now().strftime('%H:%M:%S')}] Siteden tartim istegi alindi (Terazi: {target_ip}:{target_port})...")

                    if action == "read_weight":
                        res = read_cas_from_local_network(target_ip, target_port, timeout)
                        res["req_id"] = req_id
                        if restaurant_code:
                            res["restaurant_code"] = restaurant_code
                        if res.get("success"):
                            print(f"[{datetime.now().strftime('%H:%M:%S')}] OK: Teraziden {res['weight']} Kg okundu -> Siteye aktarildi!")
                        else:
                            print(f"[{datetime.now().strftime('%H:%M:%S')}] UYARI: {res.get('error')}")

                        report_data = json.dumps(res, ensure_ascii=False).encode("utf-8")
                        rep_req = urllib.request.Request(
                            f"{server_url}/api/scale/agent/report",
                            data=report_data,
                            headers=headers
                        )
                        urllib.request.urlopen(rep_req, timeout=3.0)

                    elif action == "test_connection":
                        res = test_local_connection(target_ip, target_port, timeout)
                        res["req_id"] = req_id
                        if restaurant_code:
                            res["restaurant_code"] = restaurant_code
                        report_data = json.dumps(res, ensure_ascii=False).encode("utf-8")
                        rep_req = urllib.request.Request(
                            f"{server_url}/api/scale/agent/report",
                            data=report_data,
                            headers=headers
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
    server_url = CONFIG.get("server_url", "https://contributing-sustained-cure-posting.trycloudflare.com")

    # Start Cloud Relay Worker in background thread
    t = threading.Thread(target=cloud_relay_worker, daemon=True)
    t.start()

    print("=" * 66)
    print(f"       BONCORE YEREL DONANIM AJANI v{AGENT_VERSION}")
    print("=" * 66)
    print(f"  * Kasa Bilgisayari IP'si : {local_ip}")
    print(f"  * Yerel HTTP Dinleme    : http://127.0.0.1:{AGENT_PORT}")
    print(f"  * Baglanilan Sunucu     : {server_url}")
    print("  * Desteklenen Terazi    : CAS CL-3000 / CL-5000 (Ethernet TCP/IP)")
    print("-" * 66)
    print("  Sunucu ile iletisim kuruluyor...")
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
        while True:
            time.sleep(1)

if __name__ == "__main__":
    main()
