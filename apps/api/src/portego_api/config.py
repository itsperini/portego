from functools import lru_cache
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="PORTEGO_", extra="ignore")

    environment: str = "development"
    database_url: str = "sqlite+aiosqlite:///./portego.db"
    web_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:3100"]
    )
    web_url: str = "http://localhost:3100"
    session_cookie: str = "portego_session"
    session_days: int = 7
    cookie_secure: bool = False
    gateway_jwt_secret: str = "development-only-change-me"  # noqa: S105
    cloudflare_relay_url: str | None = None
    cloudflare_relay_secret: str | None = None
    auto_create_tables: bool = True

    @field_validator("web_origins", mode="before")
    @classmethod
    def split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("database_url", mode="before")
    @classmethod
    def select_async_postgres_driver(cls, value: object) -> object:
        if isinstance(value, str) and value.startswith("postgres://"):
            return value.replace("postgres://", "postgresql+asyncpg://", 1)
        if isinstance(value, str) and value.startswith("postgresql://"):
            return value.replace("postgresql://", "postgresql+asyncpg://", 1)
        return value

    @field_validator("gateway_jwt_secret")
    @classmethod
    def validate_gateway_secret(cls, value: str) -> str:
        if len(value) < 24:
            raise ValueError("PORTEGO_GATEWAY_JWT_SECRET must contain at least 24 characters")
        return value

    @field_validator("cloudflare_relay_url", "cloudflare_relay_secret", mode="before")
    @classmethod
    def normalize_relay_settings(cls, value: object) -> object:
        if value == "":
            return None
        return value

    @field_validator("cloudflare_relay_secret")
    @classmethod
    def validate_relay_secret(cls, value: str | None) -> str | None:
        if value is not None and len(value) < 24:
            raise ValueError("PORTEGO_CLOUDFLARE_RELAY_SECRET must contain at least 24 characters")
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
