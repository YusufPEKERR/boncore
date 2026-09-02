import os
from pydantic import BaseModel

class Settings(BaseModel):
    APP_NAME: str = "BonCore Adisyo & Simpra POS Engine"
    API_V1_STR: str = "/api"
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./boncore.db")
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    CORS_ORIGINS: list[str] = ["*"]
    DEFAULT_KUVER_PRICE: float = 35.0
    MANAGER_OVERRIDE_PIN: str = "9999"

settings = Settings()
