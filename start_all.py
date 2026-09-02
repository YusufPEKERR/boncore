import subprocess
import sys
import os
import time
import signal
import shutil

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

def ensure_environment_path():
    """Windows'ta son kurulan Python/Nodejs/Git yollarını PATH'e dinamik olarak ekler."""
    if os.name == "nt":
        extra_paths = [
            r"C:\Program Files\nodejs",
            r"C:\Program Files\Python312",
            r"C:\Program Files\Python312\Scripts",
            r"C:\Program Files\Git\cmd",
            os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "Python", "Python312"),
            os.path.join(os.environ.get("APPDATA", ""), "npm"),
        ]
        current_path = os.environ.get("PATH", "")
        for p in extra_paths:
            if os.path.isdir(p) and p.lower() not in current_path.lower():
                current_path = p + os.pathsep + current_path
        os.environ["PATH"] = current_path

def find_npm():
    """npm çalıştırılabilir dosyasını bulur."""
    ensure_environment_path()
    npm_path = shutil.which("npm.cmd") or shutil.which("npm")
    if not npm_path:
        # Doğrudan bilinen konumlara bak
        candidates = [
            r"C:\Program Files\nodejs\npm.cmd",
            os.path.join(os.environ.get("ProgramFiles", r"C:\Program Files"), "nodejs", "npm.cmd"),
            os.path.join(os.environ.get("APPDATA", ""), "npm", "npm.cmd"),
        ]
        for c in candidates:
            if os.path.isfile(c):
                return c
    return npm_path or "npm"

def kill_proc_tree(proc):
    """Süreç ve tüm alt çocuk süreçlerini (uvicorn worker vb.) temiz bir şekilde sonlandırır."""
    if not proc:
        return
    try:
        if os.name == "nt":
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            proc.terminate()
    except Exception:
        pass

def main():
    print("=" * 60)
    print("  🚀 BONCORE RESTORAN POS & YÖNETİM SİSTEMİ BAŞLATICI")
    print("=" * 60)

    ensure_environment_path()
    base_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.join(base_dir, "backend")
    frontend_dir = os.path.join(base_dir, "frontend")

    backend_proc = None
    frontend_proc = None

    try:
        # 1. Start Backend
        print("[1/2] FastAPI Backend başlatılıyor (Port 8000)...")
        backend_proc = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"],
            cwd=backend_dir
        )

        import urllib.request
        print("  -> Backend veritabanı ve önbellek açılışı bekleniyor...")
        for _ in range(30):
            try:
                with urllib.request.urlopen("http://127.0.0.1:8000/health", timeout=1) as resp:
                    if resp.status == 200:
                        break
            except Exception:
                time.sleep(0.4)

        # 2. Start Frontend
        print("[2/2] React + Vite Frontend başlatılıyor (Port 80)...")
        npm_cmd = find_npm()
        frontend_proc = subprocess.Popen(
            [npm_cmd, "run", "dev"],
            cwd=frontend_dir,
            shell=(os.name == "nt")
        )

        print("\n" + "=" * 60)
        print("  ✨ BONCORE SİSTEMİ AKTİF VE KULLANIMA HAZIR!")
        print("=" * 60)
        print("  🖥️  POS & Web Arayüzü : http://localhost (Port 80)")
        print("  📖 API Dokümantasyonu  : http://localhost:8000/docs")
        print("  ⚡ WebSocket Hub       : ws://localhost:8000/ws/all")
        print("------------------------------------------------------------")
        print("  🔑 Hızlı PIN Giriş Kodları:")
        print("     1111: Ahmet Garson")
        print("     2222: Ayşe Kasiyer")
        print("     3333: Mehmet Şef (Mutfak KDS)")
        print("     9999: Kemal Müdür (Yönetici & İptal/İkram Onayı)")
        print("=" * 60)
        print("  Durdurmak için Ctrl+C tuşlarına basınız.\n")

        backend_proc.wait()
        frontend_proc.wait()
    except KeyboardInterrupt:
        print("\nSistem kapatılıyor...")
    except Exception as e:
        print(f"\n[HATA] Bir sorun oluştu: {e}")
    finally:
        kill_proc_tree(backend_proc)
        kill_proc_tree(frontend_proc)

if __name__ == "__main__":
    main()
