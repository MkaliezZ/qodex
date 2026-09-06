"""Offline projector: DSH native observer event bundles → Evidence v0.2.

Fail-closed by construction. The projector reads a read-only JSONL bundle,
groups events by the native correlation key, and projects each complete or
incomplete group into one kerniq.governance-evidence.v0.2 document plus a
per-field lineage and a diagnostics list. It never repairs the source,
never invents fields, never converts unknown into false, and reports —
instead of publishing — any group with conflicting facts.

Every produced document is validated by the frozen conformance validator
before it is returned; a projection that cannot validate is a projector
bug, not a silently-degraded output.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from kerniq_evidence_conformance import (
    SCHEMA_VERSION,
    validate_evidence_document,
)

from . import profile

DIAG_UNSUPPORTED_EVENT = "unsupported_event"
DIAG_MALFORMED_LINE = "malformed_line"
DIAG_MISSING_CORRELATION_KEY = "missing_correlation_key"
DIAG_MISSING_REQUIRED_SOURCE_FIELD = "missing_required_source_field"
DIAG_CONFLICTING_SOURCE = "conflicting_source"


class ProjectionError(RuntimeError):
    """Bundle-level failure (unreadable source). Fail closed."""


@dataclass
class ProjectionResult:
    documents: List[Dict[str, Any]]
    diagnostics: List[Dict[str, Any]]
    lineage: List[Dict[str, Any]]
    bundle_digest: str


def _line_ref(bundle_digest: str, line_number: int) -> str:
    # Artifact reference (boundary review): digest + record offset. This is
    # a capture-artifact reference, not a native event id.
    return f"dsh-observer-capture:{bundle_digest[:16]}#L{line_number}"


def _unknown(reason: str, source_ref: Optional[str] = None) -> Dict[str, Any]:
    return {"status": "unknown", "value": None, "source_ref": source_ref, "reason": reason}


def _known(value: Dict[str, Any], source_ref: str) -> Dict[str, Any]:
    return {"status": "known", "value": value, "source_ref": source_ref, "reason": None}


def read_bundle(path: Path) -> Tuple[str, List[Optional[Dict[str, Any]]], List[Dict[str, Any]]]:
    """Read a JSONL bundle read-only; returns (digest, lines, diagnostics).

    Malformed lines become diagnostics — the projector never repairs them.
    """
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    diagnostics: List[Dict[str, Any]] = []
    lines: List[Optional[Dict[str, Any]]] = []
    for index, raw_line in enumerate(raw.decode("utf-8").splitlines(), start=1):
        if not raw_line.strip():
            lines.append(None)
            continue
        try:
            parsed = json.loads(raw_line)
        except ValueError:
            diagnostics.append(
                {"code": DIAG_MALFORMED_LINE, "line": index, "detail": "line is not JSON"}
            )
            lines.append(None)
            continue
        if not isinstance(parsed, dict):
            diagnostics.append(
                {"code": DIAG_MALFORMED_LINE, "line": index, "detail": "line is not an object"}
            )
            lines.append(None)
            continue
        lines.append(parsed)
    return digest, lines, diagnostics


def _check_source_shape(
    event: Dict[str, Any], line_number: int, diagnostics: List[Dict[str, Any]]
) -> bool:
    """Reject events missing the fields their phase is defined on. The
    projector does not guess: an event without its defined shape is a
    diagnostic, and the fact stays unrecorded."""
    phase = event.get("phase")
    required = ["toolCallId"]
    if phase == profile.PHASE_MODEL_REQUEST:
        required.append("toolName")
    elif phase == profile.PHASE_PRE_EXECUTE:
        if "decision" in event:
            required.append("decision")
        else:
            required.append("observed")
    elif phase == profile.PHASE_RESULT:
        required.append("isError")
    elif phase == profile.PHASE_TOOL_CALL_APPROVED:
        required.extend(["authorization_ref", "disposition"])
    missing = [name for name in required if name not in event]
    if profile.CORRELATION_KEY in missing:
        # report under the correlation code so orphans are distinguishable
        diagnostics.append(
            {
                "code": "missing_correlation_key",
                "line": line_number,
                "detail": f"{phase} event missing toolCallId; event cannot be correlated",
            }
        )
        return False
    if missing:
        diagnostics.append(
            {
                "code": DIAG_MISSING_REQUIRED_SOURCE_FIELD,
                "line": line_number,
                "detail": f"{phase} event missing {missing}",
            }
        )
        return False
    return True


def _group_events(
    lines: List[Optional[Dict[str, Any]]], bundle_digest: str, diagnostics: List[Dict[str, Any]]
) -> Dict[str, Dict[str, List[Tuple[int, Dict[str, Any]]]]]:
    """Group shaped events by the native correlation key."""
    groups: Dict[str, Dict[str, List[Tuple[int, Dict[str, Any]]]]] = {}
    for index, event in enumerate(lines, start=1):
        if event is None:
            continue
        phase = event.get("phase")
        if phase not in profile.PROFILE_PHASES:
            diagnostics.append(
                {
                    "code": DIAG_UNSUPPORTED_EVENT,
                    "line": index,
                    "detail": f"phase {phase!r} is not in {profile.PROFILE_ID}",
                }
            )
            continue
        if not _check_source_shape(event, index, diagnostics):
            continue
        call_id = event[profile.CORRELATION_KEY]
        bucket = groups.setdefault(call_id, {})
        bucket.setdefault(phase, []).append((index, event))
    return groups


def _detect_group_conflicts(
    call_id: str,
    group: Dict[str, List[Tuple[int, Dict[str, Any]]]],
    diagnostics: List[Dict[str, Any]],
) -> bool:
    """Same native call id with conflicting facts is reported, never
    merged last-write-wins."""
    conflicts: List[str] = []
    decisions = {
        event["decision"]
        for _, event in group.get(profile.PHASE_PRE_EXECUTE, [])
        if "decision" in event
    }
    if len(decisions) > 1:
        conflicts.append(f"pre_execute decisions differ: {sorted(decisions)}")
    results = {
        (event["isError"], event.get("errorCode"))
        for _, event in group.get(profile.PHASE_RESULT, [])
    }
    if len(results) > 1:
        conflicts.append(f"result outcomes differ: {sorted(map(str, results))}")
    if conflicts:
        diagnostics.append(
            {
                "code": DIAG_CONFLICTING_SOURCE,
                "call_id": call_id,
                "detail": "; ".join(conflicts),
            }
        )
        return True
    return False


def _dedupe(
    events: List[Tuple[int, Dict[str, Any]]]
) -> List[Tuple[int, Dict[str, Any]]]:
    """Idempotent re-reads: identical duplicate lines collapse to one."""
    seen = set()
    unique = []
    for line_number, event in events:
        key = json.dumps(event, sort_keys=True)
        if key in seen:
            continue
        seen.add(key)
        unique.append((line_number, event))
    return unique


def _identity_unknown() -> Dict[str, Any]:
    return {
        "source": "unknown",
        "subject_ref": None,
        "provenance_ref": None,
        "reason": profile.IDENTITY_UNKNOWN_REASON,
    }


def _project_request(
    call_id: str,
    group: Dict[str, List[Tuple[int, Dict[str, Any]]]],
    digest: str,
    lineage: Dict[str, Any],
) -> Dict[str, Any]:
    requests = group.get(profile.PHASE_MODEL_REQUEST, [])
    if not requests:
        lineage["request"] = {"rule": "absent_model_request", "source_lines": []}
        return _unknown("model_request_event_missing")
    line_number, event = _dedupe(requests)[0]
    ref = _line_ref(digest, line_number)
    lineage["request"] = {
        "rule": "model_request→RequestRecord (tool_call_id=native call id; ids/args/identity not recorded by observer)",
        "source_lines": [line_number],
    }
    value = {
        "request_id": None,  # the observer format has no native request id
        "tool_call_id": call_id,
        "attempt_ref": None,  # and no attempt identifier: never fabricated
        "runtime_ref": profile.RUNTIME_REF,
        "action_name": event["toolName"],
        "action_ref": None,  # display name only; no versioned action ref exists
        "identity_provenance": _identity_unknown(),
    }
    return _known(value, ref)


def _project_decision(
    group: Dict[str, List[Tuple[int, Dict[str, Any]]]],
    digest: str,
    lineage: Dict[str, Any],
) -> Dict[str, Any]:
    decided = [
        (number, event)
        for number, event in group.get(profile.PHASE_PRE_EXECUTE, [])
        if "decision" in event
    ]
    if not decided:
        lineage["decision"] = {"rule": "absent_pre_execute_decision", "source_lines": []}
        return _unknown("pre_execute_decision_missing")
    line_number, event = _dedupe(decided)[0]
    ref = _line_ref(digest, line_number)
    kind = event["decision"]
    mapping = profile.DECISION_KIND_MAP.get(kind)
    if mapping is None:
        # Unknown local enum: preserved as a diagnostic-grade unknown; the
        # projector must not widen the frozen mapping table on its own.
        lineage["decision"] = {
            "rule": f"unmapped DSH decision kind {kind!r} → unknown",
            "source_lines": [line_number],
        }
        return _unknown(f"unmapped_decision_kind:{kind}", source_ref=ref)
    evaluation, action = mapping
    lineage["decision"] = {
        "rule": f"pre_execute.decision={kind!r} → evaluation={evaluation}, action={action}",
        "source_lines": [line_number],
    }
    value = {
        "decision_id": None,  # no native decision id in the observer format
        "evaluation": evaluation,
        "action": action,
        "policy_ref": None,  # the observer line carries no policy reference
        "target_ref": None,  # and no decision target
        "decided_at": None,  # no per-event timestamps exist; never recorded_at
    }
    return _known(value, ref)


def _project_authorization(
    group: Dict[str, List[Tuple[int, Dict[str, Any]]]],
    digest: str,
    lineage: Dict[str, Any],
) -> Dict[str, Any]:
    approvals = group.get(profile.PHASE_TOOL_CALL_APPROVED, [])
    if not approvals:
        lineage["authorization"] = {
            "rule": "no approval event in bundle → unknown (not absence of approval)",
            "source_lines": [],
        }
        return _unknown(profile.NO_AUTHORIZATION_REASON)
    line_number, event = _dedupe(approvals)[0]
    ref = _line_ref(digest, line_number)
    lineage["authorization"] = {
        "rule": "tool_call_approved (profile-supported; audited observer does not emit) → existing-record reference; approval existence is never human attribution",
        "source_lines": [line_number],
        "synthetic_source": True,
    }
    value = {
        "authorization_ref": event["authorization_ref"],
        "disposition": event["disposition"],
        "target_ref": event.get("target_ref"),
        "approved_at": None,  # the synthetic format carries no timestamps
        "expires_at": None,
        "generation": None,
        "validity_ref": None,
        "identity_provenance": _identity_unknown(),
    }
    return _known(value, ref)


def _project_argument_binding(
    group: Dict[str, List[Tuple[int, Dict[str, Any]]]],
    authorization: Dict[str, Any],
    digest: str,
    lineage: Dict[str, Any],
) -> Dict[str, Any]:
    # The observer records no arguments at any of the three stages; no
    # value is ever invented or copied between stages (RP-04).
    lineage["argument_binding"] = {
        "rule": "observer records no args at any stage → requested/effective/executed/scope unknown",
        "source_lines": [],
    }
    if (
        authorization["status"] == "known"
        and authorization["value"]["disposition"] == "granted"
        and authorization["value"].get("target_ref") is None
    ):
        match_reason = profile.MATCH_UNKNOWN_NO_TARGET_REASON
    else:
        match_reason = profile.MATCH_UNKNOWN_REASON
    return {
        "requested": _unknown(profile.UNKNOWN_ARG_REASONS["requested"]),
        "effective": _unknown(profile.UNKNOWN_ARG_REASONS["effective"]),
        "executed": _unknown(profile.UNKNOWN_ARG_REASONS["executed"]),
        "scope": _unknown("dsh_observer_records_no_scope"),
        "authorization_match": _unknown(match_reason),
    }


def _stage(occurred: bool, ref: Optional[str]) -> Dict[str, Any]:
    return _known({"occurred": occurred, "at": None}, ref) if ref else (
        _unknown("stage_event_missing")
    )


def _project_execution(
    group: Dict[str, List[Tuple[int, Dict[str, Any]]]],
    digest: str,
    lineage: Dict[str, Any],
) -> Tuple[Dict[str, Any], Optional[Tuple[int, Dict[str, Any]]]]:
    dispatches = _dedupe(group.get(profile.PHASE_DISPATCH, []))
    results = _dedupe(group.get(profile.PHASE_RESULT, []))
    dispatch_ref = _line_ref(digest, dispatches[0][0]) if dispatches else None
    result_ref = _line_ref(digest, results[0][0]) if results else None
    lineage["execution"] = {
        "rule": (
            "dispatch line = tools/execute hook entered = execution-chain "
            "delegation (profile-pinned source review); start stays unknown "
            "(hook entry is not the tool implementation entry); result line "
            "= observed terminal; release has no receipt"
        ),
        "source_lines": {
            "dispatch": [number for number, _ in dispatches],
            "result": [number for number, _ in results],
        },
    }
    execution = {
        # No release receipt exists in the observer vocabulary.
        "release": _unknown("no_release_receipt_recorded"),
        "dispatch": _stage(True, dispatch_ref) if dispatches else _unknown("dispatch_event_missing"),
        # Entering the hook proves delegation, never the physical entry.
        "start": _unknown("dsh_observer_hook_is_not_tool_entry"),
        "completion": _stage(True, result_ref) if results else _unknown("result_event_missing"),
    }
    result_event = results[0][1] if results else None
    return execution, ((results[0][0], result_event) if results else None)


def _project_outcome(
    decision: Dict[str, Any],
    execution: Dict[str, Any],
    result: Optional[Tuple[int, Dict[str, Any]]],
    digest: str,
    lineage: Dict[str, Any],
) -> Dict[str, Any]:
    if result is None:
        lineage["outcome"] = {
            "rule": "no result event → outcome unknown (never auto success/failure)",
            "source_lines": [],
        }
        return _unknown("result_event_missing")
    line_number, event = result
    ref = _line_ref(digest, line_number)
    dispatch_delegated = execution["dispatch"]["status"] == "known"
    decision_action = (
        decision["value"]["action"] if decision["status"] == "known" else None
    )
    if event["isError"] is False:
        rule = "result.isError=false → success (source-confirmed tool-call return; no side-effect claim)"
        value = {"status": "success", "reason": None, "result_ref": None}
    elif event["isError"] is True and dispatch_delegated:
        rule = "result.isError=true with dispatch delegation → failure"
        value = {
            "status": "failure",
            "reason": event.get("errorCode") or "observed_error_result",
            "result_ref": None,
        }
    elif event["isError"] is True and decision_action == "block":
        # Controlled non-execution terminal: a reliable policy block plus no
        # dispatch line (the AgentFuse gate does not chain next on deny), so
        # the error result is the denial feedback, not a tool failure.
        rule = (
            "result.isError=true with policy block and no dispatch → "
            "not_executed (denial feedback terminal; Blocked != Failed)"
        )
        value = {
            "status": "not_executed",
            "reason": "policy_blocked",
            "result_ref": None,
        }
    else:
        rule = (
            "result.isError=true without dispatch and without a policy block "
            "→ source-reported indeterminate result"
        )
        value = {
            "status": "unknown",
            "reason": "result_semantics_ambiguous_without_dispatch",
            "result_ref": None,
        }
    lineage["outcome"] = {"rule": rule, "source_lines": [line_number]}
    return _known(value, ref)


def project_bundle(
    bundle_path: Path,
    *,
    recorded_at: str,
    projection_id: str,
) -> ProjectionResult:
    """Project one read-only DSH observer bundle into Evidence v0.2.

    ``recorded_at`` is the projection time (never an event time) and
    ``projection_id`` names this projection view; identical inputs and
    context re-project deterministically.
    """
    digest, lines, diagnostics = read_bundle(Path(bundle_path))
    groups = _group_events(lines, digest, diagnostics)

    documents: List[Dict[str, Any]] = []
    lineage_records: List[Dict[str, Any]] = []
    for call_id in sorted(groups):
        group = groups[call_id]
        if _detect_group_conflicts(call_id, group, diagnostics):
            continue
        lineage: Dict[str, Any] = {"call_id": call_id}
        request = _project_request(call_id, group, digest, lineage)
        decision = _project_decision(group, digest, lineage)
        authorization = _project_authorization(group, digest, lineage)
        binding = _project_argument_binding(group, authorization, digest, lineage)
        execution, result = _project_execution(group, digest, lineage)
        outcome = _project_outcome(decision, execution, result, digest, lineage)

        evidence_id = (
            f"{projection_id}:{digest[:12]}:{hashlib.sha256(call_id.encode()).hexdigest()[:12]}"
        )
        document = {
            "schema_version": SCHEMA_VERSION,
            "evidence_id": evidence_id,
            "producer_ref": profile.PRODUCER_REF,
            "profile_ref": profile.PROFILE_REF,
            "recorded_at": recorded_at,
            "previous_evidence_ref": None,
            "request": request,
            "decision": decision,
            "authorization": authorization,
            "argument_binding": binding,
            "execution": execution,
            "outcome": outcome,
        }
        # Fail closed on ourselves: a projection that does not validate is
        # a projector bug and must never be published as conformant.
        documents.append(validate_evidence_document(document))
        lineage_records.append(
            {
                "evidence_id": evidence_id,
                "bundle_digest": digest,
                "fields": lineage,
            }
        )
    return ProjectionResult(
        documents=documents,
        diagnostics=diagnostics,
        lineage=lineage_records,
        bundle_digest=digest,
    )
