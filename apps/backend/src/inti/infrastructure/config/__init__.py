from pathlib import Path
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class ConfigurationProvider(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: SecretStr = SecretStr(
        "postgresql+psycopg://inti:inti@127.0.0.1:5432/inti?connect_timeout=5"
    )
    artifact_dir: Path = Path("artifacts")
    demo_url: str = "http://127.0.0.1:8001/"
    browser_allowed_urls: list[str] = ["http://127.0.0.1:8001/"]
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    meta_api_key: SecretStr = SecretStr("")
    meta_model_id: str = "muse-spark-1.3"
    meta_api_base_url: str = "https://api.meta.ai/v1"
    meta_request_timeout_seconds: float = Field(default=60, ge=1, le=120)
    browser_timeout_ms: int = Field(default=15000, ge=1000, le=60000)
    max_artifact_bytes: int = Field(default=5_000_000, ge=1000, le=10_000_000)

    @field_validator("browser_allowed_urls")
    @classmethod
    def local_targets(cls, values: list[str]) -> list[str]:
        if not values:
            raise ValueError("At least one authorized URL is required")
        for value in values:
            url = urlsplit(value)
            if (
                url.scheme != "http"
                or url.hostname not in {"localhost", "127.0.0.1", "demo"}
                or url.username
                or url.password
                or url.fragment
                or url.query
            ):
                raise ValueError("Only explicit local demo HTTP URLs are allowed")
        return values

    @field_validator("meta_api_base_url")
    @classmethod
    def secure_meta_url(cls, value: str) -> str:
        url = urlsplit(value)
        if (
            url.scheme != "https"
            or not url.hostname
            or url.username
            or url.password
            or url.query
            or url.fragment
        ):
            raise ValueError("Meta base URL must be HTTPS without credentials or query")
        return value.rstrip("/")
