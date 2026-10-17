from pathlib import Path
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    database_url: str | None = None
    auth_secret: str = ""
    session_hours: int = 12
    cookie_secure: bool = False
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"

    whatsapp_number: str = ""

    admin_email: str = "admin@urban.com"
    admin_password: str = ""
    admin_name: str = "Urban Admin"

    cors_origins: str = "http://localhost:3000,http://localhost:3001"
    timezone: str = "Asia/Kolkata"

    upload_dir: Path = BACKEND_DIR / "uploads"
    max_upload_mb: int = 5

    seed_sample_data: bool = True

    @field_validator("database_url", mode="before")
    @classmethod
    def empty_database_url_is_none(cls, value: str | None) -> str | None:
        return value or None

    @field_validator("whatsapp_number", mode="before")
    @classmethod
    def digits_only(cls, value: str | None) -> str:
        return "".join(ch for ch in (value or "") if ch.isdigit())

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def uses_database(self) -> bool:
        return self.database_url is not None


settings = Settings()
