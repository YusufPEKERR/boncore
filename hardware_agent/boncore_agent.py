"""
BonCore Yerel Donanım Ajanı (Hardware Bridge Agent)
===================================================
Bu küçük ajan, restorandaki kasa bilgisayarında arka planda çalışır.
İnternetteki / buluttaki BonCore POS web sitesi ile dükkandaki yerel CAS CL-3000 terazisi
arasında yüksek hızlı köprü görevi görür.

Özellikler:
- Sıfır bağımlılık: Harici kütüphane (pip) gerektirmez, saf Python standart kütüphanesiyle çalışır.
- Port: 127.0.0.1:9099
- Chromium Private Network Access ve tam CORS uyumludur.
"""

import sys
import json
import socket
import re
import time
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

AGENT_PORT = 9099
AGENT_VERSION = "1.0.0"

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
    """
    CAS CL-3000 / CL-5000 ASCII format ayrıştırıcı.
    Örnekler:
    - 'ST,GS,+001.350kg' -> 1.350 Kg (Dengeli)
    - 'US,GS,+000.450kg' -> 0.450 Kg (Dengesiz)
    - '1.350 kg' -> 1.350 Kg
    """
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
    """
    Kasa bilgisayarının bağlı olduğu yerel ağdan CAS CL-3000 teraziye TCP soket açar.
    """
    sock = None
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        sock.connect((ip, port))

        # Önceden tamponda veri var mı kontrol et
        sock.setblocking(False)
        data = b""
        try:
            data = sock.recv(256)
        except (BlockingIOError, socket.error):
            pass
        sock.setblocking(True)
        sock.settimeout(timeout)

        # Sürekli akış yoksa CAS sorgusu gönder
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
                "error": f"CAS CL-3000 terazisine baglandi ({ip}:{port}) ancak kefede tartim tespit edilemedi. Kefeye et veya urun koyup tekrar deneyiniz."
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
            "port": port,
            "bridge": "BonCore Local Agent"
        }

    except socket.timeout:
        return {
            "success": False,
            "weight": 0.0,
            "error": f"Teraziden yanit zaman asimina ugradi ({ip}:{port}, {timeout}s). Terazinin acik ve ag kablosunun takili oldugundan emin olun."
        }
    except (ConnectionRefusedError, ConnectionResetError):
        return {
            "success": False,
            "weight": 0.0,
            "error": f"Terazi baglantiyi reddetti ({ip}:{port}). Port numarasini kontrol edin."
        }
    except OSError as e:
        return {
            "success": False,
            "weight": 0.0,
            "error": f"Teraziye ulasilamadi ({ip}:{port}): {e}. Terazi IP'sinin kasa bilgisayariyla ayni agda oldugundan emin olun."
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
            "message": f"CAS CL-3000 terazisine yerel agdan basariyla baglanildi ({ip}:{port}, {latency} ms)."
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

class HardwareAgentHandler(BaseHTTPRequestHandler):
    def _send_cors_headers(self, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        # Chrome Private Network Access desteği
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
                "local_pc_ip": get_local_ip(),
                "timestamp": datetime.now().isoformat()
            }
            self.wfile.write(json.dumps(resp).encode("utf-8"))
            return

        elif path == "/scale/weight":
            ip = query.get("ip", ["192.168.1.150"])[0].strip()
            port = int(query.get("port", [2004])[0])
            timeout = float(query.get("timeout", [2.5])[0])

            result = read_cas_from_local_network(ip, port, timeout)
            self._send_cors_headers(200)
            self.end_headers()
            self.wfile.write(json.dumps(result, ensure_ascii=False).encode("utf-8"))
            return

        elif path == "/scale/test":
            ip = query.get("ip", ["192.168.1.150"])[0].strip()
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
            self.wfile.write(json.dumps({"error": "Endpoint not found"}).encode("utf-8"))

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        content_length = int(self.headers.get("Content-Length", 0))
        body = {}
        if content_length > 0:
            try:
                body = json.loads(self.rfile.read(content_length).decode("utf-8"))
            except Exception:
                pass

        if path == "/scale/test":
            ip = body.get("ip_address", "192.168.1.150").strip()
            port = int(body.get("port", 2004))
            timeout = float(body.get("timeout", 2.0))
            result = test_local_connection(ip, port, timeout)
            self._send_cors_headers(200)
            self.end_headers()
            self.wfile.write(json.dumps(result, ensure_ascii=False).encode("utf-8"))
            return
        else:
            self._send_cors_headers(404)
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Endpoint not found"}).encode("utf-8"))

    def log_message(self, format, *args):
        # Konsolu temiz tutmak için sadece ağırlık okuma isteklerini yaz
        msg = format % args
        if "scale" in msg or "health" in msg:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def main():
    server_address = ("127.0.0.1", AGENT_PORT)
    httpd = HTTPServer(server_address, HardwareAgentHandler)
    local_ip = get_local_ip()

    print("=" * 65)
    print(f"  BONCORE YEREL DONANIM AJANI v{AGENT_VERSION}")
    print("=" * 65)
    print(f"  * Ajan Durumu: AKTIF VE DINLIYOR")
    print(f"  * Yerel Dinleme Adresi : http://127.0.0.1:{AGENT_PORT}")
    print(f"  * Kasa Bilgisayari IP'si: {local_ip}")
    print("  * Desteklenen Donanimlar: CAS CL-3000 / CL-5000 (Ethernet TCP/IP)")
    print("-" * 65)
    print("  Bu pencere acik oldugu surece, buluttaki BonCore POS")
    print("  dogrudan bu bilgisayarin agindaki teraziye erisecektir.")
    print("  (Kapatmak icin CTRL+C tusuna basabilirsiniz)")
    print("=" * 65)
    print()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nBonCore Donanim Ajani durduruldu.")
        sys.exit(0)

if __name__ == "__main__":
    main()
