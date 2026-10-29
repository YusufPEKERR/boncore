import os
import json
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from typing import Optional

router = APIRouter(prefix="/app", tags=["Android App & Updates"])

APK_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "static", "apk")
os.makedirs(APK_DIR, exist_ok=True)

APK_FILE_PATH = os.path.join(APK_DIR, "boncore-pos.apk")
VERSION_FILE_PATH = os.path.join(APK_DIR, "version.json")

DEFAULT_VERSION_INFO = {
    "version_code": 1,
    "version_name": "1.0.0",
    "min_supported_version": 1,
    "release_date": "2026-10-29",
    "apk_filename": "boncore-pos.apk",
    "download_url": "/api/app/download",
    "changelog": [
        "BonCore POS Android El Terminali ve Tablet sürümü yayınlandı.",
        "Otomatik web güncelleme entegrasyonu (Canlı menü & sipariş akışı).",
        "Ekran açık tutma (WakeLock) ve dokunmatik titreşim (Haptik) desteği.",
        "Kamera ile hızlı barkod / QR okuma altyapısı.",
        "Kendi kendini güncelleyebilen OTA (Over-The-Air) APK mekanizması."
    ]
}

def load_version_info() -> dict:
    if os.path.exists(VERSION_FILE_PATH):
        try:
            with open(VERSION_FILE_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                return {**DEFAULT_VERSION_INFO, **data}
        except Exception:
            pass
    return DEFAULT_VERSION_INFO.copy()

def save_version_info(data: dict):
    with open(VERSION_FILE_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

@router.get("/version")
async def get_app_version():
    """
    Returns latest Android APK version information for In-App Auto-Update.
    """
    info = load_version_info()
    has_apk = os.path.exists(APK_FILE_PATH)
    file_size = os.path.getsize(APK_FILE_PATH) if has_apk else 0
    return {
        **info,
        "is_apk_available": has_apk,
        "file_size_bytes": file_size,
        "file_size_mb": round(file_size / (1024 * 1024), 2)
    }

@router.get("/download")
async def download_latest_apk():
    """
    Direct download endpoint for the latest Android APK.
    """
    if not os.path.exists(APK_FILE_PATH):
        raise HTTPException(
            status_code=404,
            detail="Henüz indirilmeye hazır bir Android APK paketi bulunmuyor. Lütfen önce 'Mobil Terminal & APK' ayarlarından APK dosyasını sisteme yükleyiniz veya oluşturunuz."
        )
    info = load_version_info()
    version_name = info.get("version_name", "1.0.0")
    return FileResponse(
        path=APK_FILE_PATH,
        filename=f"BonCore-POS-v{version_name}.apk",
        media_type="application/vnd.android.package-archive",
        headers={
            "Content-Disposition": f'attachment; filename="BonCore-POS-v{version_name}.apk"',
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        }
    )

@router.post("/upload")
async def upload_apk(
    file: UploadFile = File(...),
    version_name: Optional[str] = Form("1.0.0"),
    version_code: Optional[int] = Form(1),
    changelog: Optional[str] = Form("")
):
    """
    Upload a new APK version. Updates the OTA distribution package and notifies handsets.
    """
    if not file.filename.endswith(".apk"):
        raise HTTPException(status_code=400, detail="Yalnızca .apk uzantılı Android paketleri yüklenebilir.")
    
    # Save APK
    with open(APK_FILE_PATH, "wb") as f:
        content = await file.read()
        f.write(content)
        
    info = load_version_info()
    info["version_name"] = version_name
    info["version_code"] = version_code
    if changelog.strip():
        info["changelog"] = [line.strip() for line in changelog.split("\n") if line.strip()]
        
    save_version_info(info)
    
    return {
        "success": True,
        "message": f"BonCore POS APK v{version_name} başarıyla yüklendi ve OTA dağıtımına açıldı.",
        "version_info": info
    }
