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
    planning_max_steps: int = Field(default=20, ge=1, le=50)
    planning_max_retries: int = Field(default=2, ge=0, le=3)
    planning_max_tokens: int = Field(default=4096, ge=512, le=16384)
    planning_timeout_seconds: float = Field(default=120, ge=1, le=240)
    planning_ttl_seconds: int = Field(default=900, ge=60, le=86400)
    planning_min_confidence: float = Field(default=0.6, ge=0, le=1)
    meta_max_response_bytes: int = Field(default=262144, ge=1024, le=1_000_000)
    execution_enabled: bool = False
    execution_operator_token: SecretStr = SecretStr("")
    execution_operator_name: str = "local-operator"
    browser_worker_url: str = "http://127.0.0.1:8010"
    browser_worker_token: SecretStr = SecretStr("")
    execution_max_actions: int = Field(default=30, ge=1, le=50)
    execution_max_duration_seconds: float = Field(default=180, ge=1, le=600)
    execution_action_timeout_seconds: float = Field(default=10, ge=0.1, le=60)
    execution_max_concurrent_sessions: int = Field(default=2, ge=1, le=4)
    execution_max_navigation_count: int = Field(default=3, ge=1, le=10)
    execution_observation_max_age_seconds: float = Field(default=5, ge=1, le=30)
    browser_session_ttl_seconds: float = Field(default=180, ge=2, le=600)
    verification_enabled: bool = False
    verification_auto_trigger: bool = True
    verification_readonly_url: str = "http://127.0.0.1:8003/"
    verification_read_token: SecretStr = SecretStr("")
    verification_timeout_seconds: float = Field(default=30, ge=2, le=120)
    verification_source_timeout_seconds: float = Field(default=3, ge=0.1, le=15)
    verification_source_retries: int = Field(default=1, ge=0, le=3)
    verification_evidence_max_age_seconds: float = Field(default=30, ge=2, le=120)
    verification_max_response_bytes: int = Field(default=500000, ge=1024, le=1000000)
    recovery_enabled: bool = False
    recovery_max_attempts: int = Field(default=3, ge=1, le=10)
    recovery_max_duration_seconds: float = Field(default=120, ge=1, le=600)
    recovery_max_model_calls: int = Field(default=5, ge=1, le=20)
    recovery_max_actions: int = Field(default=10, ge=1, le=30)
    recovery_max_tokens: int | None = Field(default=None, ge=256, le=100000)
    recovery_max_identical_failures: int = Field(default=2, ge=1, le=5)

    @field_validator("recovery_max_tokens", mode="before")
    @classmethod
    def optional_token_budget(cls, value: object) -> object:
        return None if value == "" else value

    @field_validator("verification_readonly_url")
    @classmethod
    def readonly_target(cls, value: str) -> str:
        url = urlsplit(value)
        if (
            url.scheme != "http"
            or url.hostname not in {"localhost", "127.0.0.1", "inventory-state"}
            or url.username
            or url.password
            or url.path not in {"", "/"}
            or url.query
            or url.fragment
        ):
            raise ValueError("Verification needs an explicit local read-only root URL")
        return value.rstrip("/") + "/"

    @field_validator("execution_operator_token", "browser_worker_token", "verification_read_token")
    @classmethod
    def execution_secret_length(cls, value: SecretStr) -> SecretStr:
        if value.get_secret_value() and len(value.get_secret_value()) < 24:
            raise ValueError("Execution capability tokens need at least 24 characters")
        return value

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
