"""Evidence Schema v1 capture for the Cheshire Cat governed preview.

One JSON line per governed tool request. Canonical decision actions are
``allow`` and ``block`` only — there is no ``modify``; the argument snapshot
under an allow decision is recorded as ``effective_arguments``.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

EVIDENCE_SCHEMA = "kerniq.cheshire-preview-evidence.v1"
CANONICAL_DECISIONS = ("allow", "block")


class EvidenceFailure(RuntimeError):
    """Evidence could not be recorded; callers must fail closed."""


def _dump(value: Any) -> Any:
    """Best-effort JSON-safe copy of an arguments mapping."""
    if value is None:
        return None
    if isinstance(value, dict):
        try:
            return json.loads(json.dumps(value, default=str))
        except (TypeError, ValueError):  # pragma: no cover - defensive
            return {str(k): str(v) for k, v in value.items()}
    return str(value)


def record_request(
    evidence_path: Path,
    *,
    request_id: str,
    tool_call_id: str,
    tool_name: str,
    requested_arguments: Any,
    policy_decision: str,
    effective_arguments: Optional[Any],
    dispatch: bool,
    outcome: str,
    reason: str,
) -> None:
    """Append the decision-phase evidence line for one governed request.

    Raises :class:`EvidenceFailure` when the line cannot be persisted so the
    interceptor can fail closed instead of governing silently.
    """
    if policy_decision not in CANONICAL_DECISIONS:
        raise EvidenceFailure(f"non-canonical decision: {policy_decision!r}")
    line = json.dumps(
        {
            "schema": EVIDENCE_SCHEMA,
            "phase": "request",
            "request_id": request_id,
            "tool_call_id": tool_call_id,
            "tool_name": tool_name,
            "requested_arguments": _dump(requested_arguments),
            "policy_decision": policy_decision,
            "effective_arguments": _dump(effective_arguments),
            "dispatch": dispatch,
            "outcome": outcome,
            "reason": reason,
        },
        default=str,
    )
    _append(evidence_path, line)


def record_result(
    evidence_path: Path,
    *,
    request_id: str,
    tool_call_id: str,
    executed_arguments: Optional[Any],
    tool_result: Optional[Any],
    outcome: str,
) -> None:
    """Append the execution-phase evidence line for a dispatched tool."""
    line = json.dumps(
        {
            "schema": EVIDENCE_SCHEMA,
            "phase": "result",
            "request_id": request_id,
            "tool_call_id": tool_call_id,
            "executed_arguments": _dump(executed_arguments),
            "tool_result": None if tool_result is None else str(tool_result),
            "outcome": outcome,
        },
        default=str,
    )
    _append(evidence_path, line)


def _append(evidence_path: Path, line: str) -> None:
    try:
        with evidence_path.open("a", encoding="utf-8") as handle:
            handle.write(line + "\n")
    except OSError as error:
        raise EvidenceFailure(f"evidence append failed: {error}") from error
