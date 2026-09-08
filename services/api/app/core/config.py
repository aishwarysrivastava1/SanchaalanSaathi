"""Application settings, read from the environment."""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_SECRET = "synapse-dev-secret-change-in-prod-32chars!"

# SERVICES picks which of these this process serves. "all" mounts every one.
ALL_MODULES = ("identity", "coordination", "field", "intelligence", "realtime")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore", case_sensitive=False
    )

    deployment_env: Literal["development", "staging", "production"] = "development"
    services: str = "all"
    log_level: str = "INFO"
    service_name: str = "sanchaalan-saathi-api"
    version: str = "3.0.0"

    jwt_secret_key: str = DEV_SECRET
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 60
    refresh_token_ttl_days: int = 30
    frontend_url: str = ""
    allowed_origins: str = ""

    database_url: str = ""
    db_name: str = "postgres"
    db_user: str = "postgres"
    db_password: str = ""
    db_host: str = "localhost"
    db_port: int = 5432
    db_pool_size: int = 5
    db_max_overflow: int = 5
    db_pool_recycle_seconds: int = 300
    # Supabase's transaction pooler cannot hold server-side prepared statements,
    # which asyncpg creates by default. Disabling the cache avoids
    # InvalidSQLStatementNameError under load.
    db_statement_cache_size: int = 0

    redis_url: str = ""

    gemini_api_key: str = ""
    gem_key: str = ""
    geoapify_api_key: str = ""
    neo4j_uri: str = ""
    neo4j_user: str = "neo4j"
    neo4j_password: str = ""
    firebase_service_account_json: str = ""

    metrics_token: str = ""

    enable_guest_mode: bool = True
    enable_dynamic_reassignment: bool = True
    location_cache_ttl_seconds: int = 120
    user_daily_token_limit: int = 20_000
    global_tpm_limit: int = 50_000
    guest_signups_per_hour_per_ip: int = 3
    auth_attempts_per_minute_per_ip: int = 10
    chatbot_requests_per_minute_per_user: int = 12

    @field_validator("log_level")
    @classmethod
    def _uppercase(cls, value: str) -> str:
        return value.upper()

    @property
    def is_production(self) -> bool:
        return self.deployment_env == "production"

    @property
    def enabled_modules(self) -> tuple[str, ...]:
        raw = (self.services or "all").strip().lower()
        if raw in ("all", "*", ""):
            return ALL_MODULES
        chosen = tuple(name.strip() for name in raw.split(",") if name.strip())
        unknown = [name for name in chosen if name not in ALL_MODULES]
        if unknown:
            raise ValueError(f"Unknown SERVICES entries: {unknown}. Valid: {list(ALL_MODULES)}")
        return chosen

    @property
    def sqlalchemy_url(self) -> str:
        if not self.database_url:
            return (
                f"postgresql+asyncpg://{self.db_user}:{self.db_password}"
                f"@{self.db_host}:{self.db_port}/{self.db_name}"
            )
        for prefix in ("postgresql+asyncpg://", "postgresql://", "postgres://"):
            if self.database_url.startswith(prefix):
                return "postgresql+asyncpg://" + self.database_url[len(prefix) :]
        return self.database_url

    @property
    def cors_origins(self) -> list[str]:
        origins = ["http://localhost:3000", "http://localhost:3001"]
        if self.frontend_url:
            origins.append(self.frontend_url)
        origins += self.allowed_origins.split(",")
        seen: set[str] = set()
        return [
            cleaned
            for origin in origins
            if (cleaned := origin.strip().rstrip("/")) and cleaned not in seen and not seen.add(cleaned)
        ]

    @property
    def gemini_key(self) -> str:
        return self.gem_key or self.gemini_api_key


    def validate_for_boot(self) -> None:
        """Refuse to start on a configuration that would fail silently later."""
        problems = []

        if not self.db_password and not self.database_url:
            problems.append("DB_PASSWORD (or DATABASE_URL) is required")

        try:
            _ = self.enabled_modules
        except ValueError as exc:
            problems.append(str(exc))

        if self.is_production:
            if self.jwt_secret_key == DEV_SECRET:
                problems.append("JWT_SECRET_KEY must not be the development default")
            if len(self.jwt_secret_key) < 32:
                problems.append("JWT_SECRET_KEY must be at least 32 characters")
            if not self.frontend_url and not self.allowed_origins:
                problems.append("FRONTEND_URL or ALLOWED_ORIGINS must be set, or CORS blocks the UI")
            if not self.redis_url:
                problems.append(
                    "REDIS_URL is required in production - without it realtime events, "
                    "rate limits and locations are per-process, so a second replica "
                    "silently breaks them"
                )

        if problems:
            raise RuntimeError("Invalid configuration:\n" + "\n".join(f"  - {p}" for p in problems))


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
