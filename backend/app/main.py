import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import engine, Base, AsyncSessionLocal
from app.cache import cache_manager
from app.seed_data import seed_initial_data

# Import routers
from app.routers import auth, tables, products, orders, kds, cashier, inventory, delivery, qr, fiscal, audit, ws, settings as app_settings

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

    # Seed initial data
    async with AsyncSessionLocal() as session:
        await seed_initial_data(session)

    logger.info("BonCore backend ready and listening for POS/KDS connections!")
    yield
    # Shutdown
    logger.info("Shutting down BonCore engine...")

app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description="Simpra / Adisyo Level Full-Stack Web POS, KDS & Restaurant Management System",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(auth.router, prefix=settings.API_V1_STR)
app.include_router(tables.router, prefix=settings.API_V1_STR)
app.include_router(products.router, prefix=settings.API_V1_STR)
app.include_router(orders.router, prefix=settings.API_V1_STR)
app.include_router(kds.router, prefix=settings.API_V1_STR)
app.include_router(cashier.router, prefix=settings.API_V1_STR)
app.include_router(inventory.router, prefix=settings.API_V1_STR)
app.include_router(delivery.router, prefix=settings.API_V1_STR)
app.include_router(qr.router, prefix=settings.API_V1_STR)
app.include_router(fiscal.router, prefix=settings.API_V1_STR)
app.include_router(audit.router, prefix=settings.API_V1_STR)
app.include_router(app_settings.router, prefix=settings.API_V1_STR)
app.include_router(ws.router)

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "is_redis": cache_manager.is_redis,
        "mode": "production_ready"
    }
