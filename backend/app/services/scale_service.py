import socket
import struct
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

def encode_cas_cl_packet(opcode: bytes, address: int = 0, data: bytes = b"") -> bytes:
    """
    CAS CL-3000 / CL-5000 Resmi İletişim Protokolü Paket Kodlayıcı
    Header: Opcode (2B) + Address (4B LE) + ',' + Data Length (2B LE) + ':'
    Body: Data (Max 512B) + ':'
    Tail: Checksum (1B: Address[0]...':' % 0x100) + CR (0x0D)
    """
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

def parse_cas_cl_response(raw_bytes: bytes) -> Optional[Dict[str, Any]]:
    """
    CAS CL-3000 / CL-5000 Native Binary Status (WN) Paket Ayrıştırıcı
    Header: 'WN' + ScaleID (4B) + ',' + Length (2B) + ':'
    Data (30B):
      Offset 0: Load Flag (0:Zero, 1:Non-zero, 2:Overload)
      Offset 1: Stable Flag (0:Unstable, 1:Stable)
      Offset 2: Tare Flag (0:No tare, 1:Tare)
      Offset 3: Dual Range
      Offset 4: Weight Unit (0:kg)
      Offset 5: Weight Decimal Point (genelde 3)
      Offset 6: Price Decimal Point
      Offset 8..12: Tare (4B INT32U)
      Offset 12..16: Weight (4B INT32S - Signed 32-bit Integer)
      Offset 16..20: Unit Price
      Offset 20..24: Total Price
      Offset 24..28: PLU Number
      Offset 28..30: Dept Number
    """
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
                    "scale_id": scale_id,
                    "protocol": "CAS-CL-Native-Status (WN)"
                }
        except Exception as e:
            logger.warning(f"Error parsing CAS CL WN packet: {e}")

    return None

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
    Supports both native CAS CL binary protocol (RN status inquiry) and continuous ASCII stream.
    """
    sock = None
    all_chunks = []
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        sock.connect((ip, port))

        # 1. First, check continuous stream in socket buffer
        sock.settimeout(0.2)
        try:
            chunk = sock.recv(512)
            if chunk:
                all_chunks.append(chunk)
        except Exception:
            pass

        # 2. Native CAS CL-3000 Packets & ASCII Inquiries
        if not all_chunks:
            # Native CAS CL-3000 command packets (Status inquiry RN with Scale ID 0, 1, 255)
            cl_packets = [
                encode_cas_cl_packet(b"RN", 0),    # Status inquiry (Scale ID 0)
                encode_cas_cl_packet(b"RN", 1),    # Status inquiry (Scale ID 1 - default)
                encode_cas_cl_packet(b"RN", 255),  # Broadcast / any
                encode_cas_cl_packet(b"RV", 0),    # Version ping
                encode_cas_cl_packet(b"RV", 1),    # Version ping
                b"W\r\n",                          # ASCII CRLF
                b"W\r",                            # ASCII CR
                b"\x05",                           # ENQ
                b"\x0200RC00\x03",                 # Read Current
                b"\x0200W00\x03",                  # Read Weight
                b"\x02W\x03"                       # STX W ETX
            ]

            sock.settimeout(0.3)
            for pkt in cl_packets:
                try:
                    sock.sendall(pkt)
                    resp = sock.recv(512)
                    if resp and len(resp) > 0:
                        all_chunks.append(resp)
                        # Check if this response is a valid Status packet
                        cl_parsed = parse_cas_cl_response(resp)
                        if cl_parsed and cl_parsed.get("found"):
                            break
                        # Or if ASCII weight found
                        if b"kg" in resp.lower() or b"g" in resp.lower() or any(0x30 <= b <= 0x39 for b in resp):
                            break
                except Exception:
                    continue

        received_data = b"".join(all_chunks)
        raw_str = received_data.decode("latin-1", errors="ignore").strip()

        # 1. Native CAS CL WN kontrolü
        cl_parsed = parse_cas_cl_response(received_data)
        if cl_parsed and cl_parsed.get("found"):
            return {
                "success": True,
                "weight": cl_parsed["weight"],
                "unit": cl_parsed["unit"],
                "grams": cl_parsed["grams"],
                "is_stable": cl_parsed["is_stable"],
                "raw": raw_str,
                "hex": received_data.hex(),
                "ip": ip,
                "port": port,
                "protocol": cl_parsed.get("protocol"),
                "simulated": False,
                "timestamp": get_local_now().isoformat()
            }

        # 2. ASCII Fallback
        if raw_str:
            parsed = parse_cas_weight_data(raw_str)
            return {
                "success": True,
                "weight": parsed["weight"],
                "unit": parsed["unit"],
                "grams": parsed["grams"],
                "is_stable": parsed["is_stable"],
                "raw": raw_str,
                "hex": received_data.hex(),
                "ip": ip,
                "port": port,
                "simulated": False,
                "timestamp": get_local_now().isoformat()
            }

        return {
            "success": False,
            "error": f"CAS CL-3000 teraziye bağlandı ({ip}:{port}) ancak tartım verisi alınamadı. Terazinin kefesinde ürün olduğundan emin olun.",
            "raw": "",
            "hex": ""
        }

    except socket.timeout:
        return {
            "success": False,
            "error": f"CAS CL-3000 teraziden yanıt zaman aşımına uğradı ({ip}:{port}, {timeout}s)."
        }
    except (ConnectionRefusedError, ConnectionResetError):
        return {
            "success": False,
            "error": f"CAS CL-3000 terazisi bağlantıyı reddetti ({ip}:{port})."
        }
    except OSError as e:
        return {
            "success": False,
            "error": f"CAS CL-3000 terazisine ulaşılamadı ({ip}:{port}): {e}."
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
    Random simülasyon kaldırıldı. Terazi bağlı değilse kesinlikle rastgele ağırlık verilmez.
    """
    return {
        "success": False,
        "weight": 0.0,
        "error": "CAS CL-3000 terazisi bağlı değil veya IP adresine ulaşılamıyor. Lütfen terazi IP adresini Ayarlar > Terazi menüsünden kontrol ediniz."
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
