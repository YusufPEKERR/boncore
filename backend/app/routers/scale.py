from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any, Optional
from pydantic import BaseModel
import asyncio
import os
import json
import time
import uuid
import zipfile
import io
import re
from app.database import get_db
from app.services import scale_service

router = APIRouter(prefix="/scale", tags=["Hardware & CAS Scale Integration"])

# In-memory agent state & command relay queues
AGENT_STATE = {
    "last_seen": 0.0,
    "local_ip": "127.0.0.1",
    "version": "1.0.0",
    "agent_name": "BonCore Hardware Agent"
}
PENDING_COMMANDS: Dict[str, Any] = {}
COMPLETED_RESULTS: Dict[str, Any] = {}

def get_public_server_url(request: Request) -> str:
    # 1. Check if client is accessing via domain or external IP
    fwd_host = request.headers.get("x-forwarded-host") or request.headers.get("host")
    fwd_proto = request.headers.get("x-forwarded-proto") or ("https" if request.url.scheme == "https" else "http")
    if fwd_host and "localhost" not in fwd_host and "127.0.0.1" not in fwd_host:
        return f"{fwd_proto}://{fwd_host}"

    # 2. Permanent static public IP of this server
    return "http://77.67.29.77"

class AgentHeartbeatSchema(BaseModel):
    local_ip: Optional[str] = "127.0.0.1"
    version: Optional[str] = "1.0.0"
    agent_name: Optional[str] = "BonCore Hardware Agent"

class AgentReportSchema(BaseModel):
    req_id: str
    success: bool
    weight: Optional[float] = 0.0
    unit: Optional[str] = "kg"
    grams: Optional[int] = 0
    is_stable: Optional[bool] = True
    raw: Optional[str] = ""
    error: Optional[str] = None
    ip: Optional[str] = None
    latency_ms: Optional[float] = None
    message: Optional[str] = None

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

@router.get("/download-agent")
async def download_agent(request: Request):
    """
    Downloads the BonCore Hardware Bridge Agent zip package with auto-configured server_url.
    """
    server_base = get_public_server_url(request)

    mem_zip = io.BytesIO()
    with zipfile.ZipFile(mem_zip, mode="w", compression=zipfile.ZIP_STORED) as zf:
        root_agent_dir = r"C:\Users\Administrator\Documents\BonCore\hardware_agent"
        exe_path = os.path.join(root_agent_dir, "BonCoreAgent.exe")
        kurulum_path = os.path.join(root_agent_dir, "Kurulum.bat")
        agent_py_path = os.path.join(root_agent_dir, "boncore_agent.py")
        desktop_py_path = os.path.join(root_agent_dir, "desktop_app.py")
        run_bat_path = os.path.join(root_agent_dir, "run_agent.bat")

        if os.path.exists(exe_path):
            with open(exe_path, "rb") as f:
                zf.writestr("BonCoreAgent.exe", f.read())
        if os.path.exists(kurulum_path):
            with open(kurulum_path, "r", encoding="utf-8") as f:
                zf.writestr("Kurulum.bat", f.read())
        if os.path.exists(agent_py_path):
            with open(agent_py_path, "r", encoding="utf-8") as f:
                zf.writestr("boncore_agent.py", f.read())
        if os.path.exists(desktop_py_path):
            with open(desktop_py_path, "r", encoding="utf-8") as f:
                zf.writestr("desktop_app.py", f.read())
        if os.path.exists(run_bat_path):
            with open(run_bat_path, "r", encoding="utf-8") as f:
                zf.writestr("run_agent.bat", f.read())

        config_content = json.dumps({
            "server_url": server_base,
            "scale_default_ip": "192.168.1.150",
            "scale_default_port": 2004
        }, indent=2)
        zf.writestr("config.json", config_content)

    mem_zip.seek(0)
    data = mem_zip.getvalue()
    return Response(
        content=data,
        media_type="application/zip",
        headers={
            "Content-Disposition": "attachment; filename=boncore-hardware-agent.zip",
            "Content-Length": str(len(data))
        }
    )

@router.post("/agent/heartbeat")
async def agent_heartbeat(payload: AgentHeartbeatSchema):
    """
    Agent calls this every 2 seconds to announce its presence.
    """
    AGENT_STATE["last_seen"] = time.time()
    if payload.local_ip:
        AGENT_STATE["local_ip"] = payload.local_ip
    if payload.version:
        AGENT_STATE["version"] = payload.version
    return {"status": "ok", "server_time": time.time()}

@router.get("/agent/status")
async def get_agent_status():
    """
    Frontend checks if the agent is actively running.
    """
    diff = time.time() - AGENT_STATE["last_seen"]
    is_online = diff < 15.0
    return {
        "isOnline": is_online,
        "localIp": AGENT_STATE["local_ip"] if is_online else None,
        "version": AGENT_STATE["version"] if is_online else None,
        "last_seen_seconds_ago": round(diff, 1) if AGENT_STATE["last_seen"] > 0 else 999
    }

@router.get("/agent/poll")
async def agent_poll():
    """
    Agent polls this endpoint every 300ms to receive commands (e.g. read weight).
    """
    now = time.time()
    for req_id, cmd in list(PENDING_COMMANDS.items()):
        if now - cmd.get("created_at", 0) < 10.0:
            del PENDING_COMMANDS[req_id]
            return {"has_command": True, "req_id": req_id, **cmd}
        else:
            del PENDING_COMMANDS[req_id]
    return {"has_command": False}

@router.post("/agent/report")
async def agent_report(payload: AgentReportSchema):
    """
    Agent posts the weight or test result back to the server.
    """
    COMPLETED_RESULTS[payload.req_id] = payload.model_dump()
    return {"status": "received"}

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
    If agent is online, delegates ping to the cashier PC agent.
    """
    is_agent_online = (time.time() - AGENT_STATE["last_seen"]) < 8.0
    if is_agent_online:
        req_id = str(uuid.uuid4())
        PENDING_COMMANDS[req_id] = {
            "action": "test_connection",
            "ip": payload.ip_address.strip(),
            "port": int(payload.port),
            "timeout": float(payload.timeout),
            "created_at": time.time()
        }
        for _ in range(30):
            await asyncio.sleep(0.1)
            if req_id in COMPLETED_RESULTS:
                res = COMPLETED_RESULTS.pop(req_id)
                res["bridge"] = f"BonCore Ajanı (Kasa IP: {AGENT_STATE['local_ip']})"
                return res

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
    If BonCore agent is online, relays request to the cashier PC's agent.
    """
    cfg = await scale_service.get_scale_config(db)
    target_ip = (ip or cfg.get("ip_address") or "192.168.1.150").strip()
    target_port = int(port or cfg.get("port") or 2004)
    timeout = float(cfg.get("timeout") or 2.5)

    is_agent_online = (time.time() - AGENT_STATE["last_seen"]) < 8.0
    if is_agent_online:
        req_id = str(uuid.uuid4())
        PENDING_COMMANDS[req_id] = {
            "action": "read_weight",
            "ip": target_ip,
            "port": target_port,
            "timeout": timeout,
            "created_at": time.time()
        }
        for _ in range(35):
            await asyncio.sleep(0.1)
            if req_id in COMPLETED_RESULTS:
                res = COMPLETED_RESULTS.pop(req_id)
                res["bridge"] = f"BonCore Ajanı (Kasa IP: {AGENT_STATE['local_ip']})"
                return res

        return {
            "success": False,
            "weight": 0.0,
            "error": f"Kasa bilgisayarındaki ajan teraziye bağlanamadı ({target_ip}:{target_port}). Terazinin açık ve ağ kablosunun takılı olduğundan emin olun."
        }

    result = await asyncio.to_thread(
        scale_service.sync_read_cas_cl3000,
        target_ip,
        target_port,
        timeout
    )

    if not result.get("success") and not cfg.get("enabled", True):
        return {
            "success": False,
            "error": "Terazi entegrasyonu sistem ayarlarından devre dışı bırakılmış."
        }

    return result
