import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import engine, Base, AsyncSessionLocal
from app.cache import cache_manager
from app.seed_data import seed_initial_data, bootstrap_staff_credentials
from app.security import get_optional_user

# Import routers
from app.routers import auth, tables, products, orders, kds, cashier, inventory, delivery, qr, fiscal, audit, ws, settings as app_settings, scale

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("boncore.main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting BonCore POS & Management Engine...")
    
    # Init Cache
    await cache_manager.init(settings.REDIS_URL)

    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        def migrate_schema(sync_conn):
            from sqlalchemy import inspect, text
            inspector = inspect(sync_conn)
            cols = [c["name"] for c in inspector.get_columns("orders")]
            if "service_charge" not in cols:
                sync_conn.execute(text("ALTER TABLE orders ADD COLUMN service_charge FLOAT DEFAULT 0.0"))
            user_cols = [c["name"] for c in inspector.get_columns("staff_users")]
            if "username" not in user_cols:
                sync_conn.execute(text("ALTER TABLE staff_users ADD COLUMN username VARCHAR(50)"))
                sync_conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_staff_users_username ON staff_users (username)"))
            if "password_hash" not in user_cols:
                sync_conn.execute(text("ALTER TABLE staff_users ADD COLUMN password_hash VARCHAR(255)"))
            if "last_login_at" not in user_cols:
                sync_conn.execute(text("ALTER TABLE staff_users ADD COLUMN last_login_at DATETIME"))
        await conn.run_sync(migrate_schema)

    # Seed initial data
    async with AsyncSessionLocal() as session:
        await seed_initial_data(session)

    # Stok durum raporu Excel verilerini kontrol et ve yükle
    try:
        from app.seed_stock_report import migrate_and_seed_stock
        migrate_and_seed_stock()
    except Exception as e:
        logger.warning(f"Stock seed check warning: {e}")

    # Kullanıcı adı / parolası olmayan personele ilk giriş bilgilerini ata
    async with AsyncSessionLocal() as session:
        await bootstrap_staff_credentials(session)

    logger.info("BonCore backend ready and listening for POS/KDS connections!")
    yield
    # Shutdown
    logger.info("Shutting down BonCore engine...")

app = FastAPI(
    title=settings.APP_NAME,
    version="2.0.0",
    description="BonCore POS - Web POS, KDS & Restaurant Management System",
    lifespan=lifespan
)

# CORS (Bearer token kullanıldığı için çerez kimlik bilgisi gerekmez)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Token doğrulama bağımlılığı
protected = [Depends(get_optional_user)]

# Include API Routers
app.include_router(auth.router, prefix=settings.API_V1_STR)  # kendi içinde korumalı uçlar var
app.include_router(qr.router, prefix=settings.API_V1_STR)    # müşteri QR menüsü herkese açık
app.include_router(tables.router, prefix=settings.API_V1_STR, dependencies=protected)
app.include_router(products.router, prefix=settings.API_V1_STR, dependencies=protected)
app.include_router(orders.router, prefix=settings.API_V1_STR, dependencies=protected)
app.include_router(kds.router, prefix=settings.API_V1_STR, dependencies=protected)
app.include_router(cashier.router, prefix=settings.API_V1_STR, dependencies=protected)
app.include_router(inventory.router, prefix=settings.API_V1_STR, dependencies=protected)
app.include_router(delivery.router, prefix=settings.API_V1_STR, dependencies=protected)
app.include_router(fiscal.router, prefix=settings.API_V1_STR, dependencies=protected)
app.include_router(audit.router, prefix=settings.API_V1_STR, dependencies=protected)
app.include_router(app_settings.router, prefix=settings.API_V1_STR, dependencies=protected)
app.include_router(scale.router, prefix=settings.API_V1_STR, dependencies=protected)
app.include_router(ws.router)

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "is_redis": cache_manager.is_redis,
        "mode": "production_ready"
    }

