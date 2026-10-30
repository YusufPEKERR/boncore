from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any, Optional, List
from pydantic import BaseModel
import asyncio
import os
import json
import time
import uuid
import zipfile
import io
import re
from app.database import (
    get_db, 
    resolve_tenant_code_from_request, 
    clean_tenant_code, 
    DEFAULT_TENANT_CODE, 
    _TENANTS_DIR
)
from app.services import scale_service

router = APIRouter(prefix="/scale", tags=["Hardware & CAS Scale Integration"])

# Legacy fallback file
LEGACY_TERMINALS_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "terminals.json")

def get_terminals_file(tenant_code: Optional[str] = None) -> str:
    code = clean_tenant_code(tenant_code)
    os.makedirs(_TENANTS_DIR, exist_ok=True)
    tenant_file = os.path.join(_TENANTS_DIR, f"{code}_terminals.json")
    if not os.path.exists(tenant_file) and code == DEFAULT_TENANT_CODE and os.path.exists(LEGACY_TERMINALS_FILE):
        try:
            with open(LEGACY_TERMINALS_FILE, "r", encoding="utf-8") as rf:
                content = rf.read()
            with open(tenant_file, "w", encoding="utf-8") as wf:
                wf.write(content)
        except Exception:
            pass
    return tenant_file

VIRTUAL_PRINTER_KEYWORDS = (
    "microsoft print to pdf",
    "microsoft xps",
    "onenote",
    "fax",
    "anydesk printer",
    "send to onenote"
)

def is_virtual_printer(p_name: str) -> bool:
    low = (p_name or "").lower()
    return any(k in low for k in VIRTUAL_PRINTER_KEYWORDS)

def sort_printers(printers: list) -> list:
    unique = []
    for p in (printers or []):
        if p and p not in unique:
            unique.append(p)
    # Fiziksel termal yazıcılar önce (alfabetik), sanal sistem yazıcıları sonra (alfabetik)
    unique.sort(key=lambda x: (is_virtual_printer(x), x.lower()))
    return unique

def consolidate_terminals_by_ip(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Aynı yerel IP (local_ip) adresinden gelen mükerrer kasa kayıtlarını tek bir kasa altında birleştirir,
    özel ayarlanmış Kasa İsmi, Terazi IP ve Port bilgilerini korur.
    """
    by_ip: Dict[str, Dict[str, Any]] = {}
    for tid, t in data.items():
        ip = (t.get("local_ip") or "").strip()
        key = ip if (ip and ip not in ("-", "127.0.0.1")) else tid
        if key not in by_ip:
            merged = dict(t)
            merged["alias_ids"] = list(set((t.get("alias_ids") or []) + [tid, merged.get("id", tid)]))
            merged["printers"] = sort_printers(merged.get("printers", []))
            by_ip[key] = merged
        else:
            existing = by_ip[key]
            aliases = set(existing.get("alias_ids") or [])
            aliases.update(t.get("alias_ids") or [])
            aliases.add(tid)
            aliases.add(t.get("id", tid))
            existing["alias_ids"] = list(aliases)

            # En güncel last_seen olanın aktif id'sini al
            if float(t.get("last_seen", 0)) >= float(existing.get("last_seen", 0)):
                existing["id"] = t.get("id", tid)
                existing["last_seen"] = t.get("last_seen", 0)
                existing["version"] = t.get("version") or existing.get("version", "2.2.0")
                existing["scale_connected"] = t.get("scale_connected", existing.get("scale_connected", False))
                if t.get("last_weight"):
                    existing["last_weight"] = t.get("last_weight")

            # Özel isim varsa ("Kasa 1" dışındaki isimleri koru)
            for cand_name in [existing.get("custom_name"), t.get("custom_name"), existing.get("name"), t.get("name")]:
                if cand_name and cand_name not in ("Kasa 1", "Kasa"):
                    existing["name"] = cand_name
                    existing["custom_name"] = cand_name
                    break

            # Özel Terazi IP/Port varsa (192.168.1.150:2004 dışındaki ayarları koru)
            for cand_ip in [existing.get("custom_scale_ip"), t.get("custom_scale_ip"), existing.get("scale_ip"), t.get("scale_ip")]:
                if cand_ip and cand_ip != "192.168.1.150":
                    existing["scale_ip"] = cand_ip
                    existing["custom_scale_ip"] = cand_ip
                    break

            for cand_port in [existing.get("custom_scale_port"), t.get("custom_scale_port"), existing.get("scale_port"), t.get("scale_port")]:
                if cand_port and int(cand_port) != 2004:
                    existing["scale_port"] = int(cand_port)
                    existing["custom_scale_port"] = int(cand_port)
                    break

            # Yazıcıları birleştir ve isme göre sırala
            combined_printers = (existing.get("printers") or []) + (t.get("printers") or [])
            existing["printers"] = sort_printers(combined_printers)
            if t.get("is_default"):
                existing["is_default"] = True

    out: Dict[str, Any] = {}
    for item in by_ip.values():
        out[item["id"]] = item
    return out

def load_terminals(tenant_code: Optional[str] = None) -> Dict[str, Any]:
    file_path = get_terminals_file(tenant_code)
    if os.path.exists(file_path):
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                raw = json.load(f)
            consolidated = consolidate_terminals_by_ip(raw)
            if len(consolidated) != len(raw):
                save_terminals(consolidated, tenant_code)
            return consolidated
        except Exception:
            pass
    return {}

def save_terminals(data: Dict[str, Any], tenant_code: Optional[str] = None):
    file_path = get_terminals_file(tenant_code)
    try:
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving terminals for {tenant_code}:", e)

AGENT_STATES_BY_TENANT: Dict[str, Dict[str, Any]] = {}
PENDING_COMMANDS_BY_TENANT: Dict[str, Dict[str, Any]] = {}
COMPLETED_RESULTS_BY_TENANT: Dict[str, Dict[str, Any]] = {}

def get_tenant_agent_state(tenant_code: Optional[str] = None) -> Dict[str, Any]:
    code = clean_tenant_code(tenant_code)
    if code not in AGENT_STATES_BY_TENANT:
        AGENT_STATES_BY_TENANT[code] = {
            "last_seen": 0.0,
            "local_ip": "127.0.0.1",
            "version": "2.2.0",
            "agent_name": "Kasa 1"
        }
    return AGENT_STATES_BY_TENANT[code]

def get_tenant_pending_commands(tenant_code: Optional[str] = None) -> Dict[str, Any]:
    code = clean_tenant_code(tenant_code)
    if code not in PENDING_COMMANDS_BY_TENANT:
        PENDING_COMMANDS_BY_TENANT[code] = {}
    return PENDING_COMMANDS_BY_TENANT[code]

def get_tenant_completed_results(tenant_code: Optional[str] = None) -> Dict[str, Any]:
    code = clean_tenant_code(tenant_code)
    if code not in COMPLETED_RESULTS_BY_TENANT:
        COMPLETED_RESULTS_BY_TENANT[code] = {}
    return COMPLETED_RESULTS_BY_TENANT[code]

def get_public_server_url(request: Request) -> str:
    fwd_host = request.headers.get("x-forwarded-host") or request.headers.get("host")
    fwd_proto = request.headers.get("x-forwarded-proto") or ("https" if request.url.scheme == "https" else "http")
    if fwd_host and "localhost" not in fwd_host and "127.0.0.1" not in fwd_host:
        return f"{fwd_proto}://{fwd_host}"
    return "http://77.67.29.77"

class AgentHeartbeatSchema(BaseModel):
    terminal_id: Optional[str] = "kasa-1"
    terminal_name: Optional[str] = "Kasa 1"
    local_ip: Optional[str] = "127.0.0.1"
    version: Optional[str] = "2.2.0"
    agent_name: Optional[str] = "BonCore Hardware Agent"
    scale_connected: Optional[bool] = False
    scale_ip: Optional[str] = "192.168.1.150"
    scale_port: Optional[int] = 2004
    last_weight: Optional[float] = 0.0
    printers: Optional[list] = []
    user_configured: Optional[bool] = False
    restaurant_code: Optional[str] = None

class TerminalUpdateSchema(BaseModel):
    name: Optional[str] = None
    scale_ip: Optional[str] = None
    scale_port: Optional[int] = None
    is_default: Optional[bool] = None
    restaurant_code: Optional[str] = None

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
    port: Optional[int] = None
    open_ports: Optional[list] = []
    hex: Optional[str] = ""
    latency_ms: Optional[float] = None
    message: Optional[str] = None
    results: Optional[list] = None
    restaurant_code: Optional[str] = None

class ScaleConfigSchema(BaseModel):
    enabled: Optional[bool] = True
    model: Optional[str] = "CAS CL-3000"
    connection_type: Optional[str] = "ethernet"
    ip_address: Optional[str] = "192.168.1.150"
    port: Optional[int] = 2004
    timeout: Optional[float] = 2.5
    demo_mode: Optional[bool] = False
    restaurant_code: Optional[str] = None

class ScaleTestSchema(BaseModel):
    ip_address: str
    port: int = 2004
    timeout: float = 2.0
    terminal_id: Optional[str] = None
    restaurant_code: Optional[str] = None

@router.get("/download-agent")
async def download_agent(
    request: Request,
    terminal_name: Optional[str] = Query(None),
    terminal_id: Optional[str] = Query(None),
    scale_ip: Optional[str] = Query(None),
    scale_port: Optional[int] = Query(None),
    restaurant_code: Optional[str] = Query(None)
):
    """
    Downloads the BonCore Hardware Bridge Agent zip package with auto-configured server_url and Kasa name.
    """
    tenant_code = (restaurant_code or "").strip() or resolve_tenant_code_from_request(request)
    server_base = get_public_server_url(request)
    kasa_name = (terminal_name or "Kasa 1").strip()
    kasa_id = (terminal_id or f"kasa_{uuid.uuid4().hex[:6]}").strip()

    if not scale_ip or not scale_port:
        terminals = load_terminals(tenant_code)
        if kasa_id in terminals:
            scale_ip = scale_ip or terminals[kasa_id].get("scale_ip")
            scale_port = scale_port or terminals[kasa_id].get("scale_port")

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
            with open(kurulum_path, "rb") as f:
                c = f.read().replace(b"\r\n", b"\n").replace(b"\n", b"\r\n")
                zf.writestr("Kurulum.bat", c)
        if os.path.exists(agent_py_path):
            with open(agent_py_path, "rb") as f:
                zf.writestr("boncore_agent.py", f.read())
        if os.path.exists(desktop_py_path):
            with open(desktop_py_path, "rb") as f:
                zf.writestr("desktop_app.py", f.read())
        if os.path.exists(run_bat_path):
            with open(run_bat_path, "rb") as f:
                c = f.read().replace(b"\r\n", b"\n").replace(b"\n", b"\r\n")
                zf.writestr("run_agent.bat", c)

        config_content = json.dumps({
            "server_url": server_base,
            "restaurant_code": tenant_code,
            "terminal_id": kasa_id,
            "terminal_name": kasa_name,
            "scale_default_ip": (scale_ip or "192.168.1.150").strip(),
            "scale_default_port": int(scale_port or 2004),
            "auto_start": True,
            "minimize_to_tray": True,
            "show_notifications": True
        }, indent=2, ensure_ascii=False)
        zf.writestr("config.json", config_content)

    mem_zip.seek(0)
    data = mem_zip.getvalue()
    return Response(
        content=data,
        media_type="application/zip",
        headers={
            "Content-Disposition": f"attachment; filename=boncore-hardware-agent-{kasa_name}.zip",
            "Content-Length": str(len(data))
        }
    )

@router.get("/terminals")
async def get_terminals(request: Request):
    """
    Returns list of all registered Kasalar (Terminals) with real-time status and sorted printers.
    """
    tenant_code = resolve_tenant_code_from_request(request)
    terminals = load_terminals(tenant_code)
    now = time.time()
    result = []

    for t_id, t in terminals.items():
        diff = now - t.get("last_seen", 0)
        is_online = diff < 15.0
        sorted_printers = sort_printers(t.get("printers", []))
        result.append({
            "id": t_id,
            "name": t.get("custom_name") or t.get("name", "Kasa"),
            "local_ip": t.get("local_ip", "-"),
            "version": t.get("version", "2.2.0"),
            "is_online": is_online,
            "last_seen_seconds_ago": round(diff, 1) if t.get("last_seen", 0) > 0 else 999,
            "scale_connected": t.get("scale_connected", False) if is_online else False,
            "scale_ip": t.get("custom_scale_ip") or t.get("scale_ip", "192.168.1.150"),
            "scale_port": int(t.get("custom_scale_port") or t.get("scale_port", 2004)),
            "last_weight": t.get("last_weight", 0.0),
            "printers": sorted_printers,
            "is_default": t.get("is_default", False)
        })

    # Varsayılan önce, sonra çevrimiçi durumu, sonra IP ve isme göre sırala
    result.sort(key=lambda x: (not x["is_default"], not x["is_online"], x["name"], x["local_ip"]))
    return {"terminals": result}

@router.put("/terminals/{terminal_id}")
async def update_terminal(terminal_id: str, payload: TerminalUpdateSchema, request: Request):
    """
    Updates terminal name, scale IP/port, or default status from Admin panel.
    """
    tenant_code = (payload.restaurant_code or "").strip() or resolve_tenant_code_from_request(request)
    terminals = load_terminals(tenant_code)
    target_key = terminal_id
    if target_key not in terminals:
        for tid, t in terminals.items():
            if terminal_id in (t.get("alias_ids") or []) or terminal_id == t.get("local_ip"):
                target_key = tid
                break

    if target_key not in terminals:
        terminals[target_key] = {
            "id": target_key,
            "name": payload.name or "Yeni Kasa",
            "last_seen": 0,
            "is_default": False
        }

    if payload.name:
        clean_name = payload.name.strip()
        terminals[target_key]["name"] = clean_name
        terminals[target_key]["custom_name"] = clean_name
        terminals[target_key]["admin_override"] = True

    if payload.scale_ip:
        clean_ip = payload.scale_ip.strip()
        terminals[target_key]["scale_ip"] = clean_ip
        terminals[target_key]["custom_scale_ip"] = clean_ip
        terminals[target_key]["admin_override"] = True

    if payload.scale_port:
        terminals[target_key]["scale_port"] = int(payload.scale_port)
        terminals[target_key]["custom_scale_port"] = int(payload.scale_port)
        terminals[target_key]["admin_override"] = True

    if payload.is_default is not None:
        for tid in terminals:
            terminals[tid]["is_default"] = (tid == target_key and payload.is_default)

    save_terminals(terminals, tenant_code)
    return {"success": True, "terminal": terminals[target_key]}

@router.delete("/terminals/{terminal_id}")
async def delete_terminal(terminal_id: str, request: Request):
    """
    Removes a terminal from the registry.
    """
    tenant_code = resolve_tenant_code_from_request(request)
    terminals = load_terminals(tenant_code)
    if terminal_id in terminals:
        del terminals[terminal_id]
        save_terminals(terminals, tenant_code)
        return {"success": True, "message": "Kasa silindi."}
    return {"success": False, "message": "Kasa bulunamadı."}

@router.post("/agent/heartbeat")
async def agent_heartbeat(payload: AgentHeartbeatSchema, request: Request):
    """
    Agent calls this every 4 seconds to announce its presence.
    Consolidates by local_ip and preserves custom Kasa Name, Scale IP, and Scale Port across restarts.
    """
    tenant_code = (payload.restaurant_code or "").strip() or resolve_tenant_code_from_request(request)
    terminals = load_terminals(tenant_code)
    t_id = (payload.terminal_id or "kasa-1").strip()
    local_ip = (payload.local_ip or "127.0.0.1").strip()
    now = time.time()

    # Aynı local_ip ile kayıtlı mevcut kasayı bul (Ajan kapanıp açıldığında yeni ID üretmiş olsa bile aynı kasayı kullan)
    existing_key = t_id if t_id in terminals else None
    if not existing_key and local_ip not in ("127.0.0.1", "-"):
        for tid, t in terminals.items():
            if t.get("local_ip") == local_ip or t_id in (t.get("alias_ids") or []):
                existing_key = tid
                break

    existing = terminals.get(existing_key, {}) if existing_key else {}
    if existing_key and existing_key != t_id:
        del terminals[existing_key]

    aliases = set(existing.get("alias_ids") or [])
    aliases.add(t_id)
    if existing_key:
        aliases.add(existing_key)

    # Kasa İsmi: Kullanıcı ajandan değiştirdiyse veya "Kasa 1" dışında bir isim gönderdiyse güncelle, aksi halde kayıtlı özel ismi koru
    incoming_name = (payload.terminal_name or "").strip()
    saved_custom_name = existing.get("custom_name") or existing.get("name")
    if payload.user_configured and incoming_name:
        final_name = incoming_name
        custom_name = incoming_name
    elif incoming_name and incoming_name not in ("Kasa 1", "Kasa"):
        final_name = incoming_name
        custom_name = incoming_name
    elif saved_custom_name and saved_custom_name not in ("Kasa 1", "Kasa"):
        final_name = saved_custom_name
        custom_name = saved_custom_name
    else:
        final_name = incoming_name or saved_custom_name or "Kasa 1"
        custom_name = existing.get("custom_name")

    # Terazi IP ve Port: Kullanıcı ajandan değiştirdiyse veya varsayılan (192.168.1.150:2004) dışında gönderdiyse kaydet, aksi halde kayıtlı özel IP/Portu koru
    incoming_scale_ip = (payload.scale_ip or "192.168.1.150").strip()
    incoming_scale_port = int(payload.scale_port or 2004)
    saved_custom_ip = existing.get("custom_scale_ip")
    saved_custom_port = existing.get("custom_scale_port")

    if payload.user_configured:
        final_scale_ip = incoming_scale_ip
        final_scale_port = incoming_scale_port
        custom_scale_ip = incoming_scale_ip
        custom_scale_port = incoming_scale_port
    else:
        if incoming_scale_ip != "192.168.1.150":
            final_scale_ip = incoming_scale_ip
            custom_scale_ip = incoming_scale_ip
        elif saved_custom_ip:
            final_scale_ip = saved_custom_ip
            custom_scale_ip = saved_custom_ip
        else:
            final_scale_ip = incoming_scale_ip
            custom_scale_ip = None

        if incoming_scale_port != 2004:
            final_scale_port = incoming_scale_port
            custom_scale_port = incoming_scale_port
        elif saved_custom_port:
            final_scale_port = int(saved_custom_port)
            custom_scale_port = int(saved_custom_port)
        else:
            final_scale_port = incoming_scale_port
            custom_scale_port = None

    admin_override = bool(existing.get("admin_override", False))

    terminals[t_id] = {
        "id": t_id,
        "alias_ids": list(aliases),
        "name": final_name,
        "custom_name": custom_name,
        "local_ip": local_ip,
        "version": payload.version or "2.2.0",
        "scale_connected": bool(payload.scale_connected),
        "scale_ip": final_scale_ip,
        "custom_scale_ip": custom_scale_ip,
        "scale_port": final_scale_port,
        "custom_scale_port": custom_scale_port,
        "last_weight": payload.last_weight or 0.0,
        "printers": sort_printers(payload.printers or existing.get("printers") or []),
        "last_seen": now,
        "is_default": existing.get("is_default", len(terminals) == 0),
        "admin_override": False
    }
    save_terminals(terminals, tenant_code)

    agent_state = get_tenant_agent_state(tenant_code)
    agent_state["last_seen"] = now
    agent_state["local_ip"] = local_ip
    agent_state["version"] = payload.version
    agent_state["agent_name"] = final_name

    return {
        "status": "ok",
        "terminal_id": t_id,
        "terminal_name": final_name,
        "scale_ip": final_scale_ip,
        "scale_port": final_scale_port,
        "admin_override": admin_override,
        "server_time": now
    }

@router.get("/agent/status")
async def get_agent_status(request: Request, terminal_id: Optional[str] = Query(None)):
    """
    Frontend checks if any or a specific Kasa agent is actively running.
    """
    tenant_code = resolve_tenant_code_from_request(request)
    terminals = load_terminals(tenant_code)
    now = time.time()
    agent_state = get_tenant_agent_state(tenant_code)

    if terminal_id and terminal_id in terminals:
        t = terminals[terminal_id]
        diff = now - t.get("last_seen", 0)
        is_online = diff < 15.0
        return {
            "isOnline": is_online,
            "terminalId": t["id"],
            "terminalName": t.get("name", "Kasa"),
            "localIp": t.get("local_ip") if is_online else None,
            "version": t.get("version") if is_online else None,
            "scaleConnected": t.get("scale_connected", False) if is_online else False,
            "last_seen_seconds_ago": round(diff, 1) if t.get("last_seen", 0) > 0 else 999
        }

    online_terms = [t for t in terminals.values() if (now - t.get("last_seen", 0)) < 15.0]
    is_online = len(online_terms) > 0
    active_t = next((t for t in online_terms if t.get("is_default")), online_terms[0]) if online_terms else None

    diff = now - agent_state["last_seen"]
    return {
        "isOnline": is_online or (diff < 15.0),
        "terminalId": active_t["id"] if active_t else None,
        "terminalName": active_t["name"] if active_t else agent_state.get("agent_name"),
        "localIp": active_t["local_ip"] if active_t else agent_state.get("local_ip"),
        "version": active_t["version"] if active_t else agent_state.get("version"),
        "activeTerminalsCount": len(online_terms),
        "last_seen_seconds_ago": round(diff, 1) if agent_state["last_seen"] > 0 else 999
    }

@router.get("/agent/poll")
async def agent_poll(
    request: Request,
    terminal_id: Optional[str] = Query(None),
    restaurant_code: Optional[str] = Query(None)
):
    """
    Agent polls this endpoint every 1s to receive commands for its specific Kasa (matching id or alias_ids).
    """
    now = time.time()
    tenant_code = (restaurant_code or "").strip() or resolve_tenant_code_from_request(request)
    terminals = load_terminals(tenant_code)
    pending_commands = get_tenant_pending_commands(tenant_code)

    matched_canonical_id = terminal_id
    for tid, t in terminals.items():
        if terminal_id == tid or terminal_id in (t.get("alias_ids") or []):
            matched_canonical_id = tid
            break

    for req_id, cmd in list(pending_commands.items()):
        cmd_target = cmd.get("terminal_id")
        if cmd_target is None or cmd_target in (terminal_id, matched_canonical_id):
            if now - cmd.get("created_at", 0) < 10.0:
                del pending_commands[req_id]
                return {"has_command": True, "req_id": req_id, **cmd}
            else:
                del pending_commands[req_id]
    return {"has_command": False}

@router.get("/agent/version")
async def get_latest_agent_version():
    """
    Returns the latest compiled agent version for automatic self-update.
    """
    return {"version": "2.2.0"}

@router.get("/agent/exe")
async def download_raw_exe():
    """
    Serves the latest BonCoreAgent.exe binary directly for automatic self-update.
    """
    exe_path = r"C:\Users\Administrator\Documents\BonCore\hardware_agent\BonCoreAgent.exe"
    if os.path.exists(exe_path):
        with open(exe_path, "rb") as f:
            content = f.read()
        return Response(content=content, media_type="application/octet-stream")
    return Response(status_code=404, content=b"Not found")

class RemoteProbeSchema(BaseModel):
    terminal_id: Optional[str] = None
    ip: Optional[str] = "192.168.0.15"
    port: Optional[int] = 20304
    hex_payloads: Optional[list] = []
    eval_code: Optional[str] = None
    restaurant_code: Optional[str] = None

@router.post("/agent/probe")
async def run_remote_probe(payload: RemoteProbeSchema, request: Request):
    """
    Dispatches a diagnostic probe or custom hex sequence to the cashier agent and returns raw results.
    """
    tenant_code = (payload.restaurant_code or "").strip() or resolve_tenant_code_from_request(request)
    terminals = load_terminals(tenant_code)
    pending_commands = get_tenant_pending_commands(tenant_code)
    completed_results = get_tenant_completed_results(tenant_code)
    now = time.time()
    target_term = None
    if payload.terminal_id and payload.terminal_id in terminals:
        target_term = terminals[payload.terminal_id]
    else:
        online_terms = [t for t in terminals.values() if (now - t.get("last_seen", 0)) < 15.0]
        if online_terms:
            target_term = next((t for t in online_terms if t.get("is_default")), online_terms[0])

    if not target_term:
        return {"success": False, "error": "No online terminal found"}

    req_id = str(uuid.uuid4())
    pending_commands[req_id] = {
        "terminal_id": target_term["id"],
        "action": "remote_probe",
        "ip": payload.ip,
        "port": payload.port,
        "hex_payloads": payload.hex_payloads,
        "eval_code": payload.eval_code,
        "created_at": time.time()
    }
    for _ in range(60):
        await asyncio.sleep(0.1)
        if req_id in completed_results:
            return completed_results.pop(req_id)
    return {"success": False, "error": "Probe timeout"}

@router.post("/agent/report")
async def agent_report(payload: AgentReportSchema, request: Request):
    """
    Agent posts the weight, test result, or print result back to the server.
    """
    tenant_code = (payload.restaurant_code or "").strip() or resolve_tenant_code_from_request(request)
    completed_results = get_tenant_completed_results(tenant_code)
    data = payload.model_dump()
    completed_results[payload.req_id] = data

    try:
        with open("last_agent_report.json", "w", encoding="utf-8") as rf:
            json.dump(data, rf, ensure_ascii=False, indent=2)
    except Exception:
        pass
    print(f"=== LIVE AGENT REPORT RECEIVED [{tenant_code}] ===", data.get("req_id"), "success:", data.get("success"), "weight:", data.get("weight"), flush=True)
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
async def test_connection(payload: ScaleTestSchema, request: Request):
    """
    Tests TCP connection directly or relays through a specific Kasa agent.
    """
    tenant_code = (payload.restaurant_code or "").strip() or resolve_tenant_code_from_request(request)
    terminals = load_terminals(tenant_code)
    pending_commands = get_tenant_pending_commands(tenant_code)
    completed_results = get_tenant_completed_results(tenant_code)
    now = time.time()

    target_term = None
    if payload.terminal_id and payload.terminal_id in terminals:
        target_term = terminals[payload.terminal_id]
    elif payload.terminal_id:
        target_term = next((t for t in terminals.values() if t.get("local_ip") == payload.terminal_id or payload.terminal_id in t.get("alias_ids", [])), None)
    else:
        online_terms = [t for t in terminals.values() if (now - t.get("last_seen", 0)) < 15.0]
        if online_terms:
            target_term = next((t for t in online_terms if t.get("is_default")), online_terms[0])

    if target_term and (now - target_term.get("last_seen", 0)) < 15.0:
        req_id = str(uuid.uuid4())
        pending_commands[req_id] = {
            "terminal_id": target_term["id"],
            "action": "test_connection",
            "ip": payload.ip_address.strip(),
            "port": int(payload.port),
            "timeout": float(payload.timeout),
            "created_at": time.time()
        }
        for _ in range(30):
            await asyncio.sleep(0.1)
            if req_id in completed_results:
                res = completed_results.pop(req_id)
                res["bridge"] = f"{target_term['name']} (IP: {target_term.get('local_ip', '-')})"
                return res

    result = await asyncio.to_thread(
        scale_service.test_tcp_connectivity,
        payload.ip_address.strip(),
        int(payload.port),
        float(payload.timeout)
    )
    return result

class PrintRequestSchema(BaseModel):
    terminal_id: Optional[str] = None
    printers: Optional[list] = []
    raw_text: Optional[str] = None
    doc_type: Optional[str] = "adisyon"
    document: Optional[Dict[str, Any]] = None
    restaurant_code: Optional[str] = None

def build_receipt_text(doc: Dict[str, Any]) -> str:
    company = doc.get("company_title") or "BONCORE RESTORAN"
    table = doc.get("table_name") or "Hızlı Satış"
    waiter = doc.get("waiter_name") or "-"
    cashier = doc.get("cashier_name") or "-"
    date_str = doc.get("date") or time.strftime("%d.%m.%Y")
    time_str = doc.get("time") or time.strftime("%H:%M")
    doc_no = doc.get("doc_no") or f"BON-{int(time.time())%100000}"

    lines = []
    lines.append("================================")
    lines.append(f"{company.center(32)}")
    lines.append("       E-ADISYON FISI           ")
    lines.append("================================")
    lines.append(f"Masa: {table:<12} Tarih: {date_str}")
    lines.append(f"Belge: {doc_no:<11} Saat:  {time_str}")
    lines.append(f"Kasiyer: {cashier:<10} Garson: {waiter}")
    lines.append("--------------------------------")
    lines.append("URUN             ADET      TUTAR")
    lines.append("--------------------------------")

    items = doc.get("items") or []
    for it in items:
        pname = it.get("product_name") or "Urun"
        if it.get("variant"):
            pname += f" ({it['variant']})"
        pname = pname[:16]
        qty = it.get("quantity", 1)
        qty_str = f"{qty:.3f}" if isinstance(qty, float) and not qty.is_integer() else str(int(qty))
        t_price = float(it.get("total_price") or 0.0)
        lines.append(f"{pname:<16} {qty_str:>4} {t_price:>9.2f} TL")

    lines.append("--------------------------------")
    subtotal = float(doc.get("subtotal") or 0.0)
    grand_total = float(doc.get("grand_total") or subtotal)
    discount = float(doc.get("discount") or 0.0)

    if discount > 0:
        lines.append(f"Ara Toplam:           {subtotal:>9.2f} TL")
        lines.append(f"Indirim:             -{discount:>9.2f} TL")
    lines.append(f"GENEL TOPLAM:         {grand_total:>9.2f} TL")

    payments = doc.get("payments") or []
    for p in payments:
        plabel = p.get("label") or p.get("method") or "Odeme"
        pamount = float(p.get("amount") or 0.0)
        lines.append(f"Odeme ({plabel}):      {pamount:>9.2f} TL")

    lines.append("================================")
    lines.append("    AFIYET OLSUN / TESEKKURLER  ")
    lines.append("================================")
    lines.append("\n\n\n")
    return "\n".join(lines)

@router.post("/print")
async def print_receipt(payload: PrintRequestSchema, request: Request):
    """
    Relays a receipt print job to one or multiple physical Windows thermal printers via the cashier PC agent(s).
    Supports IP-qualified printer keys like "192.168.0.120::MUTFAK-POS" so printers on different cashier PCs never get mixed up.
    """
    tenant_code = (payload.restaurant_code or "").strip() or resolve_tenant_code_from_request(request)
    terminals = load_terminals(tenant_code)
    pending_commands = get_tenant_pending_commands(tenant_code)
    completed_results = get_tenant_completed_results(tenant_code)
    now = time.time()

    raw_text = payload.raw_text
    if not raw_text and payload.document:
        raw_text = build_receipt_text(payload.document)
    elif not raw_text:
        raw_text = "BONCORE TEST YAZDIRMA\n--------------------\nTarih: " + time.strftime("%d.%m.%Y %H:%M") + "\nYazici testi basarili!\n\n\n\n"

    online_terms = [t for t in terminals.values() if (now - t.get("last_seen", 0)) < 15.0]
    default_term = None
    if payload.terminal_id and payload.terminal_id in terminals:
        default_term = terminals[payload.terminal_id]
    elif payload.terminal_id:
        default_term = next((t for t in terminals.values() if t.get("local_ip") == payload.terminal_id), None)
    if not default_term and online_terms:
        default_term = next((t for t in online_terms if t.get("is_default")), online_terms[0])

    requested_printers = payload.printers or []
    if not requested_printers and default_term:
        requested_printers = [
            f"{default_term.get('local_ip', default_term['id'])}::{p}"
            for p in sort_printers(default_term.get("printers", []))[:1]
        ]

    if not requested_printers:
        return {
            "success": False,
            "error": "Seçili yazıcı bulunamadı veya kasa bilgisayarında tanımlı yazıcı yok."
        }

    # Yazıcıları ait oldukları Kasa / IP adresine göre grupla
    jobs_by_terminal: Dict[str, Dict[str, Any]] = {}
    for item in requested_printers:
        raw_item = str(item or "").strip()
        if not raw_item:
            continue

        matched_term = None
        printer_name = raw_item

        if "::" in raw_item:
            prefix, printer_name = raw_item.split("::", 1)
            prefix = prefix.strip()
            printer_name = printer_name.strip()
            matched_term = next(
                (t for t in terminals.values() if t.get("local_ip") == prefix or t.get("id") == prefix or prefix in t.get("alias_ids", [])),
                None
            )
        else:
            if default_term and printer_name in (default_term.get("printers") or []):
                matched_term = default_term
            else:
                matched_term = next(
                    (t for t in online_terms if printer_name in (t.get("printers") or [])),
                    None
                ) or next(
                    (t for t in terminals.values() if printer_name in (t.get("printers") or [])),
                    default_term
                )

        if not matched_term:
            matched_term = default_term

        if not matched_term:
            continue

        tid = matched_term["id"]
        if tid not in jobs_by_terminal:
            jobs_by_terminal[tid] = {
                "terminal": matched_term,
                "printers": []
            }
        if printer_name not in jobs_by_terminal[tid]["printers"]:
            jobs_by_terminal[tid]["printers"].append(printer_name)

    if not jobs_by_terminal:
        return {
            "success": False,
            "error": "Yazıcıların bağlı olduğu aktif bir kasa bilgisayarı bulunamadı."
        }

    dispatched_reqs: List[Dict[str, Any]] = []
    offline_errors: List[str] = []

    for tid, job in jobs_by_terminal.items():
        term = job["terminal"]
        printers_for_term = job["printers"]
        if (now - term.get("last_seen", 0)) >= 15.0:
            offline_errors.append(f"{term.get('name')} ({term.get('local_ip')}) çevrimdışı")
            continue

        req_id = str(uuid.uuid4())
        pending_commands[req_id] = {
            "terminal_id": tid,
            "target_ip": term.get("local_ip"),
            "action": "print_receipt",
            "printers": printers_for_term,
            "raw_text": raw_text,
            "created_at": time.time()
        }
        dispatched_reqs.append({
            "req_id": req_id,
            "terminal": term,
            "printers": printers_for_term
        })

    if not dispatched_reqs:
        return {
            "success": False,
            "error": f"Seçili yazıcıların bağlı olduğu kasa çevrimdışı: {', '.join(offline_errors)}"
        }

    all_results = []
    completed_reqs = set()
    for _ in range(45):
        await asyncio.sleep(0.1)
        for d in dispatched_reqs:
            rid = d["req_id"]
            if rid not in completed_reqs and rid in completed_results:
                res = completed_results.pop(rid)
                completed_reqs.add(rid)
                term = d["terminal"]
                for r in (res.get("results") or []):
                    r["terminal_id"] = term["id"]
                    r["terminal_name"] = term["name"]
                    r["local_ip"] = term.get("local_ip")
                    all_results.append(r)
        if len(completed_reqs) == len(dispatched_reqs):
            break

    if all_results:
        any_ok = any(r.get("success") for r in all_results)
        summary_parts = [
            f"{r.get('printer')} ({r.get('local_ip', '-')})"
            for r in all_results if r.get("success")
        ]
        return {
            "success": any_ok,
            "results": all_results,
            "message": f"Fiş yazdırıldı: {', '.join(summary_parts)}" if any_ok else "Yazdırma başarısız oldu."
        }

    return {
        "success": False,
        "error": "Yazdırma zaman aşımına uğradı. Kasa bilgisayarında BonCore Ajanı'nın açık olduğunu kontrol edin."
    }

@router.get("/weight")
async def get_current_weight(
    request: Request,
    ip: Optional[str] = None,
    port: Optional[int] = None,
    terminal_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """
    Reads live weight from CAS CL-3000 scale.
    Routes to specified terminal_id or active default Kasa.
    """
    tenant_code = resolve_tenant_code_from_request(request)
    cfg = await scale_service.get_scale_config(db)
    terminals = load_terminals(tenant_code)
    pending_commands = get_tenant_pending_commands(tenant_code)
    completed_results = get_tenant_completed_results(tenant_code)
    now = time.time()

    target_term = None
    if terminal_id and terminal_id in terminals:
        target_term = terminals[terminal_id]
    elif terminal_id:
        target_term = next((t for t in terminals.values() if t.get("local_ip") == terminal_id or terminal_id in t.get("alias_ids", [])), None)
    else:
        online_terms = [t for t in terminals.values() if (now - t.get("last_seen", 0)) < 15.0]
        if online_terms:
            target_term = next((t for t in online_terms if t.get("is_default")), online_terms[0])

    if target_term and (now - target_term.get("last_seen", 0)) < 15.0:
        req_id = str(uuid.uuid4())
        target_ip = (ip or target_term.get("scale_ip") or cfg.get("ip_address") or "192.168.1.150").strip()
        target_port = int(port or target_term.get("scale_port") or cfg.get("port") or 2004)
        timeout = float(cfg.get("timeout") or 2.5)

        pending_commands[req_id] = {
            "terminal_id": target_term["id"],
            "target_ip": target_term.get("local_ip"),
            "action": "read_weight",
            "ip": target_ip,
            "port": target_port,
            "timeout": timeout,
            "created_at": time.time()
        }
        for _ in range(45):
            await asyncio.sleep(0.1)
            if req_id in completed_results:
                res = completed_results.pop(req_id)
                res["terminal_id"] = target_term["id"]
                res["terminal_name"] = target_term["name"]
                res["bridge"] = f"{target_term['name']} (IP: {target_term.get('local_ip', '-')})"
                if res.get("success") and res.get("weight") is not None:
                    target_term["last_weight"] = res["weight"]
                    terminals[target_term["id"]] = target_term
                    save_terminals(terminals, tenant_code)
                return res

        last_w = target_term.get("last_weight", 0.0)
        return {
            "success": True,
            "weight": last_w,
            "unit": "kg",
            "is_stable": True,
            "bridge": f"{target_term['name']} (Önbellek: {last_w:.3f} Kg)",
            "message": "Ajanın son okuduğu ağırlık alındı."
        }

    target_ip = (ip or cfg.get("ip_address") or "192.168.1.150").strip()
    target_port = int(port or cfg.get("port") or 2004)
    timeout = float(cfg.get("timeout") or 2.5)

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
