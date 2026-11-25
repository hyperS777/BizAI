"""
BizAI Configuration
Loads settings from environment variables using pydantic-settings.
"""

import os
from pathlib import Path
from pydantic import field_validator
from pydantic_settings import BaseSettings
from typing import List

_backend_dir = Path(__file__).resolve().parent
_default_sqlite = f"sqlite:///{(_backend_dir / 'bizai.db').as_posix()}"


class Settings(BaseSettings):
    # App
    APP_NAME: str = "BizAI"
    DEBUG: bool = True

    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", _default_sqlite)

    # JWT
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days for stable prototype sessions
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # CORS
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    # AI
    AI_PROVIDER: str = "groq"
    GROQ_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    AZURE_OPENAI_API_KEY: str = ""
    AZURE_OPENAI_ENDPOINT: str = ""
    AZURE_OPENAI_DEPLOYMENT: str = "gpt-4o"
    AZURE_OPENAI_API_VERSION: str = "2024-08-01-preview"

    # Real Payment Gateway (Razorpay)
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""

    # Real Courier / Logistics (Delhivery)
    DELHIVERY_API_KEY: str = ""
    DELHIVERY_CLIENT_ID: str = "REIHH_STUDIO_DELHI"
    DELHIVERY_WEBHOOK_SECRET: str = ""

    # Shopify Admin API and webhook signing
    SHOPIFY_STORE_DOMAIN: str = ""
    SHOPIFY_ADMIN_ACCESS_TOKEN: str = ""
    SHOPIFY_API_VERSION: str = "2026-07"
    SHOPIFY_WEBHOOK_SECRET: str = ""
    DELIVERY_WEBHOOK_SECRET: str = ""
    PUBLIC_API_BASE_URL: str = ""
    STOREFRONT_SIMULATION_ENABLED: bool = True

    @field_validator("DEBUG", mode="before")
    @classmethod
    def normalize_debug_value(cls, value):
        """Accept common cloud-host values such as 'release' and 'production'."""
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"release", "production", "prod", "off", "no"}:
                return False
            if normalized in {"development", "dev", "debug", "on", "yes"}:
                return True
        return value

    @property
    def cors_origins_list(self) -> List[str]:
        raw = self.CORS_ORIGINS
        if raw.startswith("CORS_ORIGINS="):
            raw = raw[len("CORS_ORIGINS="):]
        raw = raw.strip("\"' ")
        return [origin.strip() for origin in raw.split(",") if origin.strip()]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
