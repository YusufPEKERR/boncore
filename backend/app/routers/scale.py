from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any, Optional
from pydantic import BaseModel
import asyncio
from app.database import get_db
from app.services import scale_service

router = APIRouter(prefix="/scale", tags=["Hardware & CAS Scale Integration"])

class ScaleConfigSchema(BaseModel):
    enabled: Optional[bool] = True
    model: Optional[str] = "CAS CL-3000"
    connection_type: Optional[str] = "ethernet"
    ip_address: Optional[str] = "192.168.1.150"
    port: Optional[int] = 2004
    timeout: Optional[float] = 2.5
    demo_mode: Optional[bool] = False

class ScaleTestSchema(BaseModel):
    ip_address: str
    port: int = 2004
    timeout: float = 2.0

@router.get("/config")
async def get_config(db: AsyncSession = Depends(get_db)):
    """
    Returns current CAS CL-3000 scale network configuration.
    """
    config = await scale_service.get_scale_config(db)
    return {
        "success": True,
        "config": config
    }

@router.post("/config")
async def update_config(payload: ScaleConfigSchema, db: AsyncSession = Depends(get_db)):
    """
    Saves new CAS CL-3000 scale network configuration.
    """
    saved = await scale_service.save_scale_config(db, payload.model_dump(exclude_unset=True))
    return {
        "success": True,
        "message": "Terazi ayarları başarıyla güncellendi.",
        "config": saved
    }

@router.post("/test")
async def test_connection(payload: ScaleTestSchema):
    """
    Tests TCP connection directly to the CAS CL-3000 Ethernet scale.
    """
    # Run synchronous socket ping in threadpool to keep FastAPI async loop non-blocking
    result = await asyncio.to_thread(
        scale_service.test_tcp_connectivity,
        payload.ip_address.strip(),
        int(payload.port),
        float(payload.timeout)
    )
    return result

@router.get("/weight")
async def get_current_weight(
    ip: Optional[str] = None,
    port: Optional[int] = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Reads live weight directly from the CAS CL-3000 scale over Ethernet TCP/IP.
    If demo_mode is True, generates a realistic weight simulation.
    """
    cfg = await scale_service.get_scale_config(db)
    target_ip = (ip or cfg.get("ip_address") or "192.168.1.150").strip()
    target_port = int(port or cfg.get("port") or 2004)
    timeout = float(cfg.get("timeout") or 2.5)
    demo_mode = bool(cfg.get("demo_mode", False))

    if demo_mode:
        return scale_service.get_demo_weight()

    # Query physical scale in threadpool
    result = await asyncio.to_thread(
        scale_service.sync_read_cas_cl3000,
        target_ip,
        target_port,
        timeout
    )

    # If physical scale is unreachable and user hasn't disabled fallback
    if not result.get("success") and not cfg.get("enabled", True):
        return {
            "success": False,
            "error": "Terazi entegrasyonu sistem ayarlarından devre dışı bırakılmış."
        }

    return result
