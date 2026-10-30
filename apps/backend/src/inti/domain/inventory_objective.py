import re


def matches_inventory_objective(goal: str, record: str, status: str) -> bool:
    record_re, status_re = re.escape(record), re.escape(status)
    pattern = (
        rf"(?:Find (?:asset )?{record_re}(?: and |,\s*)(?:change|update) its status to {status_re}|"
        rf"(?:Change|Update|Set) (?:asset )?{record_re}(?:'s)? status to {status_re})"
        r"(?:,? and verify (?:the )?persisted result)?\.?\s*"
    )
    return re.fullmatch(pattern, goal.strip(), re.IGNORECASE) is not None
