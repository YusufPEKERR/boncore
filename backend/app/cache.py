import json
import logging
from typing import Any, Optional

logger = logging.getLogger("boncore.cache")

class MemoryCache:
    def __init__(self):
        self._data: dict[str, Any] = {}

    async def get(self, key: str) -> Optional[str]:
        return self._data.get(key)

    async def set(self, key: str, value: str, expire: int = 3600) -> bool:
        self._data[key] = value
        return True

    async def delete(self, key: str) -> bool:
        if key in self._data:
            del self._data[key]
            return True
        return False

    async def keys(self, pattern: str = "*") -> list[str]:
        import fnmatch
        return [k for k in self._data.keys() if fnmatch.fnmatch(k, pattern)]

class CacheManager:
    def __init__(self):
        self.client = None
        self.is_redis = False
        self.memory = MemoryCache()

    async def init(self, redis_url: str):
        try:
            import redis.asyncio as aioredis
            self.client = aioredis.from_url(redis_url, encoding="utf-8", decode_responses=True)
            await self.client.ping()
            self.is_redis = True
            logger.info("Connected to Redis cache server successfully.")
        except Exception:
            logger.info("Dahili yüksek performanslı In-Memory önbellek motoru devrede.")
            self.client = self.memory
            self.is_redis = False

    async def get_json(self, key: str) -> Optional[Any]:
        raw = await self.client.get(key)
        if raw:
            try:
                return json.loads(raw)
            except Exception:
                return raw
        return None

    async def set_json(self, key: str, value: Any, expire: int = 3600):
        raw = json.dumps(value, ensure_ascii=False)
        await self.client.set(key, raw)

    async def delete(self, key: str):
        await self.client.delete(key)

cache_manager = CacheManager()
