import socket
import re
import logging
from typing import Dict, Any, Optional
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.models.setting import RestaurantSetting
from app.services.time_service import get_local_now

logger = logging.getLogger("boncore.scale")

DEFAULT_SCALE_CONFIG = {
    "enabled": True,
    "model": "CAS CL-3000",
    "connection_type": "ethernet",
    "ip_address": "192.168.1.150",
    "port": 2004,
    "timeout": 2.5,
    "demo_mode": False
}

async def get_scale_config(db: AsyncSession) -> Dict[str, Any]:
    """
    Get scale configuration from DB settings or fallback to default.
    """
    try:
        result = await db.execute(select(RestaurantSetting).filter(RestaurantSetting.key == "scale_config"))
        setting = result.scalars().first()
        if setting and setting.value:
            import json
            cfg = json.loads(setting.value)
            return {**DEFAULT_SCALE_CONFIG, **cfg}
    except Exception as e:
        logger.warning(f"Failed to load scale config from db: {e}")
    return DEFAULT_SCALE_CONFIG.copy()

async def save_scale_config(db: AsyncSession, new_cfg: Dict[str, Any]) -> Dict[str, Any]:
    """
    Save scale configuration to DB settings.
    """
    import json
    merged = {**DEFAULT_SCALE_CONFIG, **new_cfg}
    result = await db.execute(select(RestaurantSetting).filter(RestaurantSetting.key == "scale_config"))
    setting = result.scalars().first()
    if setting:
        setting.value = json.dumps(merged, ensure_ascii=False)
    else:
        setting = RestaurantSetting(key="scale_config", value=json.dumps(merged, ensure_ascii=False))
        db.add(setting)
    await db.commit()
    return merged

def sync_read_cas_cl3000(ip: str, port: int, timeout: float = 2.5) -> Dict[str, Any]:
    """
    Direct TCP socket communication with CAS CL-3000 / CL-5000 scale over Ethernet.
    CAS CL-3000 standard inquiry:
    1. Connects to TCP socket (ip, port).
    2. Sends inquiry commands: b'W\r\n' or b'\\x05' (ENQ) or b'Q\\r\\n'.
    3. Reads ASCII response string (e.g. 'ST,GS,+001.350kg\\r\\n').
    4. Parses stability and weight.
    """
    sock = None
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        sock.connect((ip, port))

        # First, try to read any continuous stream already in the buffer
        sock.setblocking(False)
        received_data = b""
        try:
            received_data = sock.recv(256)
        except (BlockingIOError, socket.error):
            pass
        sock.setblocking(True)
        sock.settimeout(timeout)

        # If nothing was streaming, send CAS inquiry commands
        if not received_data or len(received_data.strip()) == 0:
            # Standard CAS ENQ (0x05) and CAS CL 'W\r\n'
            for cmd in [b"W\r\n", b"\x05", b"Q\r\n", b"\x02W\x03"]:
                try:
                    sock.sendall(cmd)
                    chunk = sock.recv(256)
                    if chunk and len(chunk.strip()) > 0:
                        received_data += chunk
                        if b"kg" in chunk.lower() or b"g" in chunk.lower() or b"st" in chunk.lower():
                            break
                except socket.timeout:
                    continue
                except Exception:
                    pass

        raw_str = received_data.decode("latin-1", errors="ignore").strip()
        if not raw_str:
            return {
                "success": False,
                "error": f"CAS CL-3000 teraziye bağlandı ({ip}:{port}) ancak tartım verisi alınamadı. Terazinin kefesinde ürün olduğundan emin olun.",
                "raw": ""
            }

        # Parse CAS response
        parsed = parse_cas_weight_data(raw_str)
        return {
            "success": True,
            "weight": parsed["weight"],
            "unit": parsed["unit"],
            "grams": parsed["grams"],
            "is_stable": parsed["is_stable"],
            "raw": raw_str,
            "ip": ip,
            "port": port,
            "simulated": False,
            "timestamp": get_local_now().isoformat()
        }

    except socket.timeout:
        return {
            "success": False,
            "error": f"CAS CL-3000 teraziden yanıt zaman aşımına uğradı ({ip}:{port}, {timeout}s). Terazinin açık ve ağ kablosunun takılı olduğunu kontrol edin."
        }
    except (ConnectionRefusedError, ConnectionResetError):
        return {
            "success": False,
            "error": f"CAS CL-3000 terazisi bağlantıyı reddetti ({ip}:{port}). Port numarasının (varsayılan: 2004) terazide açık olduğunu kontrol edin."
        }
    except OSError as e:
        return {
            "success": False,
            "error": f"CAS CL-3000 terazisine ulaşılamadı ({ip}:{port}): {e}. Terazi IP'sinin doğru ve aynı yerel ağda olduğundan emin olun."
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"CAS CL-3000 terazi okuma hatası: {str(e)}"
        }
    finally:
        if sock:
            try:
                sock.close()
            except Exception:
                pass

def parse_cas_weight_data(raw: str) -> Dict[str, Any]:
    """
    Parses various CAS scale weight formats:
    - 'ST,GS,+001.350kg'
    - 'US,GS,+000.850kg'
    - 'ST,NT,+002.500kg'
    - '1.350 kg'
    - '+001.350'
    """
    is_stable = True
    if "US" in raw.upper() or "UNSTABLE" in raw.upper():
        is_stable = False
    elif "ST" in raw.upper() or "STABLE" in raw.upper():
        is_stable = True

    # Check for unit
    unit = "kg"
    if " g" in raw.lower() and "kg" not in raw.lower():
        unit = "g"

    # Regex search for numeric weight
    # Matches patterns like +001.350 or 1.350 or 850
    match = re.search(r'([+-]?\s*\d+(?:\.\d+)?)', raw)
    weight = 0.0
    if match:
        try:
            raw_num = match.group(1).replace(" ", "")
            val = float(raw_num)
            if unit == "g":
                weight = round(val / 1000.0, 3)
            else:
                # If number has no decimal and > 50, it is likely grams (e.g. 1350)
                if val >= 50 and "." not in raw_num:
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

def get_demo_weight() -> Dict[str, Any]:
    """
    Realistic demo weight generator when the physical scale is offline or in test mode.
    """
    import random
    # Choose realistic weights for meat/deli: 0.350, 0.480, 0.750, 1.250, 1.480, 2.100 kg
    samples = [0.340, 0.480, 0.650, 0.850, 1.150, 1.280, 1.450, 1.820, 2.150]
    w = random.choice(samples)
    return {
        "success": True,
        "weight": w,
        "unit": "kg",
        "grams": int(round(w * 1000)),
        "is_stable": True,
        "raw": f"ST,GS,+{w:07.3f}kg (DEMO SIMULASYON)",
        "ip": "DEMO-SIMULATOR",
        "port": 2004,
        "simulated": True,
        "timestamp": get_local_now().isoformat(),
        "message": f"Demo Simulasyon Modu: {w:.3f} Kg ({int(round(w*1000))} gr) uretildi."
    }

def test_tcp_connectivity(ip: str, port: int, timeout: float = 2.0) -> Dict[str, Any]:
    """
    Quick socket ping test to verify whether CAS CL-3000 IP and port are reachable.
    """
    start_time = datetime.now()
    sock = None
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        sock.connect((ip, port))
        elapsed_ms = (datetime.now() - start_time).total_seconds() * 1000
        return {
            "success": True,
            "ip": ip,
            "port": port,
            "latency_ms": round(elapsed_ms, 1),
            "message": f"CAS CL-3000 Ethernet soketine başarıyla bağlanıldı ({ip}:{port}, {elapsed_ms:.1f} ms)."
        }
    except socket.timeout:
        return {
            "success": False,
            "ip": ip,
            "port": port,
            "error": f"Zaman aşımı ({timeout} sn): {ip} IP adresindeki CAS CL-3000 teraziden yanıt alınamadı."
        }
    except (ConnectionRefusedError, ConnectionResetError):
        return {
            "success": False,
            "ip": ip,
            "port": port,
            "error": f"Bağlantı reddedildi: {ip} cihazı açık ancak {port} portu kapalı veya başka bir uygulama tarafından dinleniyor."
        }
    except OSError as e:
        return {
            "success": False,
            "ip": ip,
            "port": port,
            "error": f"Ağ hatası: {ip} adresine ulaşılamıyor. ({e})"
        }
    finally:
        if sock:
            try:
                sock.close()
            except Exception:
                pass
