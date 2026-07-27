from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    # App
    APP_NAME: str = "AI Document Intelligence"
    DEBUG: bool = True
    VERSION: str = "1.0.0"

    # Database
    MONGODB_URL: str
    REDIS_URL: str = "redis://localhost:6379/0"
    DATABASE_NAME: str = "ai_doc_intelligence"

    # JWT
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Groq AI
    GROQ_API_KEY: str

    class Config:
        env_file = ".env"

@lru_cache()
def get_settings():
    return Settings()

settings = get_settings()
