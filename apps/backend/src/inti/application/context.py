from contextvars import ContextVar
from uuid import UUID

correlation_id: ContextVar[UUID | None] = ContextVar("inti_correlation_id", default=None)
