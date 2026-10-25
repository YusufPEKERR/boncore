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
TERMINALS_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "terminals.json")

def load_terminals() -> Dict[str, Any]:
    if os.path.exists(TERMINALS_FILE):
        try:
            with open(TERMINALS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def save_terminals(data: Dict[str, Any]):
    try:
        with open(TERMINALS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print("Error saving terminals:", e)

AGENT_STATE = {
    "last_seen": 0.0,
    "local_ip": "127.0.0.1",
    "version": "1.2.0",
    "agent_name": "Kasa 1"
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
    terminal_id: Optional[str] = "kasa-1"
    terminal_name: Optional[str] = "Kasa 1"
    local_ip: Optional[str] = "127.0.0.1"
    version: Optional[str] = "1.2.0"
    agent_name: Optional[str] = "BonCore Hardware Agent"
    scale_connected: Optional[bool] = False
    scale_ip: Optional[str] = "192.168.1.150"
    scale_port: Optional[int] = 2004
    last_weight: Optional[float] = 0.0
    printers: Optional[list] = []

class TerminalUpdateSchema(BaseModel):
    name: Optional[str] = None
    is_default: Optional[bool] = None

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
    terminal_id: Optional[str] = None

@router.get("/download-agent")
async def download_agent(
    request: Request,
    terminal_name: Optional[str] = Query(None),
    terminal_id: Optional[str] = Query(None),
    scale_ip: Optional[str] = Query(None),
    scale_port: Optional[int] = Query(None)
):
    """
    Downloads the BonCore Hardware Bridge Agent zip package with auto-configured server_url and Kasa name.
    """
    server_base = get_public_server_url(request)
    kasa_name = (terminal_name or "Kasa 1").strip()
    kasa_id = (terminal_id or f"kasa_{uuid.uuid4().hex[:6]}").strip()

    if not scale_ip or not scale_port:
        terminals = load_terminals()
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
async def get_terminals():
    """
    Returns list of all registered Kasalar (Terminals) with real-time status.
    """
    terminals = load_terminals()
    now = time.time()
    result = []

    for t_id, t in terminals.items():
        diff = now - t.get("last_seen", 0)
        is_online = diff < 15.0
        result.append({
            "id": t_id,
            "name": t.get("name", "Kasa"),
            "local_ip": t.get("local_ip", "-"),
            "version": t.get("version", "1.2.0"),
            "is_online": is_online,
            "last_seen_seconds_ago": round(diff, 1) if t.get("last_seen", 0) > 0 else 999,
            "scale_connected": t.get("scale_connected", False) if is_online else False,
            "scale_ip": t.get("scale_ip", "192.168.1.150"),
            "scale_port": t.get("scale_port", 2004),
            "last_weight": t.get("last_weight", 0.0),
            "printers": t.get("printers", []),
            "is_default": t.get("is_default", False)
        })

    # Varsayılan önce, sonra isme göre sırala
    result.sort(key=lambda x: (not x["is_default"], x["name"]))
    return {"terminals": result}

@router.put("/terminals/{terminal_id}")
async def update_terminal(terminal_id: str, payload: TerminalUpdateSchema):
    """
    Updates terminal name or default status from Admin panel.
    """
    terminals = load_terminals()
    if terminal_id not in terminals:
        terminals[terminal_id] = {
            "id": terminal_id,
            "name": payload.name or "Yeni Kasa",
            "last_seen": 0,
            "is_default": False
        }

    if payload.name:
        terminals[terminal_id]["name"] = payload.name.strip()

    if payload.is_default is not None:
        for tid in terminals:
            terminals[tid]["is_default"] = (tid == terminal_id and payload.is_default)

    save_terminals(terminals)
    return {"success": True, "terminal": terminals[terminal_id]}

@router.delete("/terminals/{terminal_id}")
async def delete_terminal(terminal_id: str):
    """
    Removes a terminal from the registry.
    """
    terminals = load_terminals()
    if terminal_id in terminals:
        del terminals[terminal_id]
        save_terminals(terminals)
        return {"success": True, "message": "Kasa silindi."}
    return {"success": False, "message": "Kasa bulunamadı."}

@router.post("/agent/heartbeat")
async def agent_heartbeat(payload: AgentHeartbeatSchema):
    """
    Agent calls this every 4 seconds to announce its presence.
    Updates or registers the specific Kasa / Terminal.
    """
    terminals = load_terminals()
    t_id = (payload.terminal_id or "kasa-1").strip()
    now = time.time()

    existing = terminals.get(t_id, {})
    current_name = existing.get("name") or payload.terminal_name or "Kasa 1"

    terminals[t_id] = {
        "id": t_id,
        "name": current_name,
        "local_ip": payload.local_ip or "127.0.0.1",
        "version": payload.version or "1.2.0",
        "scale_connected": bool(payload.scale_connected),
        "scale_ip": payload.scale_ip or "192.168.1.150",
        "scale_port": payload.scale_port or 2004,
        "last_weight": payload.last_weight or 0.0,
        "printers": payload.printers or [],
        "last_seen": now,
        "is_default": existing.get("is_default", len(terminals) == 0)
    }
    save_terminals(terminals)

    AGENT_STATE["last_seen"] = now
    AGENT_STATE["local_ip"] = payload.local_ip
    AGENT_STATE["version"] = payload.version
    AGENT_STATE["agent_name"] = current_name

    return {
        "status": "ok",
        "terminal_id": t_id,
        "terminal_name": current_name,
        "server_time": now
    }

@router.get("/agent/status")
async def get_agent_status(terminal_id: Optional[str] = Query(None)):
    """
    Frontend checks if any or a specific Kasa agent is actively running.
    """
    terminals = load_terminals()
    now = time.time()

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

    # Genel kontrol: Herhangi bir online kasa var mı?
    online_terms = [t for t in terminals.values() if (now - t.get("last_seen", 0)) < 15.0]
    is_online = len(online_terms) > 0
    active_t = next((t for t in online_terms if t.get("is_default")), online_terms[0]) if online_terms else None

    diff = now - AGENT_STATE["last_seen"]
    return {
        "isOnline": is_online or (diff < 15.0),
        "terminalId": active_t["id"] if active_t else None,
        "terminalName": active_t["name"] if active_t else AGENT_STATE.get("agent_name"),
        "localIp": active_t["local_ip"] if active_t else AGENT_STATE.get("local_ip"),
        "version": active_t["version"] if active_t else AGENT_STATE.get("version"),
        "activeTerminalsCount": len(online_terms),
        "last_seen_seconds_ago": round(diff, 1) if AGENT_STATE["last_seen"] > 0 else 999
    }

@router.get("/agent/poll")
async def agent_poll(terminal_id: Optional[str] = Query(None)):
    """
    Agent polls this endpoint every 1s to receive commands for its specific Kasa.
    """
    now = time.time()
    for req_id, cmd in list(PENDING_COMMANDS.items()):
        cmd_target = cmd.get("terminal_id")
        if cmd_target is None or cmd_target == terminal_id:
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
    Tests TCP connection directly or relays through a specific Kasa agent.
    """
    terminals = load_terminals()
    now = time.time()

    target_term = None
    if payload.terminal_id and payload.terminal_id in terminals:
        target_term = terminals[payload.terminal_id]
    else:
        online_terms = [t for t in terminals.values() if (now - t.get("last_seen", 0)) < 15.0]
        if online_terms:
            target_term = next((t for t in online_terms if t.get("is_default")), online_terms[0])

    if target_term and (now - target_term.get("last_seen", 0)) < 15.0:
        req_id = str(uuid.uuid4())
        PENDING_COMMANDS[req_id] = {
            "terminal_id": target_term["id"],
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
                res["bridge"] = f"{target_term['name']} (IP: {target_term.get('local_ip', '-')})"
                return res

    result = await asyncio.to_thread(
        scale_service.test_tcp_connectivity,
        payload.ip_address.strip(),
        int(payload.port),
        float(payload.timeout)
    )
class PrintRequestSchema(BaseModel):
    terminal_id: Optional[str] = None
    printers: Optional[list] = []
    raw_text: Optional[str] = None
    doc_type: Optional[str] = "adisyon"
    document: Optional[Dict[str, Any]] = None

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
async def print_receipt(payload: PrintRequestSchema):
    """
    Relays a receipt print job to one or multiple physical Windows thermal printers via the cashier PC agent.
    """
    terminals = load_terminals()
    now = time.time()

    # Hedef kasayı belirle
    target_term = None
    if payload.terminal_id and payload.terminal_id in terminals:
        target_term = terminals[payload.terminal_id]
    else:
        online_terms = [t for t in terminals.values() if (now - t.get("last_seen", 0)) < 15.0]
        if online_terms:
            target_term = next((t for t in online_terms if t.get("is_default")), online_terms[0])

    if not target_term or (now - target_term.get("last_seen", 0)) >= 15.0:
        return {
            "success": False,
            "error": "Yazıcıya ulaşılamadı. Kasa bilgisayarında BonCore Ajanı'nın açık olduğundan emin olun."
        }

    raw_text = payload.raw_text
    if not raw_text and payload.document:
        raw_text = build_receipt_text(payload.document)
    elif not raw_text:
        raw_text = "BONCORE TEST YAZDIRMA\n--------------------\nTarih: " + time.strftime("%d.%m.%Y %H:%M") + "\nYazici testi basarili!\n\n\n\n"

    target_printers = payload.printers
    if not target_printers:
        target_printers = target_term.get("printers", [])[:1]

    if not target_printers:
        return {
            "success": False,
            "error": "Seçili yazıcı bulunamadı veya kasa bilgisayarında tanımlı yazıcı yok."
        }

    req_id = str(uuid.uuid4())
    PENDING_COMMANDS[req_id] = {
        "terminal_id": target_term["id"],
        "action": "print_receipt",
        "printers": target_printers,
        "raw_text": raw_text,
        "created_at": time.time()
    }

    for _ in range(40):
        await asyncio.sleep(0.1)
        if req_id in COMPLETED_RESULTS:
            res = COMPLETED_RESULTS.pop(req_id)
            res["terminal_id"] = target_term["id"]
            res["terminal_name"] = target_term["name"]
            return res

    return {
        "success": False,
        "error": "Yazdırma zaman aşımına uğradı. Yazıcının açık ve kağıdı olduğunu kontrol edin."
    }

    return result

@router.get("/weight")
async def get_current_weight(
    ip: Optional[str] = None,
    port: Optional[int] = None,
    terminal_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """
    Reads live weight from CAS CL-3000 scale.
    Routes to specified terminal_id or active default Kasa.
    """
    cfg = await scale_service.get_scale_config(db)
    terminals = load_terminals()
    now = time.time()

    target_term = None
    if terminal_id and terminal_id in terminals:
        target_term = terminals[terminal_id]
    else:
        online_terms = [t for t in terminals.values() if (now - t.get("last_seen", 0)) < 15.0]
        if online_terms:
            target_term = next((t for t in online_terms if t.get("is_default")), online_terms[0])

    if target_term and (now - target_term.get("last_seen", 0)) < 15.0:
        req_id = str(uuid.uuid4())
        target_ip = (ip or target_term.get("scale_ip") or cfg.get("ip_address") or "192.168.1.150").strip()
        target_port = int(port or target_term.get("scale_port") or cfg.get("port") or 2004)
        timeout = float(cfg.get("timeout") or 2.5)

        PENDING_COMMANDS[req_id] = {
            "terminal_id": target_term["id"],
            "action": "read_weight",
            "ip": target_ip,
            "port": target_port,
            "timeout": timeout,
            "created_at": time.time()
        }
        for _ in range(45):
            await asyncio.sleep(0.1)
            if req_id in COMPLETED_RESULTS:
                res = COMPLETED_RESULTS.pop(req_id)
                res["terminal_id"] = target_term["id"]
                res["terminal_name"] = target_term["name"]
                res["bridge"] = f"{target_term['name']} (IP: {target_term.get('local_ip', '-')})"
                # Başarılı okumada kasanın son ağırlığını da güncelle
                if res.get("success") and res.get("weight") is not None:
                    target_term["last_weight"] = res["weight"]
                    terminals[target_term["id"]] = target_term
                    save_terminals(terminals)
                return res

        # Canlı komut zaman aşımına uğrarsa, ajanın son bildirdiği ağırlığı fallback olarak kullan
        last_w = target_term.get("last_weight", 0.0)
        return {
            "success": True,
            "weight": last_w,
            "unit": "kg",
            "is_stable": True,
            "bridge": f"{target_term['name']} (Önbellek: {last_w:.3f} Kg)",
            "message": "Ajanın son okuduğu ağırlık alındı."
        }

    # Ajan yoksa doğrudan sunucu üzerinden soket dene
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

class PrintRequestSchema(BaseModel):
    terminal_id: Optional[str] = None
    printers: Optional[list] = []
    raw_text: Optional[str] = None
    doc_type: Optional[str] = "adisyon"
    document: Optional[Dict[str, Any]] = None

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
async def print_receipt(payload: PrintRequestSchema):
    """
    Relays a receipt print job to one or multiple physical Windows thermal printers via the cashier PC agent.
    """
    terminals = load_terminals()
    now = time.time()

    # Hedef kasayı belirle
    target_term = None
    if payload.terminal_id and payload.terminal_id in terminals:
        target_term = terminals[payload.terminal_id]
    else:
        online_terms = [t for t in terminals.values() if (now - t.get("last_seen", 0)) < 15.0]
        if online_terms:
            target_term = next((t for t in online_terms if t.get("is_default")), online_terms[0])

    if not target_term or (now - target_term.get("last_seen", 0)) >= 15.0:
        return {
            "success": False,
            "error": "Yazıcıya ulaşılamadı. Kasa bilgisayarında BonCore Ajanı'nın açık olduğundan emin olun."
        }

    raw_text = payload.raw_text
    if not raw_text and payload.document:
        raw_text = build_receipt_text(payload.document)
    elif not raw_text:
        raw_text = "BONCORE TEST YAZDIRMA\n--------------------\nTarih: " + time.strftime("%d.%m.%Y %H:%M") + "\nYazici testi basarili!\n\n\n\n"

    target_printers = payload.printers
    if not target_printers:
        target_printers = target_term.get("printers", [])[:1]

    if not target_printers:
        return {
            "success": False,
            "error": "Seçili yazıcı bulunamadı veya kasa bilgisayarında tanımlı yazıcı yok."
        }

    req_id = str(uuid.uuid4())
    PENDING_COMMANDS[req_id] = {
        "terminal_id": target_term["id"],
        "action": "print_receipt",
        "printers": target_printers,
        "raw_text": raw_text,
        "created_at": time.time()
    }

    for _ in range(40):
        await asyncio.sleep(0.1)
        if req_id in COMPLETED_RESULTS:
            res = COMPLETED_RESULTS.pop(req_id)
            res["terminal_id"] = target_term["id"]
            res["terminal_name"] = target_term["name"]
            return res

    return {
        "success": False,
        "error": "Yazdırma zaman aşımına uğradı. Yazıcının açık ve kağıdı olduğunu kontrol edin."
    }

    return result
