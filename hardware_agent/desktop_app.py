"""
BonCore Masaüstü Donanım Köprüsü (Desktop Hardware Agent Panel)
==============================================================
Modern grafik arayüzlü (GUI), Windows System Tray (saatin yanı) entegrasyonlu,
cihaz bağlantı kopma/bağlanma bildirimli ve otomatik başlangıç özellikli masaüstü uygulaması.
"""

import os
import sys
import json
import time
import socket
import struct
import re
import threading
import subprocess
import winreg
from datetime import datetime
import urllib.request
import urllib.error
import urllib.parse
import requests

# GUI & Tray
import tkinter as tk
from tkinter import ttk, messagebox
import pystray
from PIL import Image, ImageDraw

AGENT_VERSION = "2.2.0"
APP_TITLE = "BonCore Donanım Köprüsü"
IPC_PORT = 49231

# PyInstaller --onefile modunda __file__ geçici _MEI klasörünü gösterir ve kapanınca silinir!
if getattr(sys, "frozen", False):
    EXE_DIR = os.path.dirname(sys.executable)
else:
    EXE_DIR = os.path.dirname(os.path.abspath(__file__))

CONFIG_FILE = os.path.join(EXE_DIR, "config.json")
APPDATA_DIR = os.path.join(os.environ.get("APPDATA", os.path.expanduser("~")), "BonCoreAgent")
APPDATA_CONFIG_FILE = os.path.join(APPDATA_DIR, "config.json")
SETTINGS_REG_KEY = r"Software\BonCoreAgent"

# Varsayılan Konfigürasyon
DEFAULT_CONFIG = {
    "server_url": "http://77.67.29.77",
    "restaurant_code": "boncore-kadikoy",
    "terminal_id": "",
    "terminal_name": "Kasa 1",
    "scale_default_ip": "192.168.1.150",
    "scale_default_port": 2004,
    "auto_start": True,
    "start_hidden": True,
    "minimize_to_tray": True,
    "show_notifications": True,
    "user_customized": False
}

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def _get_deterministic_terminal_id():
    ip = get_local_ip()
    if ip and ip != "127.0.0.1":
        return "kasa_" + ip.replace(".", "_")
    import uuid
    return f"kasa_{uuid.getnode() % 1000000:06d}"

def _load_reg_settings() -> dict:
    data = {}
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, SETTINGS_REG_KEY, 0, winreg.KEY_READ)
        for field in ["server_url", "terminal_id", "terminal_name", "scale_default_ip", "scale_default_port", "user_customized", "restaurant_code", "start_hidden"]:
            try:
                val, _ = winreg.QueryValueEx(key, field)
                if field == "scale_default_port":
                    data[field] = int(val)
                elif field in ("user_customized", "start_hidden"):
                    data[field] = (str(val).lower() == "true")
                else:
                    data[field] = str(val)
            except FileNotFoundError:
                pass
        winreg.CloseKey(key)
    except Exception:
        pass
    return data

def _save_reg_settings(cfg: dict):
    try:
        key = winreg.CreateKey(winreg.HKEY_CURRENT_USER, SETTINGS_REG_KEY)
        for field in ["server_url", "terminal_id", "terminal_name", "scale_default_ip", "scale_default_port", "user_customized", "restaurant_code", "start_hidden"]:
            if field in cfg and cfg[field] is not None:
                winreg.SetValueEx(key, field, 0, winreg.REG_SZ, str(cfg[field]))
        winreg.CloseKey(key)
    except Exception:
        pass

def load_config():
    cfg = DEFAULT_CONFIG.copy()
    local_rc = None
    # 1. Önce .exe yanındaki config.json dosyasını oku
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                cf = json.load(f)
                cfg.update(cf)
                if cf.get("restaurant_code"):
                    local_rc = cf.get("restaurant_code")
        except Exception:
            pass

    # 2. %APPDATA%\BonCoreAgent\config.json dosyasını oku (Kalıcı kullanıcı ayarları)
    if os.path.exists(APPDATA_CONFIG_FILE):
        try:
            with open(APPDATA_CONFIG_FILE, "r", encoding="utf-8") as f:
                appdata_cfg = json.load(f)
                cfg.update(appdata_cfg)
        except Exception:
            pass

    # 3. Windows Registry'deki kalıcı kullanıcı ayarlarını oku
    reg_cfg = _load_reg_settings()
    if reg_cfg:
        cfg.update(reg_cfg)

    # ZIP paketinden gelen özel restoran kodu varsa önceliklendir
    if local_rc:
        cfg["restaurant_code"] = local_rc

    # 4. Sabit (Deterministik) Terminal ID ata
    det_id = _get_deterministic_terminal_id()
    if not cfg.get("terminal_id") or cfg["terminal_id"].startswith("kasa_"):
        cfg["terminal_id"] = det_id

    save_config(cfg)
    return cfg

def save_config(cfg):
    try:
        os.makedirs(APPDATA_DIR, exist_ok=True)
        with open(APPDATA_CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2, ensure_ascii=False)
    except Exception:
        pass
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2, ensure_ascii=False)
    except Exception:
        pass
    _save_reg_settings(cfg)

# --- WINDOWS BAŞLANGIÇ KAYDI (AUTOSTART - GİZLİ BAŞLATMA) ---
REG_PATH = r"Software\Microsoft\Windows\CurrentVersion\Run"
REG_NAME = "BonCoreHardwareAgent"

def set_windows_autostart(enable=True):
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, REG_PATH, 0, winreg.KEY_ALL_ACCESS)
        if enable:
            if getattr(sys, 'frozen', False):
                app_path = f'"{sys.executable}" --hidden'
            else:
                app_path = f'"{sys.executable}" "{os.path.abspath(__file__)}" --hidden'
            winreg.SetValueEx(key, REG_NAME, 0, winreg.REG_SZ, app_path)
            try:
                winreg.SetValueEx(key, "BonCoreAgent", 0, winreg.REG_SZ, app_path)
            except Exception:
                pass
        else:
            for name in [REG_NAME, "BonCoreAgent"]:
                try:
                    winreg.DeleteValue(key, name)
                except FileNotFoundError:
                    pass
        winreg.CloseKey(key)
        return True
    except Exception as e:
        print("Autostart reg error:", e)
        return False

def is_windows_autostart():
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, REG_PATH, 0, winreg.KEY_READ)
        for name in [REG_NAME, "BonCoreAgent"]:
            try:
                val, _ = winreg.QueryValueEx(key, name)
                if val:
                    winreg.CloseKey(key)
                    return True
            except FileNotFoundError:
                pass
        winreg.CloseKey(key)
        return False
    except Exception:
        return False

# --- YEREL YAZICILARI LİSTELE VE TERMAL BASKI ---
def get_windows_printers():
    printers = []
    # 1. win32print (Hızlı ve doğrudan)
    try:
        import win32print
        for p in win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS):
            name = p[2]
            if name and name not in printers:
                printers.append(name)
    except Exception:
        pass

    # 2. PowerShell fallback
    if not printers:
        try:
            cmd = ["powershell", "-NoProfile", "-Command", "(Get-Printer).Name"]
            out = subprocess.check_output(cmd, text=True, errors="ignore")
            for line in out.splitlines():
                line = line.strip()
                if line and line not in printers:
                    printers.append(line)
        except Exception:
            pass

    virtual_kw = ("microsoft print to pdf", "microsoft xps", "onenote", "fax", "anydesk printer", "send to onenote")
    printers.sort(key=lambda x: (any(k in x.lower() for k in virtual_kw), x.lower()))
    return printers

def print_slip_to_printer(printer_name: str, raw_text: str) -> bool:
    """
    Termal yazıcıya doğrudan ESC/POS formatında fiş basar ve otomatik kağıt keser.
    """
    tr_map = str.maketrans("çÇğĞıİöÖşŞüÜ", "cCgGiIoOsSuU")
    clean_text = raw_text.translate(tr_map)

    # Sanal Yazıcı Kontrolü (PDF, OneNote, XPS, vb.)
    p_low = printer_name.lower()
    is_virtual = any(v in p_low for v in ["pdf", "onenote", "xps", "fax", "anydesk"])
    if is_virtual:
        try:
            desktop = os.path.join(os.path.expanduser("~"), "Desktop")
            if not os.path.exists(desktop):
                desktop = os.path.expanduser("~")
            preview_file = os.path.join(desktop, "BonCore_Fis_Onizleme.txt")
            with open(preview_file, "w", encoding="utf-8") as f:
                f.write(clean_text)
            try:
                os.startfile(preview_file)
            except Exception:
                pass
            return True
        except Exception as e:
            print(f"Virtual printer preview error: {e}")

    # Satır sonlarını Windows CRLF formatına getir
    clean_text = clean_text.replace("\r\n", "\n").replace("\n", "\r\n")

    # ESC/POS init + metin + Form Feed + kağıt kesme (GS V B 0)
    esc_init = b"\x1b\x40"
    esc_feed = b"\r\n\r\n\r\n\x0c"
    esc_cut = b"\x1d\x56\x42\x00"
    raw_data = esc_init + clean_text.encode("latin-1", errors="replace") + esc_feed + esc_cut

    # 1. win32print RAW Spooler
    try:
        import win32print
        hPrinter = win32print.OpenPrinter(printer_name)
        try:
            hJob = win32print.StartDocPrinter(hPrinter, 1, ("BonCore Adisyon", None, "RAW"))
            try:
                win32print.StartPagePrinter(hPrinter)
                win32print.WritePrinter(hPrinter, raw_data)
                win32print.EndPagePrinter(hPrinter)
            finally:
                win32print.EndDocPrinter(hPrinter)
        finally:
            win32print.ClosePrinter(hPrinter)
        return True
    except Exception as e:
        print(f"win32print error on {printer_name}:", e)

    # 2. Notepad /pt fallback
    try:
        import tempfile
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False, suffix=".txt") as tf:
            tf.write(clean_text)
            temp_path = tf.name
        subprocess.run(["notepad.exe", "/pt", temp_path, printer_name], timeout=5)
        try:
            os.remove(temp_path)
        except Exception:
            pass
        return True
    except Exception as e:
        print(f"Fallback print error on {printer_name}:", e)
        return False

# --- CAS TERAZİ PARSER & NETWORK ---
def parse_cas_cl3000(raw_bytes: bytes, raw_str: str):
    is_stable = True
    raw_upper = raw_str.upper()
    if "US" in raw_upper or "UNSTABLE" in raw_upper or (" U " in raw_upper) or (raw_upper.startswith("U")):
        is_stable = False
    elif "ST" in raw_upper or "STABLE" in raw_upper or (" S " in raw_upper) or (raw_upper.startswith("S")):
        is_stable = True

    unit = "kg"
    if " g" in raw_str.lower() and "kg" not in raw_str.lower():
        unit = "g"

    match_float = re.search(r'([+-]?\s*\d+\.\d+)', raw_str)
    weight = 0.0
    found = False

    if match_float:
        try:
            val_str = match_float.group(1).replace(" ", "")
            weight = float(val_str)
            if unit == "g":
                weight = round(weight / 1000.0, 3)
            else:
                weight = round(weight, 3)
            found = True
        except Exception:
            pass

    if not found:
        match_int = re.search(r'([+-]?\s*\d{2,})', raw_str)
        if match_int:
            try:
                val_str = match_int.group(1).replace(" ", "")
                val = float(val_str)
                if val >= 50 or unit == "g":
                    weight = round(val / 1000.0, 3)
                else:
                    weight = round(val, 3)
                found = True
            except Exception:
                pass

    if not found and len(raw_bytes) >= 3:
        for i in range(len(raw_bytes) - 2):
            chunk = raw_bytes[i:i+4]
            digits = [chr(b) for b in chunk if 0x30 <= b <= 0x39]
            if len(digits) >= 3:
                try:
                    val = float("".join(digits))
                    weight = round(val / 1000.0, 3)
                    found = True
                    break
                except Exception:
                    pass

    return {
        "weight": max(0.0, weight),
        "grams": int(round(weight * 1000)),
        "unit": "kg",
        "is_stable": is_stable,
        "found": found
    }

def read_from_serial_ports():
    try:
        import serial
        import serial.tools.list_ports
        ports = serial.tools.list_ports.comports()
        for p in ports:
            port_name = p.device
            for baud in [9600, 4800, 19200]:
                try:
                    with serial.Serial(port_name, baud, timeout=0.25) as ser:
                        chunk = ser.read(256)
                        if not chunk:
                            for cmd in [b"W\r", b"W", b"\x05", b"Q\r"]:
                                ser.write(cmd)
                                time.sleep(0.06)
                                chunk = ser.read(256)
                                if chunk:
                                    break
                        if chunk:
                            raw_str = chunk.decode("latin-1", errors="ignore").strip()
                            parsed = parse_cas_cl3000(chunk, raw_str)
                            if parsed.get("found"):
                                return {
                                    "success": True,
                                    "weight": parsed["weight"],
                                    "unit": parsed["unit"],
                                    "grams": parsed["grams"],
                                    "is_stable": parsed["is_stable"],
                                    "raw": raw_str,
                                    "hex": chunk.hex(),
                                    "source": f"Serial ({port_name} @ {baud})",
                                    "ip": port_name,
                                    "port": baud
                                }
                except Exception:
                    pass
    except Exception:
        pass
    return None

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
                    "scale_id": scale_id,
                    "protocol": "CAS-CL-Native-Status (WN)"
                }
        except Exception as e:
            print("CAS CL WN parse error:", e)

    return None

def try_read_from_socket(ip: str, port: int, timeout: float = 1.0):
    sock = None
    all_chunks = []
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(min(timeout, 1.0))
        sock.connect((ip, port))

        sock.settimeout(0.15)
        try:
            chunk = sock.recv(512)
            if chunk:
                all_chunks.append(chunk)
        except Exception:
            pass

        if not all_chunks:
            wn_request = encode_cas_cl_packet(b"WN", 0, b"")
            commands = [
                wn_request,
                b"W\r\n",
                b"W\r",
                b"\x05",
                b"Q\r\n",
                b"S\r\n",
                b"\x0200\x03\r\n"
            ]
            for cmd in commands:
                try:
                    sock.sendall(cmd)
                    time.sleep(0.06)
                    sock.settimeout(0.2)
                    chunk = sock.recv(512)
                    if chunk:
                        all_chunks.append(chunk)
                        break
                except Exception:
                    continue

        if all_chunks:
            full_raw = b"".join(all_chunks)
            native_res = parse_cas_cl_response(full_raw)
            if native_res and native_res.get("found"):
                return {
                    "success": True,
                    "weight": native_res["weight"],
                    "unit": native_res["unit"],
                    "grams": native_res["grams"],
                    "is_stable": native_res["is_stable"],
                    "raw": f"CAS-WN: {native_res['weight']} {native_res['unit']}",
                    "hex": full_raw.hex(),
                    "source": f"CAS-CL TCP ({ip}:{port})"
                }

            raw_str = full_raw.decode("latin-1", errors="ignore").strip()
            parsed = parse_cas_cl3000(full_raw, raw_str)
            if parsed.get("found"):
                return {
                    "success": True,
                    "weight": parsed["weight"],
                    "unit": parsed["unit"],
                    "grams": parsed["grams"],
                    "is_stable": parsed["is_stable"],
                    "raw": raw_str,
                    "hex": full_raw.hex(),
                    "source": f"Ethernet ({ip}:{port})"
                }
    except Exception:
        pass
    finally:
        if sock:
            try:
                sock.close()
            except Exception:
                pass
    return None

def read_cas_scale(target_ip: str = "192.168.1.150", target_port: int = 2004, timeout: float = 2.0):
    ports_to_try = [target_port]
    for alt_p in [2004, 5000, 4001, 23, 8000]:
        if alt_p not in ports_to_try:
            ports_to_try.append(alt_p)

    for p in ports_to_try:
        res = try_read_from_socket(target_ip, p, timeout=min(timeout, 0.8))
        if res and res.get("success"):
            return res

    serial_res = read_from_serial_ports()
    if serial_res and serial_res.get("success"):
        return serial_res

    # Ağdaki diğer standart CAS IP'leri dene
    base_prefix = target_ip.rsplit(".", 1)[0]
    for last_octet in [150, 151, 152, 200, 100, 20]:
        alt_ip = f"{base_prefix}.{last_octet}"
        if alt_ip != target_ip:
            res = try_read_from_socket(alt_ip, target_port, timeout=0.25)
            if res and res.get("success"):
                return res

    return {
        "success": False,
        "error": f"CAS CL-3000 terazisine ulaşılamadı ({target_ip}:{target_port}).",
        "weight": 0.0,
        "grams": 0,
        "unit": "kg",
        "is_stable": False
    }

def ping_scale_tcp(ip: str, port: int = 2004, timeout: float = 1.0) -> bool:
    sock = None
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        sock.connect((ip, port))
        return True
    except Exception:
        return False
    finally:
        if sock:
            try:
                sock.close()
            except Exception:
                pass

# --- TRAY ICON OLUŞTURUCU ---
def create_tray_image(is_ok=True):
    width, height = 64, 64
    bg_color = (16, 185, 129) if is_ok else (239, 68, 68)  # Zümrüt Yeşili veya Canlı Kırmızı
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    dc = ImageDraw.Draw(image)
    # Dış yuvarlak zemin
    dc.rounded_rectangle([(3, 3), (61, 61)], radius=18, fill=bg_color)
    # İç beyaz kantar/B amblemi
    dc.ellipse([(18, 18), (46, 46)], fill=(255, 255, 255))
    dc.rectangle([(28, 14), (36, 50)], fill=bg_color)
    return image

# --- TEK KOPYA & IPC HABERLEŞMESİ ---
def check_single_instance_or_signal():
    """
    Eğer uygulama zaten arka planda çalışıyorsa:
    --hidden parametresi ile geldiyse sessizce kapanır.
    Masaüstünden normal tıklandıysa çalışan kopyaya 'SHOW' sinyali gönderip pencereyi öne çıkarır.
    """
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(('127.0.0.1', IPC_PORT))
        s.listen(2)
        return s
    except OSError:
        is_hidden = any(arg in sys.argv for arg in ["--hidden", "--minimized", "-h"])
        if not is_hidden:
            try:
                sender = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sender.connect(('127.0.0.1', IPC_PORT))
                sender.sendall(b"SHOW\n")
                sender.close()
            except Exception:
                pass
        sys.exit(0)

def start_ipc_listener(ipc_socket, callback_show):
    def _listen():
        while True:
            try:
                conn, _ = ipc_socket.accept()
                data = conn.recv(64)
                if b"SHOW" in data:
                    callback_show()
                conn.close()
            except Exception:
                break
    t = threading.Thread(target=_listen, daemon=True)
    t.start()


# --- ANA UYGULAMA SINIFI (MODERN WEB TEMASI) ---
class BonCoreHardwareDesktopApp:
    def __init__(self, root, is_hidden=False):
        self.root = root
        self.is_hidden = is_hidden
        self.cfg = load_config()

        self.root.title(f"{APP_TITLE} • v{AGENT_VERSION}")
        self.root.configure(bg="#0b0f19")  # BonCore Obsidian Dark

        # Pencere konumu ve boyutu
        self.center_window(580, 720)
        self.root.minsize(520, 640)

        # Otomatik başlangıç ayarını kontrol et ve uygula
        if self.cfg.get("auto_start", True):
            set_windows_autostart(True)

        # Durum değişkenleri
        self.server_connected = False
        self.scale_connected = False
        self.last_weight = 0.000
        self.printers_list = []

        # Dayanıklı Bağlantı & Debounce Sayaçları
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": f"BonCoreAgent/{AGENT_VERSION}"})
        self.server_fail_count = 0
        self.server_success_count = 0
        self.scale_fail_count = 0
        self.scale_success_count = 0

        self.prev_server_ok = None
        self.prev_scale_ok = None
        self.is_running = True

        # Tray Icon Hazırla
        self.tray_icon = None
        self.setup_tray()

        # Modern UI Oluştur
        self.setup_ui()

        # Gizli mod kontrolü: Windows başlangıcında pencereyi hiç gösterme
        if self.is_hidden or self.cfg.get("start_hidden", True):
            self.root.withdraw()

        # Kapatma olayını yakala (Simgeye küçült)
        self.root.protocol("WM_DELETE_WINDOW", self.on_close_clicked)

        # Arka plan iş parçacıklarını başlat
        threading.Thread(target=self.device_monitor_loop, daemon=True).start()
        threading.Thread(target=self.cloud_relay_loop, daemon=True).start()

    def center_window(self, width=580, height=720):
        try:
            screen_width = self.root.winfo_screenwidth()
            screen_height = self.root.winfo_screenheight()
            x = max(0, int((screen_width - width) / 2))
            y = max(0, int((screen_height - height) / 2) - 30)
            self.root.geometry(f"{width}x{height}+{x}+{y}")
        except Exception:
            self.root.geometry(f"{width}x{height}")

    def show_toast(self, title, message):
        """Windows Bildirim Alanı (Toast) Bildirimi Gönderir"""
        if not self.cfg.get("show_notifications", True):
            return
        if self.tray_icon:
            try:
                self.tray_icon.notify(message, title)
            except Exception as e:
                print("Toast error:", e)

    def setup_tray(self):
        menu = pystray.Menu(
            pystray.MenuItem("BonCore Panelini Aç", self.show_window_from_tray, default=True),
            pystray.MenuItem("Test Fişi Yazdır", lambda: threading.Thread(target=self.test_print_sample, daemon=True).start()),
            pystray.MenuItem("Anlık Terazi Oku", lambda: self.manual_read_scale()),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Tamamen Kapat ve Çık", self.quit_app)
        )
        self.tray_icon = pystray.Icon("BonCoreAgent", create_tray_image(True), APP_TITLE, menu)
        threading.Thread(target=self.tray_icon.run, daemon=True).start()

    def show_window_from_tray(self, icon=None, item=None):
        self.root.after(0, self._deiconify_window)

    def _deiconify_window(self):
        self.root.deiconify()
        self.root.lift()
        self.root.focus_force()

    def sync_entries_to_config(self, user_action=False):
        try:
            changed = False
            new_url = self.ent_server_url.get().strip().rstrip("/")
            if new_url and new_url != self.cfg.get("server_url"):
                self.cfg["server_url"] = new_url
                changed = True

            if hasattr(self, "ent_restaurant_code"):
                new_rc = self.ent_restaurant_code.get().strip().lower()
                if new_rc and new_rc != self.cfg.get("restaurant_code"):
                    self.cfg["restaurant_code"] = new_rc
                    changed = True

            new_name = self.ent_terminal_name.get().strip()
            if new_name and new_name != self.cfg.get("terminal_name"):
                self.cfg["terminal_name"] = new_name
                self.lbl_title.config(text=f"BonCore • {new_name}")
                changed = True

            new_ip = self.ent_scale_ip.get().strip()
            if new_ip and new_ip != self.cfg.get("scale_default_ip"):
                self.cfg["scale_default_ip"] = new_ip
                changed = True

            new_port_str = self.ent_scale_port.get().strip()
            if new_port_str.isdigit():
                new_port = int(new_port_str)
                if new_port != int(self.cfg.get("scale_default_port", 2004)):
                    self.cfg["scale_default_port"] = new_port
                    changed = True

            if user_action or changed:
                self.cfg["user_customized"] = True
                save_config(self.cfg)
                threading.Thread(target=self._push_immediate_heartbeat, daemon=True).start()
        except Exception:
            pass

    def _push_immediate_heartbeat(self):
        try:
            server_url = self.cfg.get("server_url", "http://77.67.29.77").rstrip("/")
            rc = self.cfg.get("restaurant_code", "").strip()
            hb_payload = {
                "terminal_id": self.cfg.get("terminal_id", "kasa-1"),
                "terminal_name": self.cfg.get("terminal_name", "Kasa 1"),
                "local_ip": get_local_ip(),
                "version": AGENT_VERSION,
                "agent_name": self.cfg.get("terminal_name", "Kasa 1"),
                "scale_connected": self.scale_connected,
                "scale_ip": self.cfg.get("scale_default_ip", "192.168.1.150"),
                "scale_port": int(self.cfg.get("scale_default_port", 2004)),
                "last_weight": self.last_weight,
                "printers": self.printers_list,
                "user_configured": True,
                "restaurant_code": rc
            }
            headers = {"X-Restaurant-Code": rc} if rc else {}
            self.session.post(f"{server_url}/api/scale/agent/heartbeat", json=hb_payload, headers=headers, timeout=4.0)
        except Exception:
            pass

    def on_close_clicked(self):
        self.sync_entries_to_config()
        save_config(self.cfg)
        if self.cfg.get("minimize_to_tray", True):
            self.root.withdraw()
            self.show_toast(
                "BonCore Arka Planda Aktif",
                "Donanım köprüsü arka planda saatin yanında çalışmaya devam ediyor. POS ekranınız teraziyi ve yazıcıları kesintisiz kullanabilir."
            )
        else:
            self.quit_app()

    def quit_app(self, icon=None, item=None):
        self.sync_entries_to_config()
        save_config(self.cfg)
        self.is_running = False
        if self.tray_icon:
            try:
                self.tray_icon.stop()
            except Exception:
                pass
        self.root.destroy()
        sys.exit(0)

    # ==============================================================
    # MODERN WEB TASARIMLI GRAFİK ARAYÜZ (SLATE & EMERALD)
    # ==============================================================
    def setup_ui(self):
        # 1. HEADER (Obsidian #0c1424, Alt Yeşil Çizgi #10b981)
        header = tk.Frame(self.root, bg="#0c1424", height=78, padx=20, pady=12)
        header.pack(fill="x", side="top")

        # Sol Başlık ve Amblem
        brand_box = tk.Frame(header, bg="#0c1424")
        brand_box.pack(side="left", fill="y")

        # Yeşil BonCore Logo Rozeti
        logo_badge = tk.Label(
            brand_box,
            text=" B ",
            font=("Segoe UI", 13, "bold"),
            fg="#ffffff",
            bg="#10b981",
            padx=8,
            pady=4,
            relief="flat"
        )
        logo_badge.pack(side="left", padx=(0, 12))

        title_info = tk.Frame(brand_box, bg="#0c1424")
        title_info.pack(side="left")

        t_name = self.cfg.get("terminal_name", "Kasa 1")
        self.lbl_title = tk.Label(
            title_info,
            text=f"BonCore • {t_name}",
            font=("Segoe UI", 13, "bold"),
            fg="#ffffff",
            bg="#0c1424"
        )
        self.lbl_title.pack(anchor="w")

        local_ip = get_local_ip()
        self.lbl_sub = tk.Label(
            title_info,
            text=f"IP: {local_ip}  •  ID: {self.cfg.get('terminal_id', 'kasa-1')}  •  v{AGENT_VERSION}",
            font=("Segoe UI", 9),
            fg="#94a3b8",
            bg="#0c1424"
        )
        self.lbl_sub.pack(anchor="w")

        # Sağ: Canlı Durum Rozeti (Pill Badge)
        self.badge_status = tk.Label(
            header,
            text="● KONTROL EDİLİYOR",
            font=("Segoe UI", 9, "bold"),
            fg="#facc15",
            bg="#451a03",
            padx=12,
            pady=6,
            relief="solid",
            bd=1
        )
        self.badge_status.pack(side="right")

        # Ayırıcı Yeşil Şerit
        accent_line = tk.Frame(self.root, bg="#10b981", height=2)
        accent_line.pack(fill="x", side="top")

        # 2. SCROLLABLE CONTENT BODY (Karanlık Web Sayfası Akışı)
        canvas = tk.Canvas(self.root, bg="#0b0f19", highlightthickness=0)
        scrollbar = tk.Scrollbar(self.root, orient="vertical", command=canvas.yview)
        self.scroll_content = tk.Frame(canvas, bg="#0b0f19", padx=18, pady=12)

        self.scroll_content.bind(
            "<Configure>",
            lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
        )
        canvas_window = canvas.create_window((0, 0), window=self.scroll_content, anchor="nw")

        def _on_canvas_configure(event):
            canvas.itemconfig(canvas_window, width=event.width)
        canvas.bind("<Configure>", _on_canvas_configure)

        def _on_mousewheel(event):
            canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")
        self.root.bind_all("<MouseWheel>", _on_mousewheel)

        canvas.pack(side="top", fill="both", expand=True)

        # -------------------------------------------------------------
        # KART 1: BULUT SUNUCU & RESTORAN EŞLEŞMESİ
        # -------------------------------------------------------------
        card_server = tk.Frame(self.scroll_content, bg="#131b2e", padx=16, pady=14, highlightbackground="#1f293d", highlightthickness=1)
        card_server.pack(fill="x", pady=6)

        c1_head = tk.Frame(card_server, bg="#131b2e")
        c1_head.pack(fill="x", pady=(0, 10))
        tk.Label(c1_head, text="🌐  Bulut POS Sunucusu & Restoran Eşleşmesi", font=("Segoe UI", 10, "bold"), fg="#38bdf8", bg="#131b2e").pack(side="left")

        # Sunucu Adresi
        f_srv = tk.Frame(card_server, bg="#131b2e")
        f_srv.pack(fill="x", pady=4)
        tk.Label(f_srv, text="Sunucu URL:", font=("Segoe UI", 9), fg="#94a3b8", bg="#131b2e", width=14, anchor="w").pack(side="left")
        self.ent_server_url = tk.Entry(f_srv, font=("Segoe UI", 9, "bold"), fg="#f8fafc", bg="#0b0f19", relief="flat", insertbackground="#10b981", highlightbackground="#1f293d", highlightcolor="#10b981", highlightthickness=1)
        self.ent_server_url.insert(0, self.cfg.get("server_url", "http://77.67.29.77"))
        self.ent_server_url.pack(side="left", fill="x", expand=True, padx=(4, 8), ipady=3)
        btn_save_url = tk.Button(f_srv, text="Kaydet", font=("Segoe UI", 8, "bold"), fg="#ffffff", bg="#059669", activebackground="#047857", relief="flat", padx=10, pady=3, cursor="hand2", command=self.save_server_url)
        btn_save_url.pack(side="right")

        # Restoran Kodu
        f_rc = tk.Frame(card_server, bg="#131b2e")
        f_rc.pack(fill="x", pady=4)
        tk.Label(f_rc, text="Restoran Kodu:", font=("Segoe UI", 9), fg="#94a3b8", bg="#131b2e", width=14, anchor="w").pack(side="left")
        self.ent_restaurant_code = tk.Entry(f_rc, font=("Segoe UI", 9, "bold"), fg="#34d399", bg="#0b0f19", relief="flat", insertbackground="#10b981", highlightbackground="#1f293d", highlightcolor="#10b981", highlightthickness=1)
        self.ent_restaurant_code.insert(0, self.cfg.get("restaurant_code", "boncore-kadikoy"))
        self.ent_restaurant_code.pack(side="left", fill="x", expand=True, padx=(4, 8), ipady=3)
        btn_save_rc = tk.Button(f_rc, text="Eşleştir", font=("Segoe UI", 8, "bold"), fg="#ffffff", bg="#059669", activebackground="#047857", relief="flat", padx=10, pady=3, cursor="hand2", command=self.save_restaurant_code)
        btn_save_rc.pack(side="right")

        # Kasa İstasyon Adı
        f_kasa = tk.Frame(card_server, bg="#131b2e")
        f_kasa.pack(fill="x", pady=4)
        tk.Label(f_kasa, text="Kasa / İstasyon:", font=("Segoe UI", 9), fg="#94a3b8", bg="#131b2e", width=14, anchor="w").pack(side="left")
        self.ent_terminal_name = tk.Entry(f_kasa, font=("Segoe UI", 9, "bold"), fg="#60a5fa", bg="#0b0f19", relief="flat", insertbackground="#10b981", highlightbackground="#1f293d", highlightcolor="#10b981", highlightthickness=1)
        self.ent_terminal_name.insert(0, self.cfg.get("terminal_name", "Kasa 1"))
        self.ent_terminal_name.pack(side="left", fill="x", expand=True, padx=(4, 8), ipady=3)
        btn_save_kasa = tk.Button(f_kasa, text="Güncelle", font=("Segoe UI", 8, "bold"), fg="#ffffff", bg="#059669", activebackground="#047857", relief="flat", padx=10, pady=3, cursor="hand2", command=self.save_terminal_name)
        btn_save_kasa.pack(side="right")

        self.lbl_server_status = tk.Label(
            card_server,
            text="Durum: Sunucuya bağlanılıyor...",
            font=("Segoe UI", 9),
            fg="#facc15",
            bg="#131b2e"
        )
        self.lbl_server_status.pack(anchor="w", pady=(8, 0))

        # -------------------------------------------------------------
        # KART 2: CAS TERAZİ ENTEGRASYONU (CL-3000 / CL-5000 / DİJİTAL)
        # -------------------------------------------------------------
        card_scale = tk.Frame(self.scroll_content, bg="#131b2e", padx=16, pady=14, highlightbackground="#1f293d", highlightthickness=1)
        card_scale.pack(fill="x", pady=6)

        c2_head = tk.Frame(card_scale, bg="#131b2e")
        c2_head.pack(fill="x", pady=(0, 10))
        tk.Label(c2_head, text="⚖️  CAS CL-3000 / CL-5000 Terazi (Ethernet TCP/IP & RS-232)", font=("Segoe UI", 10, "bold"), fg="#34d399", bg="#131b2e").pack(side="left")

        # IP & Port Satırı
        f_scale = tk.Frame(card_scale, bg="#131b2e")
        f_scale.pack(fill="x", pady=4)

        tk.Label(f_scale, text="Terazi IP:", font=("Segoe UI", 9), fg="#94a3b8", bg="#131b2e").pack(side="left")
        self.ent_scale_ip = tk.Entry(f_scale, font=("Segoe UI", 9, "bold"), fg="#34d399", bg="#0b0f19", relief="flat", insertbackground="#10b981", highlightbackground="#1f293d", highlightcolor="#10b981", highlightthickness=1, width=16)
        self.ent_scale_ip.insert(0, self.cfg.get("scale_default_ip", "192.168.1.150"))
        self.ent_scale_ip.pack(side="left", padx=6, ipady=3)

        tk.Label(f_scale, text="Port:", font=("Segoe UI", 9), fg="#94a3b8", bg="#131b2e").pack(side="left", padx=(6, 2))
        self.ent_scale_port = tk.Entry(f_scale, font=("Segoe UI", 9, "bold"), fg="#34d399", bg="#0b0f19", relief="flat", insertbackground="#10b981", highlightbackground="#1f293d", highlightcolor="#10b981", highlightthickness=1, width=6)
        self.ent_scale_port.insert(0, str(self.cfg.get("scale_default_port", 2004)))
        self.ent_scale_port.pack(side="left", padx=4, ipady=3)

        btn_save_scale = tk.Button(f_scale, text="Bağlan & Kaydet", font=("Segoe UI", 8, "bold"), fg="#ffffff", bg="#059669", activebackground="#047857", relief="flat", padx=10, pady=3, cursor="hand2", command=self.save_scale_params)
        btn_save_scale.pack(side="left", padx=(6, 0))

        # Yüksek Teknolojili Dijital Gösterge Kutusu (Emerald Display)
        f_display = tk.Frame(card_scale, bg="#022c22", padx=16, pady=10, highlightbackground="#059669", highlightthickness=1)
        f_display.pack(fill="x", pady=10)

        disp_left = tk.Frame(f_display, bg="#022c22")
        disp_left.pack(side="left")

        tk.Label(disp_left, text="CANLI AĞIRLIK", font=("Segoe UI", 8, "bold"), fg="#059669", bg="#022c22").pack(anchor="w")
        self.lbl_weight_val = tk.Label(
            disp_left,
            text="0.000 kg",
            font=("Consolas", 24, "bold"),
            fg="#34d399",
            bg="#022c22"
        )
        self.lbl_weight_val.pack(anchor="w")

        disp_right = tk.Frame(f_display, bg="#022c22")
        disp_right.pack(side="right")

        self.lbl_scale_conn = tk.Label(
            disp_right,
            text="● Terazi Aranıyor...",
            font=("Segoe UI", 9, "bold"),
            fg="#94a3b8",
            bg="#022c22"
        )
        self.lbl_scale_conn.pack(anchor="e", pady=(0, 4))

        btn_read_now = tk.Button(
            disp_right,
            text="⚡ Anlık Tartım Oku",
            font=("Segoe UI", 8, "bold"),
            fg="#ffffff",
            bg="#059669",
            activebackground="#047857",
            relief="flat",
            padx=10,
            pady=3,
            cursor="hand2",
            command=self.manual_read_scale
        )
        btn_read_now.pack(anchor="e")

        # -------------------------------------------------------------
        # KART 3: WINDOWS TERMAL YAZICILARI (ESC/POS)
        # -------------------------------------------------------------
        card_printers = tk.Frame(self.scroll_content, bg="#131b2e", padx=16, pady=14, highlightbackground="#1f293d", highlightthickness=1)
        card_printers.pack(fill="x", pady=6)

        c3_head = tk.Frame(card_printers, bg="#131b2e")
        c3_head.pack(fill="x", pady=(0, 8))
        tk.Label(c3_head, text="🖨️  Windows Termal Fiş Yazıcıları (ESC/POS)", font=("Segoe UI", 10, "bold"), fg="#f8fafc", bg="#131b2e").pack(side="left")

        btn_test_print = tk.Button(
            c3_head,
            text="📄 Test Fişi Yazdır",
            font=("Segoe UI", 8, "bold"),
            fg="#ffffff",
            bg="#0284c7",
            activebackground="#0369a1",
            relief="flat",
            padx=10,
            pady=3,
            cursor="hand2",
            command=self.test_print_sample
        )
        btn_test_print.pack(side="right")

        self.lbl_printers = tk.Label(
            card_printers,
            text="Sistem yazıcıları taranıyor...",
            font=("Segoe UI", 9),
            fg="#cbd5e1",
            bg="#131b2e",
            justify="left"
        )
        self.lbl_printers.pack(anchor="w", pady=(4, 0))

        # -------------------------------------------------------------
        # KART 4: SİSTEM & BAŞLANGIÇ AYARLARI
        # -------------------------------------------------------------
        card_opts = tk.Frame(self.scroll_content, bg="#131b2e", padx=16, pady=12, highlightbackground="#1f293d", highlightthickness=1)
        card_opts.pack(fill="x", pady=6)

        tk.Label(card_opts, text="⚙️  Sistem ve Başlangıç Tercihleri", font=("Segoe UI", 10, "bold"), fg="#f8fafc", bg="#131b2e").pack(anchor="w", pady=(0, 6))

        self.var_autostart = tk.BooleanVar(value=is_windows_autostart())
        chk_autostart = tk.Checkbutton(
            card_opts,
            text="Bilgisayar açıldığında otomatik ve arka planda (gizli) başlasın",
            variable=self.var_autostart,
            command=self.toggle_autostart,
            font=("Segoe UI", 9),
            fg="#e2e8f0",
            bg="#131b2e",
            selectcolor="#0b0f19",
            activebackground="#131b2e",
            activeforeground="#34d399"
        )
        chk_autostart.pack(anchor="w", pady=2)

        self.var_notif = tk.BooleanVar(value=self.cfg.get("show_notifications", True))
        chk_notif = tk.Checkbutton(
            card_opts,
            text="Cihaz ve ağ bağlantısı koptuğunda / bağlandığında Windows bildirimi göster",
            variable=self.var_notif,
            command=self.toggle_notif,
            font=("Segoe UI", 9),
            fg="#e2e8f0",
            bg="#131b2e",
            selectcolor="#0b0f19",
            activebackground="#131b2e",
            activeforeground="#34d399"
        )
        chk_notif.pack(anchor="w", pady=2)

        # 3. FOOTER ACTION BAR (Obsidian #0c1424, Üst İnce Çizgi #1f293d)
        footer = tk.Frame(self.root, bg="#0c1424", height=54, padx=20, pady=10, highlightbackground="#1f293d", highlightthickness=1)
        footer.pack(fill="x", side="bottom")

        btn_min = tk.Button(
            footer,
            text="Saatin Yanında Gizle (Arka Plan)",
            font=("Segoe UI", 9, "bold"),
            fg="#f8fafc",
            bg="#1e293b",
            activebackground="#334155",
            relief="flat",
            padx=14,
            pady=5,
            cursor="hand2",
            command=self.on_close_clicked
        )
        btn_min.pack(side="left")

        btn_exit = tk.Button(
            footer,
            text="Kapat ve Çık",
            font=("Segoe UI", 9),
            fg="#ef4444",
            bg="#131b2e",
            activebackground="#450a0a",
            relief="flat",
            padx=12,
            pady=5,
            cursor="hand2",
            command=self.quit_app
        )
        btn_exit.pack(side="right")

        btn_refresh = tk.Button(
            footer,
            text="Yenile",
            font=("Segoe UI", 9),
            fg="#94a3b8",
            bg="#131b2e",
            activebackground="#334155",
            relief="flat",
            padx=12,
            pady=5,
            cursor="hand2",
            command=self.refresh_all_devices
        )
        btn_refresh.pack(side="right", padx=8)

        # Kutulardan çıkıldığında veya Enter'a basıldığında otomatik kaydet
        for ent in [self.ent_server_url, self.ent_restaurant_code, self.ent_terminal_name, self.ent_scale_ip, self.ent_scale_port]:
            ent.bind("<FocusOut>", lambda e: self.sync_entries_to_config(user_action=True))
            ent.bind("<Return>", lambda e: self.sync_entries_to_config(user_action=True))

    def save_server_url(self):
        new_url = self.ent_server_url.get().strip().rstrip("/")
        if new_url:
            self.cfg["server_url"] = new_url
            self.cfg["user_customized"] = True
            save_config(self.cfg)
            threading.Thread(target=self._push_immediate_heartbeat, daemon=True).start()
            messagebox.showinfo("Başarılı", "Bulut sunucu adresi kalıcı olarak kaydedildi.")

    def save_restaurant_code(self):
        new_rc = self.ent_restaurant_code.get().strip().lower()
        if new_rc:
            self.cfg["restaurant_code"] = new_rc
            self.cfg["user_customized"] = True
            save_config(self.cfg)
            threading.Thread(target=self._push_immediate_heartbeat, daemon=True).start()
            messagebox.showinfo("Başarılı", f"Restoran kodu kalıcı olarak kaydedildi: {new_rc}\nBu restoranın masa ve terazileri ile otomatik eşleşecek.")

    def save_terminal_name(self):
        new_name = self.ent_terminal_name.get().strip()
        if new_name:
            self.cfg["terminal_name"] = new_name
            self.cfg["user_customized"] = True
            save_config(self.cfg)
            self.lbl_title.config(text=f"BonCore • {new_name}")
            threading.Thread(target=self._push_immediate_heartbeat, daemon=True).start()
            messagebox.showinfo("Başarılı", f"Kasa adı kaydedildi: {new_name}")

    def save_scale_params(self):
        ip = self.ent_scale_ip.get().strip()
        port = int(self.ent_scale_port.get().strip() or "2004")
        self.cfg["scale_default_ip"] = ip
        self.cfg["scale_default_port"] = port
        self.cfg["user_customized"] = True
        save_config(self.cfg)
        threading.Thread(target=self._push_immediate_heartbeat, daemon=True).start()
        threading.Thread(target=self.manual_read_scale, daemon=True).start()

    def toggle_autostart(self):
        val = self.var_autostart.get()
        self.cfg["auto_start"] = val
        self.cfg["start_hidden"] = True
        save_config(self.cfg)
        set_windows_autostart(val)

    def toggle_notif(self):
        self.cfg["show_notifications"] = self.var_notif.get()
        save_config(self.cfg)

    def manual_read_scale(self):
        scale_ip = self.ent_scale_ip.get().strip() or self.cfg.get("scale_default_ip", "192.168.1.150")
        scale_port = int(self.ent_scale_port.get().strip() or str(self.cfg.get("scale_default_port", 2004)))

        def _read():
            res = read_cas_scale(scale_ip, scale_port, timeout=1.8)
            if res.get("success"):
                w = res["weight"]
                self.last_weight = w
                stable_txt = " (Sabit)" if res.get("is_stable") else " (Hareketli)"
                self.root.after(0, lambda: self.lbl_weight_val.config(text=f"{w:.3f} kg"))
                self.root.after(0, lambda: self.lbl_scale_conn.config(
                    text=f"🟢 BAĞLI ({scale_ip}){stable_txt}",
                    fg="#34d399"
                ))
            else:
                self.root.after(0, lambda: self.lbl_scale_conn.config(
                    text=f"🔴 TARTIM ALINAMADI ({scale_ip})",
                    fg="#f87171"
                ))
        threading.Thread(target=_read, daemon=True).start()

    def test_print_sample(self):
        printers = self.printers_list or get_windows_printers()
        if not printers:
            messagebox.showwarning("Yazıcı Yok", "Bilgisayara bağlı termal yazıcı bulunamadı!")
            return

        virtual_kw = ("pdf", "xps", "onenote", "fax")
        target_printer = None
        for p in printers:
            if not any(k in p.lower() for k in virtual_kw):
                target_printer = p
                break
        if not target_printer:
            target_printer = printers[0]

        now_str = datetime.now().strftime("%d.%m.%Y %H:%M:%S")
        t_name = self.cfg.get("terminal_name", "Kasa 1")
        rc = self.cfg.get("restaurant_code", "boncore")

        sample_receipt = (
            "================================\n"
            "    BONCORE DONANIM KOPRUSU     \n"
            "         TEST CIKTISI           \n"
            "================================\n"
            f"Tarih   : {now_str}\n"
            f"Kasa    : {t_name}\n"
            f"Restoran: {rc}\n"
            f"Yazici  : {target_printer}\n"
            "--------------------------------\n"
            "Donanim Koprusu ve Spooler\n"
            "basariyla iletisim kurdu.\n"
            "Termal kagit kesme aktif.\n"
            "================================\n"
        )
        try:
            ok = print_slip_to_printer(target_printer, sample_receipt)
            if ok:
                messagebox.showinfo("Başarılı", f"Test fişi '{target_printer}' yazıcısına başarıyla gönderildi!")
            else:
                messagebox.showerror("Hata", f"'{target_printer}' yazıcısına test fişi gönderilemedi.")
        except Exception as ex:
            messagebox.showerror("Hata", f"Yazdırma hatası: {ex}")

    def refresh_all_devices(self):
        threading.Thread(target=self._push_immediate_heartbeat, daemon=True).start()
        threading.Thread(target=self.manual_read_scale, daemon=True).start()
        try:
            printers = get_windows_printers()
            self.printers_list = printers
            p_text = "\n".join([f"• 🖨️ {p} (Hazır)" for p in printers]) if printers else "Tanımlı yerel yazıcı bulunamadı."
            self.lbl_printers.config(text=p_text)
        except Exception:
            pass

    # --- ARKA PLAN CİHAZ VE AĞ İZLEYİCİSİ ---
    def device_monitor_loop(self):
        while self.is_running:
            # 1. Yazıcıları tara (her döngüde kontrol et)
            try:
                printers = get_windows_printers()
                self.printers_list = printers
                p_text = "\n".join([f"• 🖨️ {p} (Hazır)" for p in printers]) if printers else "Tanımlı yerel yazıcı bulunamadı."
                self.root.after(0, lambda t=p_text: self.lbl_printers.config(text=t))
            except Exception:
                pass

            # 2. Terazi ping testi
            scale_ip = self.cfg.get("scale_default_ip", "192.168.1.150")
            scale_port = int(self.cfg.get("scale_default_port", 2004))
            scale_ok = ping_scale_tcp(scale_ip, scale_port, timeout=1.8)

            if scale_ok:
                self.scale_fail_count = 0
                self.scale_success_count += 1
                if self.scale_success_count >= 1 and not self.scale_connected:
                    self.scale_connected = True
                    if self.prev_scale_ok is False:
                        self.show_toast("✅ Terazi Bağlandı", f"CAS CL-3000 terazisine bağlandı ({scale_ip}:{scale_port}).")
                    self.prev_scale_ok = True

                # Canlı ağırlığı oku
                try:
                    read_res = read_cas_scale(scale_ip, scale_port, timeout=0.8)
                    if read_res.get("success"):
                        w = read_res["weight"]
                        self.last_weight = w
                        self.root.after(0, lambda val=w: self.lbl_weight_val.config(text=f"{val:.3f} kg"))
                except Exception as ex:
                    print("Live scale read error:", ex)
            else:
                self.scale_success_count = 0
                self.scale_fail_count += 1
                if self.scale_fail_count >= 3 and self.scale_connected:
                    self.scale_connected = False
                    if self.prev_scale_ok is not False:
                        self.show_toast("⚠️ Terazi Bağlantısı Kesildi!", f"CAS CL-3000 terazisine ulaşılamıyor ({scale_ip}:{scale_port}). Ağ kablosunu kontrol ediniz.")
                    self.prev_scale_ok = False

            # GUI güncelle
            if self.scale_connected:
                txt_scale = f"🟢 BAĞLI ({scale_ip}:{scale_port})"
                color_scale = "#34d399"
            else:
                txt_scale = f"🔴 BAĞLANTI YOK ({scale_ip})"
                color_scale = "#f87171"
            self.root.after(0, lambda s=txt_scale, c=color_scale: self.lbl_scale_conn.config(text=s, fg=c))

            # Tepsi simgesi güncelle
            all_ok = self.server_connected and self.scale_connected
            if self.tray_icon:
                try:
                    self.tray_icon.icon = create_tray_image(all_ok)
                except Exception:
                    pass

            time.sleep(1.5)

    # --- BULUT SUNUCU İLE RELAY VE EMİR DİNLEME ---
    def cloud_relay_loop(self):
        local_ip = get_local_ip()
        last_heartbeat_time = 0.0

        while self.is_running:
            server_url = self.cfg.get("server_url", "http://77.67.29.77").rstrip("/")
            now = time.time()

            try:
                # 1. Heartbeat
                if now - last_heartbeat_time >= 4.0:
                    rc = self.cfg.get("restaurant_code", "").strip()
                    hb_payload = {
                        "terminal_id": self.cfg.get("terminal_id", "kasa-1"),
                        "terminal_name": self.cfg.get("terminal_name", "Kasa 1"),
                        "local_ip": local_ip,
                        "version": AGENT_VERSION,
                        "agent_name": self.cfg.get("terminal_name", "Kasa 1"),
                        "scale_connected": self.scale_connected,
                        "scale_ip": self.cfg.get("scale_default_ip", "192.168.1.150"),
                        "scale_port": int(self.cfg.get("scale_default_port", 2004)),
                        "last_weight": self.last_weight,
                        "printers": self.printers_list,
                        "user_configured": bool(self.cfg.get("user_customized", False)),
                        "restaurant_code": rc
                    }
                    headers = {"X-Restaurant-Code": rc} if rc else {}
                    hb_resp = self.session.post(
                        f"{server_url}/api/scale/agent/heartbeat",
                        json=hb_payload,
                        headers=headers,
                        timeout=5.0
                    )
                    hb_resp.raise_for_status()
                    hb_json = hb_resp.json()

                    # Sunucudan gelen isim veya parametre güncellemesi varsa senkronize et
                    srv_name = hb_json.get("terminal_name")
                    srv_scale_ip = hb_json.get("scale_ip")
                    srv_scale_port = hb_json.get("scale_port")
                    cfg_updated_from_srv = False
                    if srv_name and srv_name != self.cfg.get("terminal_name") and (not self.cfg.get("user_customized") or hb_json.get("admin_override")):
                        self.cfg["terminal_name"] = srv_name
                        cfg_updated_from_srv = True
                        self.root.after(0, lambda n=srv_name: (
                            self.lbl_title.config(text=f"BonCore • {n}"),
                            self.ent_terminal_name.delete(0, tk.END),
                            self.ent_terminal_name.insert(0, n)
                        ))
                    if srv_scale_ip and srv_scale_ip != self.cfg.get("scale_default_ip") and (not self.cfg.get("user_customized") or hb_json.get("admin_override")):
                        self.cfg["scale_default_ip"] = srv_scale_ip
                        cfg_updated_from_srv = True
                        self.root.after(0, lambda sip=srv_scale_ip: (
                            self.ent_scale_ip.delete(0, tk.END),
                            self.ent_scale_ip.insert(0, sip)
                        ))
                    if srv_scale_port and int(srv_scale_port) != int(self.cfg.get("scale_default_port", 2004)) and (not self.cfg.get("user_customized") or hb_json.get("admin_override")):
                        self.cfg["scale_default_port"] = int(srv_scale_port)
                        cfg_updated_from_srv = True
                        self.root.after(0, lambda sp=srv_scale_port: (
                            self.ent_scale_port.delete(0, tk.END),
                            self.ent_scale_port.insert(0, str(sp))
                        ))
                    if cfg_updated_from_srv:
                        save_config(self.cfg)
                    last_heartbeat_time = now

                # 2. Poll - Emir Dinleme
                t_id = self.cfg.get("terminal_id", "kasa-1")
                rc = self.cfg.get("restaurant_code", "").strip()
                headers = {"X-Restaurant-Code": rc} if rc else {}
                poll_url = f"{server_url}/api/scale/agent/poll?terminal_id={t_id}"
                if rc:
                    poll_url += f"&restaurant_code={urllib.parse.quote(rc)}"
                poll_resp = self.session.get(
                    poll_url,
                    headers=headers,
                    timeout=5.0
                )
                poll_resp.raise_for_status()
                poll_data = poll_resp.json()

                self.server_fail_count = 0
                self.server_success_count += 1

                if self.server_success_count >= 1 and not self.server_connected:
                    self.server_connected = True
                    self.root.after(0, lambda: self.lbl_server_status.config(
                        text=f"🟢 Sunucuya Bağlı ({server_url})",
                        fg="#34d399"
                    ))
                    self.root.after(0, lambda: self.badge_status.config(
                        text="● ÇEVRİMİÇİ • BAĞLI",
                        bg="#064e3b",
                        fg="#34d399"
                    ))
                    if self.prev_server_ok is False:
                        self.show_toast("✅ Sunucu Bağlandı", "BonCore POS bulut sunucusuna başarıyla bağlanıldı.")
                    self.prev_server_ok = True

                # Emir icra et
                if poll_data.get("has_command"):
                    req_id = poll_data["req_id"]
                    action = poll_data.get("action", "read_weight")
                    target_ip = poll_data.get("ip", self.cfg.get("scale_default_ip", "192.168.1.150"))
                    target_port = int(poll_data.get("port", self.cfg.get("scale_default_port", 2004)))
                    timeout = float(poll_data.get("timeout", 2.5))

                    if action == "read_weight":
                        res = read_cas_scale(target_ip, target_port, timeout)
                        res["req_id"] = req_id
                        if rc:
                            res["restaurant_code"] = rc
                        if res.get("success"):
                            w = res["weight"]
                            self.last_weight = w
                            self.root.after(0, lambda val=w: self.lbl_weight_val.config(text=f"{val:.3f} kg"))

                        self.session.post(
                            f"{server_url}/api/scale/agent/report",
                            json=res,
                            headers=headers,
                            timeout=5.0
                        )

                    elif action == "test_connection":
                        ok = ping_scale_tcp(target_ip, target_port, timeout)
                        res = {
                            "req_id": req_id,
                            "success": ok,
                            "message": "CAS CL-3000 terazisine bağlandı." if ok else "Teraziye ulaşılamadı."
                        }
                        if rc:
                            res["restaurant_code"] = rc
                        self.session.post(
                            f"{server_url}/api/scale/agent/report",
                            json=res,
                            headers=headers,
                            timeout=5.0
                        )

                    elif action == "print_receipt":
                        target_printers = poll_data.get("printers", [])
                        raw_text = poll_data.get("raw_text", "")
                        results = []
                        for pr_name in target_printers:
                            ok = print_slip_to_printer(pr_name, raw_text)
                            results.append({"printer": pr_name, "success": ok})
                        ok_count = len([r for r in results if r["success"]])
                        res = {
                            "req_id": req_id,
                            "success": ok_count > 0,
                            "results": results,
                            "message": f"{ok_count}/{len(target_printers)} yazıcıdan çıktı alındı." if target_printers else "Yazıcı listesi boş."
                        }
                        if rc:
                            res["restaurant_code"] = rc
                        self.session.post(
                            f"{server_url}/api/scale/agent/report",
                            json=res,
                            headers=headers,
                            timeout=5.0
                        )

                time.sleep(0.5)

            except Exception:
                self.server_success_count = 0
                self.server_fail_count += 1

                if self.server_fail_count >= 3 and self.server_connected:
                    self.server_connected = False
                    self.root.after(0, lambda: self.lbl_server_status.config(
                        text=f"🔴 Sunucu Bağlantısı Kesildi ({server_url})",
                        fg="#f87171"
                    ))
                    self.root.after(0, lambda: self.badge_status.config(
                        text="● SUNUCU BAĞLANTISI YOK",
                        bg="#450a0a",
                        fg="#f87171"
                    ))
                    if self.prev_server_ok is True:
                        self.show_toast("⚠️ Sunucu Bağlantısı Kesildi!", "BonCore bulut sunucusu ile bağlantı koptu. Otomatik tekrar bağlanılıyor...")
                    self.prev_server_ok = False

                time.sleep(2.0)

            time.sleep(0.3)

def main():
    ipc_sock = check_single_instance_or_signal()

    root = tk.Tk()

    # Eğer Windows başlangıcında veya --hidden ile çağrıldıysa pencereyi hiç gösterme
    is_hidden = any(arg in sys.argv for arg in ["--hidden", "--minimized", "-h"])
    if is_hidden:
        root.withdraw()

    app = BonCoreHardwareDesktopApp(root, is_hidden=is_hidden)

    if ipc_sock:
        start_ipc_listener(ipc_sock, lambda: root.after(0, app._deiconify_window))

    root.mainloop()

if __name__ == "__main__":
    main()
