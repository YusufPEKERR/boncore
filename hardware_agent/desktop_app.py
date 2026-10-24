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
import re
import threading
import subprocess
import winreg
from datetime import datetime
import urllib.request
import urllib.error
import requests

# GUI & Tray
import tkinter as tk
from tkinter import ttk, messagebox
import pystray
from PIL import Image, ImageDraw

AGENT_VERSION = "1.2.0"
APP_TITLE = "BonCore Donanım Köprüsü"
CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")

# Varsayılan Konfigürasyon
DEFAULT_CONFIG = {
    "server_url": "http://77.67.29.77",
    "terminal_id": "",
    "terminal_name": "Kasa 1",
    "scale_default_ip": "192.168.1.150",
    "scale_default_port": 2004,
    "auto_start": True,
    "minimize_to_tray": True,
    "show_notifications": True
}

def load_config():
    cfg = DEFAULT_CONFIG.copy()
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                cfg.update(json.load(f))
        except Exception:
            pass
    if not cfg.get("terminal_id"):
        import uuid
        cfg["terminal_id"] = f"kasa_{uuid.uuid4().hex[:6]}"
        save_config(cfg)
    return cfg

def save_config(cfg):
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2, ensure_ascii=False)
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

# --- WINDOWS BAŞLANGIÇ KAYDI (AUTOSTART) ---
REG_PATH = r"Software\Microsoft\Windows\CurrentVersion\Run"
REG_NAME = "BonCoreHardwareAgent"

def set_windows_autostart(enable=True):
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, REG_PATH, 0, winreg.KEY_ALL_ACCESS)
        if enable:
            if getattr(sys, 'frozen', False):
                app_path = f'"{sys.executable}"'
            else:
                app_path = f'"{sys.executable}" "{os.path.abspath(__file__)}"'
            winreg.SetValueEx(key, REG_NAME, 0, winreg.REG_SZ, app_path)
        else:
            try:
                winreg.DeleteValue(key, REG_NAME)
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
        winreg.QueryValueEx(key, REG_NAME)
        winreg.CloseKey(key)
        return True
    except FileNotFoundError:
        return False
    except Exception:
        return False

# --- YEREL YAZICILARI LİSTELE ---
def get_windows_printers():
    printers = []
    try:
        cmd = 'powershell -Command "Get-Printer | Select-Object Name, PortName"'
        out = subprocess.check_output(cmd, shell=True, text=True, errors="ignore")
        for line in out.splitlines():
            line = line.strip()
            if line and not line.startswith("Name") and not line.startswith("----"):
                parts = line.split(maxsplit=1)
                name = parts[0] if parts else line
                printers.append(name)
    except Exception:
        pass
    return printers[:6]

# --- CAS TERAZİ PARSER & NETWORK ---
def parse_cas_cl3000(raw_str: str):
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

def read_cas_scale(ip: str, port: int = 2004, timeout: float = 2.0):
    sock = None
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        sock.connect((ip, port))

        sock.setblocking(False)
        data = b""
        try:
            data = sock.recv(256)
        except Exception:
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
                except Exception:
                    pass

        raw = data.decode("latin-1", errors="ignore").strip()
        if not raw:
            return {"success": False, "weight": 0.0, "error": "Kefede ağırlık tespit edilemedi"}

        parsed = parse_cas_cl3000(raw)
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
    except Exception as e:
        return {"success": False, "weight": 0.0, "error": str(e)}
    finally:
        if sock:
            try:
                sock.close()
            except Exception:
                pass

def ping_scale_tcp(ip: str, port: int = 2004, timeout: float = 1.5):
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
    bg_color = (16, 185, 129) if is_ok else (239, 68, 68)  # Yeşil veya Kırmızı
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    dc = ImageDraw.Draw(image)
    # Dış yuvarlak zemin
    dc.rounded_rectangle([(4, 4), (60, 60)], radius=16, fill=bg_color)
    # İç beyaz terazi/B harfi
    dc.ellipse([(20, 20), (44, 44)], fill=(255, 255, 255))
    return image

# --- ANA UYGULAMA SINIFI ---
class BonCoreHardwareDesktopApp:
    def __init__(self, root):
        self.root = root
        self.root.title(APP_TITLE)
        self.root.geometry("540x620")
        self.root.minsize(500, 580)
        self.root.configure(bg="#0f172a")  # Slate-900

        self.cfg = load_config()

        # Otomatik başlangıç ayarını kontrol et ve uygula
        if self.cfg.get("auto_start", True):
            set_windows_autostart(True)

        # Durum değişkenleri
        self.server_connected = False
        self.scale_connected = False
        self.last_weight = 0.000
        self.printers_list = []

        # Dayanıklı Bağlantı & Debounce Sayaçları (Sürekli kopma-bağlanma bildirimini engeller)
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": f"BonCoreAgent/{AGENT_VERSION}"})
        self.server_fail_count = 0
        self.server_success_count = 0
        self.scale_fail_count = 0
        self.scale_success_count = 0

        # Önceki durumlar (Bildirim tetiklemek için)
        self.prev_server_ok = None
        self.prev_scale_ok = None

        # Ajan dinleme durumu
        self.is_running = True

        # Tray Icon Hazırla
        self.tray_icon = None
        self.setup_tray()

        # GUI Oluştur
        self.setup_ui()

        # Kapatma olayını yakala (Simgeye küçült)
        self.root.protocol("WM_DELETE_WINDOW", self.on_close_clicked)

        # Arka plan kontrol ve haberleşme iş parçacıklarını başlat
        threading.Thread(target=self.device_monitor_loop, daemon=True).start()
        threading.Thread(target=self.cloud_relay_loop, daemon=True).start()

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
            pystray.MenuItem("Durum: Kontrol Ediliyor...", lambda: None, enabled=False),
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

    def on_close_clicked(self):
        if self.cfg.get("minimize_to_tray", True):
            self.root.withdraw()
            self.show_toast(
                "BonCore Arka Planda Çalışıyor",
                "Donanım köprüsü saatin yanında çalışmaya devam ediyor. POS ekranınız teraziyi ve yazıcıları kullanabilir."
            )
        else:
            self.quit_app()

    def quit_app(self, icon=None, item=None):
        self.is_running = False
        if self.tray_icon:
            try:
                self.tray_icon.stop()
            except Exception:
                pass
        self.root.destroy()
        sys.exit(0)

    def setup_ui(self):
        # Header Bar
        header = tk.Frame(self.root, bg="#1e293b", height=70, padx=20, pady=12)
        header.pack(fill="x", side="top")

        title_box = tk.Frame(header, bg="#1e293b")
        title_box.pack(side="left")

        t_name = self.cfg.get("terminal_name", "Kasa 1")
        self.lbl_title = tk.Label(
            title_box, 
            text=f"BonCore Donanım Köprüsü • {t_name}", 
            font=("Segoe UI", 13, "bold"), 
            fg="#f8fafc", 
            bg="#1e293b"
        )
        self.lbl_title.pack(anchor="w")

        local_ip = get_local_ip()
        self.lbl_sub = tk.Label(
            title_box, 
            text=f"Kasa IP: {local_ip} • ID: {self.cfg.get('terminal_id', 'kasa-1')} • v{AGENT_VERSION}", 
            font=("Segoe UI", 9), 
            fg="#94a3b8", 
            bg="#1e293b"
        )
        self.lbl_sub.pack(anchor="w")

        # Canlı Durum Rozeti
        self.badge_status = tk.Label(
            header,
            text="● KONTROL EDİLİYOR",
            font=("Segoe UI", 9, "bold"),
            fg="#e2e8f0",
            bg="#334155",
            padx=10,
            pady=4
        )
        self.badge_status.pack(side="right")

        # Container
        content = tk.Frame(self.root, bg="#0f172a", padx=16, pady=12)
        content.pack(fill="both", expand=True)

        # CARD 1: BULUT SUNUCU BAĞLANTISI
        card_server = tk.LabelFrame(
            content,
            text=" 🌐 Bulut POS Sunucusu ",
            font=("Segoe UI", 10, "bold"),
            fg="#38bdf8",
            bg="#1e293b",
            padx=14,
            pady=10,
            relief="solid",
            bd=1
        )
        card_server.pack(fill="x", pady=6)

        f_srv = tk.Frame(card_server, bg="#1e293b")
        f_srv.pack(fill="x")

        tk.Label(f_srv, text="Sunucu Adresi:", font=("Segoe UI", 9), fg="#94a3b8", bg="#1e293b").grid(row=0, column=0, sticky="w")
        self.ent_server_url = tk.Entry(f_srv, font=("Segoe UI", 9, "bold"), fg="#f8fafc", bg="#0f172a", relief="flat", insertbackground="white")
        self.ent_server_url.insert(0, self.cfg.get("server_url", "http://77.67.29.77"))
        self.ent_server_url.grid(row=0, column=1, sticky="ew", padx=8)

        btn_save_url = tk.Button(f_srv, text="Kaydet", font=("Segoe UI", 8, "bold"), fg="#ffffff", bg="#0284c7", activebackground="#0369a1", relief="flat", padx=8, command=self.save_server_url)
        btn_save_url.grid(row=0, column=2)
        f_srv.columnconfigure(1, weight=1)

        # Kasa İsmi Ayarı
        f_kasa = tk.Frame(card_server, bg="#1e293b")
        f_kasa.pack(fill="x", pady=(8, 0))

        tk.Label(f_kasa, text="Kasa / İstasyon Adı:", font=("Segoe UI", 9), fg="#94a3b8", bg="#1e293b").grid(row=0, column=0, sticky="w")
        self.ent_terminal_name = tk.Entry(f_kasa, font=("Segoe UI", 9, "bold"), fg="#38bdf8", bg="#0f172a", relief="flat", insertbackground="white")
        self.ent_terminal_name.insert(0, self.cfg.get("terminal_name", "Kasa 1"))
        self.ent_terminal_name.grid(row=0, column=1, sticky="ew", padx=8)

        btn_save_kasa = tk.Button(f_kasa, text="İsmi Güncelle", font=("Segoe UI", 8, "bold"), fg="#ffffff", bg="#8b5cf6", activebackground="#7c3aed", relief="flat", padx=8, command=self.save_terminal_name)
        btn_save_kasa.grid(row=0, column=2)
        f_kasa.columnconfigure(1, weight=1)

        self.lbl_server_status = tk.Label(
            card_server,
            text="Durum: Sunucuya bağlanılıyor...",
            font=("Segoe UI", 9, "bold"),
            fg="#f59e0b",
            bg="#1e293b"
        )
        self.lbl_server_status.pack(anchor="w", pady=(6, 0))

        # CARD 2: CAS CL-3000 TERAZİ DURUMU
        card_scale = tk.LabelFrame(
            content,
            text=" ⚖️ CAS CL-3000 / CL-5000 Terazi (Ethernet TCP/IP) ",
            font=("Segoe UI", 10, "bold"),
            fg="#4ade80",
            bg="#1e293b",
            padx=14,
            pady=10,
            relief="solid",
            bd=1
        )
        card_scale.pack(fill="x", pady=6)

        f_scale = tk.Frame(card_scale, bg="#1e293b")
        f_scale.pack(fill="x")

        tk.Label(f_scale, text="Terazi IP:", font=("Segoe UI", 9), fg="#94a3b8", bg="#1e293b").grid(row=0, column=0, sticky="w")
        self.ent_scale_ip = tk.Entry(f_scale, font=("Segoe UI", 9, "bold"), fg="#4ade80", bg="#0f172a", relief="flat", insertbackground="white", width=16)
        self.ent_scale_ip.insert(0, self.cfg.get("scale_default_ip", "192.168.1.150"))
        self.ent_scale_ip.grid(row=0, column=1, padx=6)

        tk.Label(f_scale, text="Port:", font=("Segoe UI", 9), fg="#94a3b8", bg="#1e293b").grid(row=0, column=2, padx=(6, 2))
        self.ent_scale_port = tk.Entry(f_scale, font=("Segoe UI", 9, "bold"), fg="#4ade80", bg="#0f172a", relief="flat", insertbackground="white", width=6)
        self.ent_scale_port.insert(0, str(self.cfg.get("scale_default_port", 2004)))
        self.ent_scale_port.grid(row=0, column=3, padx=4)

        btn_save_scale = tk.Button(f_scale, text="Ayarla", font=("Segoe UI", 8, "bold"), fg="#ffffff", bg="#16a34a", activebackground="#15803d", relief="flat", padx=8, command=self.save_scale_params)
        btn_save_scale.grid(row=0, column=4, padx=4)

        # Dijital Kantar Göstergesi
        f_display = tk.Frame(card_scale, bg="#022c22", padx=12, pady=8, highlightbackground="#059669", highlightthickness=1)
        f_display.pack(fill="x", pady=8)

        self.lbl_weight_val = tk.Label(
            f_display,
            text="0.000 Kg",
            font=("Consolas", 22, "bold"),
            fg="#34d399",
            bg="#022c22"
        )
        self.lbl_weight_val.pack(side="left")

        self.lbl_scale_conn = tk.Label(
            f_display,
            text="● Terazi Aranıyor...",
            font=("Segoe UI", 9, "bold"),
            fg="#94a3b8",
            bg="#022c22"
        )
        self.lbl_scale_conn.pack(side="right")

        # CARD 3: YAZICILAR
        card_printers = tk.LabelFrame(
            content,
            text=" 🖨️ Windows Termal Yazıcıları ",
            font=("Segoe UI", 10, "bold"),
            fg="#cbd5e1",
            bg="#1e293b",
            padx=14,
            pady=8,
            relief="solid",
            bd=1
        )
        card_printers.pack(fill="x", pady=6)

        self.lbl_printers = tk.Label(
            card_printers,
            text="Yazıcılar taranıyor...",
            font=("Segoe UI", 9),
            fg="#cbd5e1",
            bg="#1e293b",
            justify="left"
        )
        self.lbl_printers.pack(anchor="w")

        # AYARLAR VE SEÇENEKLER
        card_opts = tk.Frame(content, bg="#0f172a", pady=4)
        card_opts.pack(fill="x", pady=4)

        self.var_autostart = tk.BooleanVar(value=is_windows_autostart())
        chk_autostart = tk.Checkbutton(
            card_opts,
            text="Bilgisayar açıldığında otomatik başlasın (Kur ve Unut)",
            variable=self.var_autostart,
            command=self.toggle_autostart,
            font=("Segoe UI", 9),
            fg="#e2e8f0",
            bg="#0f172a",
            selectcolor="#1e293b",
            activebackground="#0f172a",
            activeforeground="#e2e8f0"
        )
        chk_autostart.pack(anchor="w")

        self.var_notif = tk.BooleanVar(value=self.cfg.get("show_notifications", True))
        chk_notif = tk.Checkbutton(
            card_opts,
            text="Bağlantı kesildiğinde / bağlandığında Windows bildirimi göster",
            variable=self.var_notif,
            command=self.toggle_notif,
            font=("Segoe UI", 9),
            fg="#e2e8f0",
            bg="#0f172a",
            selectcolor="#1e293b",
            activebackground="#0f172a",
            activeforeground="#e2e8f0"
        )
        chk_notif.pack(anchor="w")

        # ALT BUTONLAR
        btn_frame = tk.Frame(self.root, bg="#1e293b", height=50, padx=16, pady=10)
        btn_frame.pack(fill="x", side="bottom")

        btn_min = tk.Button(
            btn_frame,
            text="Saatin Yanına Küçült (Gizle)",
            font=("Segoe UI", 9, "bold"),
            fg="#ffffff",
            bg="#334155",
            activebackground="#475569",
            relief="flat",
            padx=14,
            pady=4,
            command=self.on_close_clicked
        )
        btn_min.pack(side="left")

        btn_exit = tk.Button(
            btn_frame,
            text="Uygulamadan Çık",
            font=("Segoe UI", 9),
            fg="#ef4444",
            bg="#1e293b",
            activebackground="#292524",
            relief="flat",
            padx=10,
            pady=4,
            command=self.quit_app
        )
        btn_exit.pack(side="right")

    def save_server_url(self):
        new_url = self.ent_server_url.get().strip().rstrip("/")
        if new_url:
            self.cfg["server_url"] = new_url
            save_config(self.cfg)
            messagebox.showinfo("Başarılı", "Sunucu adresi kaydedildi. Yeni bağlantı deneniyor...")

    def save_terminal_name(self):
        new_name = self.ent_terminal_name.get().strip()
        if new_name:
            self.cfg["terminal_name"] = new_name
            save_config(self.cfg)
            self.lbl_title.config(text=f"BonCore Donanım Köprüsü • {new_name}")
            messagebox.showinfo("Başarılı", f"Kasa ismi kaydedildi: {new_name}")

    def save_scale_params(self):
        ip = self.ent_scale_ip.get().strip()
        port = int(self.ent_scale_port.get().strip() or "2004")
        self.cfg["scale_default_ip"] = ip
        self.cfg["scale_default_port"] = port
        save_config(self.cfg)
        messagebox.showinfo("Başarılı", f"Terazi adresi kaydedildi: {ip}:{port}")

    def toggle_autostart(self):
        val = self.var_autostart.get()
        self.cfg["auto_start"] = val
        save_config(self.cfg)
        set_windows_autostart(val)

    def toggle_notif(self):
        self.cfg["show_notifications"] = self.var_notif.get()
        save_config(self.cfg)

    # --- ARKA PLAN CİHAZ VE AĞ İZLEYİCİSİ ---
    def device_monitor_loop(self):
        while self.is_running:
            # 1. Yazıcıları tara (her 10 sn)
            try:
                printers = get_windows_printers()
                self.printers_list = printers
                p_text = "\n".join([f"• {p} (Hazır)" for p in printers]) if printers else "Tanımlı yerel yazıcı bulunamadı."
                self.root.after(0, lambda t=p_text: self.lbl_printers.config(text=t))
            except Exception:
                pass

            # 2. Terazi ping testi (Debounce ile kararlı kontrol)
            scale_ip = self.cfg.get("scale_default_ip", "192.168.1.150")
            scale_port = int(self.cfg.get("scale_default_port", 2004))
            scale_ok = ping_scale_tcp(scale_ip, scale_port, timeout=2.0)

            if scale_ok:
                self.scale_fail_count = 0
                self.scale_success_count += 1
                if self.scale_success_count >= 1 and not self.scale_connected:
                    self.scale_connected = True
                    if self.prev_scale_ok is False:
                        self.show_toast("✅ Terazi Bağlandı", f"CAS CL-3000 terazisine bağlandı ({scale_ip}:{scale_port}).")
                    self.prev_scale_ok = True
            else:
                self.scale_success_count = 0
                self.scale_fail_count += 1
                # Anlık dalgalanmaları önlemek için üst üste 3 başarısız ping (yaklaşık 12 sn) beklenir
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

            # Tepsi simgesini güncelle (Genel durum)
            all_ok = self.server_connected and self.scale_connected
            if self.tray_icon:
                try:
                    self.tray_icon.icon = create_tray_image(all_ok)
                except Exception:
                    pass

            time.sleep(4.0)

    # --- BULUT SUNUCU İLE RELAY VE EMİR DİNLEME ---
    def cloud_relay_loop(self):
        local_ip = get_local_ip()
        last_heartbeat_time = 0.0

        while self.is_running:
            server_url = self.cfg.get("server_url", "http://77.67.29.77").rstrip("/")
            now = time.time()

            try:
                # 1. Heartbeat - her 4 saniyede bir gönderilir (her döngüde değil!)
                if now - last_heartbeat_time >= 4.0:
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
                        "printers": self.printers_list
                    }
                    hb_resp = self.session.post(
                        f"{server_url}/api/scale/agent/heartbeat",
                        json=hb_payload,
                        timeout=5.0
                    )
                    hb_resp.raise_for_status()
                    last_heartbeat_time = now

                # 2. Poll - Emir Dinleme (Reused Keep-Alive TCP Socket)
                t_id = self.cfg.get("terminal_id", "kasa-1")
                poll_resp = self.session.get(
                    f"{server_url}/api/scale/agent/poll?terminal_id={t_id}",
                    timeout=5.0
                )
                poll_resp.raise_for_status()
                poll_data = poll_resp.json()

                # Başarılı istek -> Sayaçları sıfırla ve gerekirse bağlıya çek
                self.server_fail_count = 0
                self.server_success_count += 1

                if self.server_success_count >= 1 and not self.server_connected:
                    self.server_connected = True
                    self.root.after(0, lambda: self.lbl_server_status.config(
                        text=f"🟢 Sunucuya Bağlı ({server_url})",
                        fg="#34d399"
                    ))
                    self.root.after(0, lambda: self.badge_status.config(
                        text="● SİSTEM AKTİF",
                        bg="#166534",
                        fg="#86efac"
                    ))
                    if self.prev_server_ok is False:
                        self.show_toast("✅ Sunucu Bağlandı", "BonCore POS sunucusuna başarıyla bağlanıldı.")
                    self.prev_server_ok = True

                # Emir varsa yerine getir
                if poll_data.get("has_command"):
                    req_id = poll_data["req_id"]
                    action = poll_data.get("action", "read_weight")
                    target_ip = poll_data.get("ip", self.cfg.get("scale_default_ip", "192.168.1.150"))
                    target_port = int(poll_data.get("port", self.cfg.get("scale_default_port", 2004)))
                    timeout = float(poll_data.get("timeout", 2.5))

                    if action == "read_weight":
                        res = read_cas_scale(target_ip, target_port, timeout)
                        res["req_id"] = req_id
                        if res.get("success"):
                            w = res["weight"]
                            self.last_weight = w
                            self.root.after(0, lambda val=w: self.lbl_weight_val.config(text=f"{val:.3f} Kg"))

                        self.session.post(
                            f"{server_url}/api/scale/agent/report",
                            json=res,
                            timeout=5.0
                        )

                    elif action == "test_connection":
                        ok = ping_scale_tcp(target_ip, target_port, timeout)
                        res = {
                            "req_id": req_id,
                            "success": ok,
                            "message": "CAS CL-3000 terazisine bağlandı." if ok else "Teraziye ulaşılamadı."
                        }
                        self.session.post(
                            f"{server_url}/api/scale/agent/report",
                            json=res,
                            timeout=5.0
                        )

                # Emir yokken 1 saniye bekle (Ağ yükünü ve soket yıpranmasını önler)
                time.sleep(1.0)

            except Exception:
                self.server_success_count = 0
                self.server_fail_count += 1

                # Yalnızca üst üste 3 başarısız denemede kopma uyarısı verilir (Debounce)
                if self.server_fail_count >= 3 and self.server_connected:
                    self.server_connected = False
                    self.root.after(0, lambda: self.lbl_server_status.config(
                        text=f"🔴 Sunucu Bağlantısı Kesildi ({server_url})",
                        fg="#f87171"
                    ))
                    self.root.after(0, lambda: self.badge_status.config(
                        text="● SUNUCU BAĞLANTISI YOK",
                        bg="#7f1d1d",
                        fg="#fca5a5"
                    ))
                    if self.prev_server_ok is True:
                        self.show_toast("⚠️ Sunucu Bağlantısı Kesildi!", "BonCore bulut sunucusu ile bağlantı koptu. Otomatik tekrar bağlanılıyor...")
                    self.prev_server_ok = False

                time.sleep(2.0)

            time.sleep(0.3)

def main():
    root = tk.Tk()
    app = BonCoreHardwareDesktopApp(root)
    root.mainloop()

if __name__ == "__main__":
    main()
