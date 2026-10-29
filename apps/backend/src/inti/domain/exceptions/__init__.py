class IntiError(Exception):
    """Safe public message; never wrap upstream bodies or credentials."""

    status_code = 400


class NotFoundError(IntiError):
    status_code = 404


class ConfigurationError(IntiError):
    status_code = 503


class DependencyError(IntiError):
    status_code = 502


class NavigationError(IntiError):
    status_code = 422
