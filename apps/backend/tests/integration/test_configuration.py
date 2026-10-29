import pytest
from pydantic import ValidationError

from inti.infrastructure.config import ConfigurationProvider


@pytest.mark.parametrize(
    "url",
    [
        "http://example.com/",
        "file:///secret",
        "http://user:pass@localhost:8001/",
        "http://127.0.0.1.evil.example/",
        "https://localhost:8001/",
    ],
)
def test_external_browser_configuration_rejected(url) -> None:
    with pytest.raises(ValidationError):
        ConfigurationProvider(_env_file=None, browser_allowed_urls=[url])


def test_meta_secrets_redacted() -> None:
    settings = ConfigurationProvider(_env_file=None, meta_api_key="private-test-key")
    assert "private-test-key" not in repr(settings)
    with pytest.raises(ValidationError):
        ConfigurationProvider(_env_file=None, meta_api_base_url="http://example.com/v1")
