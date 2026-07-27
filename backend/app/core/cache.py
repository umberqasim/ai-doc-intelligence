import json
import redis
from app.core.config import settings

redis_client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)

def get_cache(key: str):
    try:
        data = redis_client.get(key)
        return json.loads(data) if data else None
    except Exception:
        return None

def set_cache(key: str, value: dict, ttl_seconds: int = 60):
    try:
        redis_client.setex(key, ttl_seconds, json.dumps(value, default=str))
    except Exception:
        pass

def delete_cache(key: str):
    try:
        redis_client.delete(key)
    except Exception:
        pass
