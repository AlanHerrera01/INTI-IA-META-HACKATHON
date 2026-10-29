from inti.domain.execution import ActionExecutionResult, ExecutionBundle
from inti.domain.recovery import FailureContext, FailureType


class FailureDetectionService:
    """Structured signals classify failures; pixel changes alone never do."""

    CODES = {
        "TARGET_UNRESOLVED": FailureType.TARGET_NOT_FOUND,
        "TARGET_AMBIGUOUS": FailureType.TARGET_AMBIGUOUS,
        "ELEMENT_MOVED": FailureType.ELEMENT_MOVED,
        "TARGET_DISABLED": FailureType.ELEMENT_DISABLED,
        "MODAL_OBSTRUCTION": FailureType.MODAL_OBSTRUCTION,
        "URL_DENIED": FailureType.NAVIGATION_MISMATCH,
        "ACTION_TIMEOUT_OR_BROWSER_ERROR": FailureType.ACTION_TIMEOUT,
        "OBSERVATION_STALE": FailureType.STALE_OBSERVATION,
        "POSTCONDITION_FAILED": FailureType.POSTCONDITION_FAILED,
        "PRECONDITION_FAILED": FailureType.POSTCONDITION_FAILED,
    }

    def detect(
        self, bundle: ExecutionBundle, index: int, result: ActionExecutionResult
    ) -> FailureContext | None:
        if result.status != "FAILED" or not result.before_observation_id:
            return None
        action = bundle.manifest.actions[index]
        return FailureContext(
            bundle.session.id,
            action.id,
            self.CODES.get(result.error_code or "", FailureType.UNKNOWN),
            action.expected_postconditions,
            result.error_message or "Action failed without a confirmed outcome",
            result.before_observation_id,
            result.after_observation_id or result.before_observation_id,
            action.target,
            result.error_code or "UNKNOWN",
        )
