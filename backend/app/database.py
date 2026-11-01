import os
import re
import logging
from typing import AsyncGenerator, Optional, Dict
from fastapi import Request
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker, AsyncEngine
from sqlalchemy.orm import declarative_base

logger = logging.getLogger("boncore.database")

Base = declarative_base()

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_DATA_DIR = os.path.join(_BACKEND_DIR, "data")
_TENANTS_DIR = os.path.join(_DATA_DIR, "tenants")
os.makedirs(_TENANTS_DIR, exist_ok=True)

_MASTER_DB_PATH = os.path.join(_DATA_DIR, "master.db").replace("\\", "/")

# 1. MASTER DATABASE ENGINE & SESSIONMAKER
master_engine: AsyncEngine = create_async_engine(
    f"sqlite+aiosqlite:///{_MASTER_DB_PATH}",
    echo=False,
    future=True,
    connect_args={"check_same_thread": False}
)

MasterSessionLocal = async_sessionmaker(
    bind=master_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False
)

async def get_master_db() -> AsyncGenerator[AsyncSession, None]:
    """
    SaaS Platform Master veritabanı oturumu.
    RestaurantTenant, TenantLead, TenantInvoice tabloları buradadır.
    """
    async with MasterSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


# 2. MULTI-TENANT DYNAMIC ENGINES & SESSIONMAKERS
_tenant_engines: Dict[str, AsyncEngine] = {}
_tenant_sessionmakers: Dict[str, async_sessionmaker] = {}

DEFAULT_TENANT_CODE = "boncore-kadikoy"

def get_primary_tenant_code() -> str:
    try:
        import sqlite3
        if os.path.exists(_MASTER_DB_PATH):
            conn = sqlite3.connect(_MASTER_DB_PATH)
            row = conn.execute("SELECT code FROM restaurant_tenants ORDER BY id ASC LIMIT 1").fetchone()
            conn.close()
            if row and row[0]:
                return row[0]
    except Exception:
        pass
    return DEFAULT_TENANT_CODE

def clean_tenant_code(code: Optional[str]) -> str:
    if not code:
        return get_primary_tenant_code()
    tr_map = str.maketrans("çğıöşüÇĞİÖŞÜ", "cgiosuCGIOSU")
    cleaned = code.strip().translate(tr_map).lower()
    cleaned = cleaned.replace(" ", "-")
    cleaned = re.sub(r"[^a-z0-9\-_]", "", cleaned)
    return cleaned or get_primary_tenant_code()

def get_tenant_db_path(tenant_code: str) -> str:
    clean_code = clean_tenant_code(tenant_code)
    return os.path.join(_TENANTS_DIR, f"{clean_code}.db").replace("\\", "/")

async def rename_tenant_db(old_code: str, new_code: str):
    """
    Restoran kullanıcı adı / kodunu değiştirirken eski SQLite veritabanını
    yeni dosya adına taşır ve SQLAlchemy bağlantı havuzunu güvenle sıfırlar.
    """
    old_clean = clean_tenant_code(old_code)
    new_clean = clean_tenant_code(new_code)
    if old_clean == new_clean:
        return

    # 1. Eski motordaki havuzu dispose et
    if old_clean in _tenant_engines:
        try:
            await _tenant_engines[old_clean].dispose()
        except Exception:
            pass
        _tenant_engines.pop(old_clean, None)
    _tenant_sessionmakers.pop(old_clean, None)

    # 2. Disk üzerindeki veritabanı dosyasını taşı / kopyala
    old_path = get_tenant_db_path(old_clean)
    new_path = get_tenant_db_path(new_clean)

    if os.path.exists(old_path) and not os.path.exists(new_path):
        import shutil
        try:
            os.rename(old_path, new_path)
        except Exception:
            try:
                shutil.copy2(old_path, new_path)
                try:
                    os.remove(old_path)
                except Exception:
                    pass
            except Exception:
                pass

def get_tenant_sessionmaker(tenant_code: Optional[str]) -> async_sessionmaker:
    clean_code = clean_tenant_code(tenant_code)
    if clean_code not in _tenant_sessionmakers:
        db_path = get_tenant_db_path(clean_code)
        engine = create_async_engine(
            f"sqlite+aiosqlite:///{db_path}",
            echo=False,
            future=True,
            connect_args={"check_same_thread": False}
        )
        _tenant_engines[clean_code] = engine
        _tenant_sessionmakers[clean_code] = async_sessionmaker(
            bind=engine,
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False
        )
    return _tenant_sessionmakers[clean_code]


def resolve_tenant_code_from_request(request: Optional[Request]) -> str:
    """
    Gelen HTTP isteğinden hangi restorana ait olduğunu tespit eder:
    1. Header: X-Restaurant-Code veya X-Tenant-Code
    2. Authorization: Bearer token içindeki 'rc' (restaurant code)
    3. Query parameter: ?restaurant=... veya ?restaurant_code=...
    4. Fallback: 'boncore-kadikoy'
    """
    if not request:
        return DEFAULT_TENANT_CODE

    # 1. Custom Header
    h_code = request.headers.get("X-Restaurant-Code") or request.headers.get("X-Tenant-Code")
    if h_code:
        return clean_tenant_code(h_code)

    # 2. JWT Bearer Token Payload (Hızlı çözümleme, veritabanına sorgu atmaz)
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1].strip()
        try:
            from app.security import decode_access_token_fast
            token_data = decode_access_token_fast(token)
            if token_data and token_data.get("rc"):
                return clean_tenant_code(token_data.get("rc"))
        except Exception:
            pass

    # 3. Cookie (Tarayıcı tarafından her isteğe otomatik eklenir)
    cookie_code = request.cookies.get("boncore_restaurant_code") or request.cookies.get("restaurant_code")
    if cookie_code:
        return clean_tenant_code(cookie_code)

    # 4. Query Parameter
    q_code = (
        request.query_params.get("restaurant") or 
        request.query_params.get("restaurant_code") or 
        request.query_params.get("tenant") or
        request.query_params.get("tenant_code")
    )
    if q_code:
        return clean_tenant_code(q_code)

    return DEFAULT_TENANT_CODE


async def get_db(request: Request = None) -> AsyncGenerator[AsyncSession, None]:
    """
    Tüm POS / Restoran router'ları için tenant-izole veritabanı oturumu.
    İsteğin restoran koduna göre (Örn: 'moda-meyhane.db') ilgili veritabanına bağlanır.
    """
    tenant_code = resolve_tenant_code_from_request(request)
    session_factory = get_tenant_sessionmaker(tenant_code)
    async with session_factory() as session:
        try:
            yield session
        finally:
            await session.close()


# Geriye dönük uyumluluk exports
engine = master_engine

class _DynamicTenantSessionLocal:
    def __call__(self):
        return get_tenant_sessionmaker(None)()

AsyncSessionLocal = _DynamicTenantSessionLocal()
