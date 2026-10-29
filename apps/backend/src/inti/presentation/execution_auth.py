import secrets

from inti.domain.exceptions import ConfigurationError
from inti.domain.execution import OperatorRequired
from inti.infrastructure.config import ConfigurationProvider


def require_operator(settings: ConfigurationProvider, authorization: str | None) -> str:
    expected = settings.execution_operator_token.get_secret_value()
    if not settings.execution_enabled or not expected:
        raise ConfigurationError("Execution is disabled or EXECUTION_OPERATOR_TOKEN is missing")
    if not secrets.compare_digest((authorization or "").encode(), f"Bearer {expected}".encode()):
        raise OperatorRequired("A valid local operator capability is required")
    return settings.execution_operator_name
