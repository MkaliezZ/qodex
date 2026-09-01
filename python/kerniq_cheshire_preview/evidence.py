"""Evidence Schema v1 capture for the Cheshire Cat governed preview.

One JSON line per lifecycle event. The lifecycle is a truthfulness state
machine — nothing about execution is predicted before it happens:

    REQUESTED               tool request observed (requested_arguments)
    AUTHORIZED              policy allow (effective_arguments snapshot)
    BLOCKED                 policy block / fail-closed outcome
    DISPATCH_STARTED        original dispatcher invocation began
    EXECUTED                original dispatcher returned; only this state
                            may carry executed_arguments / tool_result
    FAILED_BEFORE_EXECUTION dispatcher raised before any tool could run
    FAILED_AFTER_DISPATCH   dispatcher raised after dispatch began

Canonical decision actions remain ``allow`` and ``block`` only — there is no
``modify``; the argument snapshot under an allow decision is recorded as
``effective_arguments``.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

EVIDENCE_SCHEMA = "kerniq.cheshire-preview-evidence.v1"
CANONICAL_DECISIONS = ("allow", "block")

STATUS_REQUESTED = "REQUESTED"
STATUS_AUTHORIZED = "AUTHORIZED"
STATUS_BLOCKED = "BLOCKED"
STATUS_DISPATCH_STARTED = "DISPATCH_STARTED"
STATUS_EXECUTED = "EXECUTED"
STATUS_FAILED_BEFORE_EXECUTION = "FAILED_BEFORE_EXECUTION"
STATUS_FAILED_AFTER_DISPATCH = "FAILED_AFTER_DISPATCH"


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


def _record(evidence_path: Path, event: dict[str, Any]) -> None:
    line = json.dumps(event, default=str)
    try:
        with evidence_path.open("a", encoding="utf-8") as handle:
            handle.write(line + "\n")
    except OSError as error:
        raise EvidenceFailure(f"evidence append failed: {error}") from error


def _identity(
    request_id: str,
    tool_call_id: str,
    tool_name: str,
) -> dict[str, Any]:
    return {
        "schema": EVIDENCE_SCHEMA,
        "request_id": request_id,
        "tool_call_id": tool_call_id,
        "tool_name": tool_name,
    }


def record_requested(
    evidence_path: Path,
    *,
    request_id: str,
    tool_call_id: str,
    tool_name: str,
    requested_arguments: Any,
) -> None:
    """REQUESTED: the request as observed, before any decision."""
    _record(
        evidence_path,
        {
            **_identity(request_id, tool_call_id, tool_name),
            "status": STATUS_REQUESTED,
            "requested_arguments": _dump(requested_arguments),
        },
    )


def record_authorized(
    evidence_path: Path,
    *,
    request_id: str,
    tool_call_id: str,
    tool_name: str,
    policy_decision: str,
    effective_arguments: Any,
    reason: str,
) -> None:
    """AUTHORIZED: policy returned allow; effective snapshot recorded."""
    if policy_decision != "allow":  # pragma: no cover - guard for callers
        raise EvidenceFailure(f"authorized state requires allow, got {policy_decision!r}")
    _record(
        evidence_path,
        {
            **_identity(request_id, tool_call_id, tool_name),
            "status": STATUS_AUTHORIZED,
            "policy_decision": "allow",
            "effective_arguments": _dump(effective_arguments),
            "reason": reason,
        },
    )


def record_blocked(
    evidence_path: Path,
    *,
    request_id: str,
    tool_call_id: str,
    tool_name: str,
    requested_arguments: Any,
    policy_decision: str,
    reason: str,
) -> None:
    """BLOCKED: policy block or fail-closed outcome; no execution claims."""
    if policy_decision not in CANONICAL_DECISIONS:
        raise EvidenceFailure(f"non-canonical decision: {policy_decision!r}")
    _record(
        evidence_path,
        {
            **_identity(request_id, tool_call_id, tool_name),
            "status": STATUS_BLOCKED,
            "requested_arguments": _dump(requested_arguments),
            "policy_decision": policy_decision,
            "dispatch": False,
            "reason": reason,
        },
    )


def record_dispatch_started(
    evidence_path: Path,
    *,
    request_id: str,
    tool_call_id: str,
    tool_name: str,
) -> None:
    """DISPATCH_STARTED: the original dispatcher invocation began."""
    _record(
        evidence_path,
        {
            **_identity(request_id, tool_call_id, tool_name),
            "status": STATUS_DISPATCH_STARTED,
        },
    )


def record_executed(
    evidence_path: Path,
    *,
    request_id: str,
    tool_call_id: str,
    tool_name: str,
    executed_arguments: Any,
    tool_result: Any,
) -> None:
    """EXECUTED: the original dispatcher completed. This is the only state
    allowed to carry executed_arguments / tool_result."""
    _record(
        evidence_path,
        {
            **_identity(request_id, tool_call_id, tool_name),
            "status": STATUS_EXECUTED,
            "executed_arguments": _dump(executed_arguments),
            "tool_result": None if tool_result is None else str(tool_result),
        },
    )


def record_failure(
    evidence_path: Path,
    *,
    request_id: str,
    tool_call_id: str,
    tool_name: str,
    before_execution: bool,
    error: Any,
) -> None:
    """FAILED_*: the dispatcher raised. `before_execution` distinguishes a
    raise with no matching tool registered (nothing could have executed)
    from a raise after dispatch began."""
    status = (
        STATUS_FAILED_BEFORE_EXECUTION if before_execution else STATUS_FAILED_AFTER_DISPATCH
    )
    _record(
        evidence_path,
        {
            **_identity(request_id, tool_call_id, tool_name),
            "status": status,
            "error": str(error),
        },
    )
