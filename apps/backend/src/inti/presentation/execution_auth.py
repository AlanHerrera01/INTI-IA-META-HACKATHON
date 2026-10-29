import secrets

from inti.domain.exceptions import ConfigurationError
from inti.domain.execution import OperatorRequired
from inti.infrastructure.config import ConfigurationProvider


def require_operator(
    settings: ConfigurationProvider, authorization: str | None, feature_enabled: bool | None = None
) -> str:
    expected = settings.execution_operator_token.get_secret_value()
    enabled = settings.execution_enabled if feature_enabled is None else feature_enabled
    if not enabled or not expected:
        raise ConfigurationError("Requested operator service is disabled or not configured")
    if not secrets.compare_digest((authorization or "").encode(), f"Bearer {expected}".encode()):
        raise OperatorRequired("A valid local operator capability is required")
    return settings.execution_operator_name
