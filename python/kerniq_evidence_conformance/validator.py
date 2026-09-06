"""Fail-closed structural validator for kerniq.governance-evidence.v0.2.

Contract source (frozen): docs/development/kerniq_evidence_schema_v0_2_mvp_spec.md

Guarantees implemented here:

- strict JSON loading: duplicate object keys are invalid input, not an
  auto-repairable unknown (spec: "Envelope and record unit");
- no field completion, no trimming, no defaulting, no guessing: the first
  violated MUST raises :class:`EvidenceSchemaError` and the input is
  rejected as-is;
- unknown/extra fields are reported as unsupported
  (:class:`UnsupportedFieldError`), never silently assigned governance
  semantics;
- Observation discipline: ``known`` requires a value and forbids reason;
  ``unknown`` forbids a value and requires a reason; ``not_applicable``
  requires both a source and a reason — and is only allowed on fields where
  the spec permits it;
- unknown is never false: an unobserved stage stays ``unknown``; a
  ``known`` stage with ``occurred=false`` is an evidenced non-occurrence
  and must not carry an ``at`` time;
- digest discipline: exactly one algorithm (sha256), 64 lowercase hex,
  non-empty representation;
- evidence-id discipline across a collection: identical repeats read
  idempotently, the same id with different content is a conflict.
"""

from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

SCHEMA_VERSION = "kerniq.governance-evidence.v0.2"

_TIME_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$")
_HEX64_RE = re.compile(r"^[0-9a-f]{64}$")

STATUS_KNOWN = "known"
STATUS_UNKNOWN = "unknown"
STATUS_NOT_APPLICABLE = "not_applicable"

# Spec section "General Observation type": which statuses each observed
# field may use. not_applicable is never a shortcut for "not observed".
_ALLOWED_STATUSES: Dict[str, frozenset] = {
    "request": frozenset({STATUS_KNOWN, STATUS_UNKNOWN}),
    "decision": frozenset({STATUS_KNOWN, STATUS_UNKNOWN}),
    "authorization": frozenset(
        {STATUS_KNOWN, STATUS_UNKNOWN, STATUS_NOT_APPLICABLE}
    ),
    "argument_binding.requested": frozenset({STATUS_KNOWN, STATUS_UNKNOWN}),
    "argument_binding.effective": frozenset({STATUS_KNOWN, STATUS_UNKNOWN}),
    "argument_binding.executed": frozenset(
        {STATUS_KNOWN, STATUS_UNKNOWN, STATUS_NOT_APPLICABLE}
    ),
    "argument_binding.scope": frozenset({STATUS_KNOWN, STATUS_UNKNOWN}),
    "argument_binding.authorization_match": frozenset(
        {STATUS_KNOWN, STATUS_UNKNOWN, STATUS_NOT_APPLICABLE}
    ),
    "execution.release": frozenset({STATUS_KNOWN, STATUS_UNKNOWN}),
    "execution.dispatch": frozenset({STATUS_KNOWN, STATUS_UNKNOWN}),
    "execution.start": frozenset({STATUS_KNOWN, STATUS_UNKNOWN}),
    "execution.completion": frozenset({STATUS_KNOWN, STATUS_UNKNOWN}),
    "outcome": frozenset({STATUS_KNOWN, STATUS_UNKNOWN}),
}

_ENVELOPE_FIELDS = frozenset(
    {
        "schema_version",
        "evidence_id",
        "producer_ref",
        "profile_ref",
        "recorded_at",
        "previous_evidence_ref",
        "request",
        "decision",
        "authorization",
        "argument_binding",
        "execution",
        "outcome",
    }
)
_OBSERVATION_FIELDS = frozenset({"status", "value", "source_ref", "reason"})
_IDENTITY_FIELDS = frozenset({"source", "subject_ref", "provenance_ref", "reason"})
_REQUEST_FIELDS = frozenset(
    {
        "request_id",
        "tool_call_id",
        "attempt_ref",
        "runtime_ref",
        "action_name",
        "action_ref",
        "identity_provenance",
    }
)
_DECISION_FIELDS = frozenset(
    {
        "decision_id",
        "evaluation",
        "action",
        "policy_ref",
        "target_ref",
        "decided_at",
    }
)
_AUTHORIZATION_FIELDS = frozenset(
    {
        "authorization_ref",
        "disposition",
        "target_ref",
        "approved_at",
        "expires_at",
        "generation",
        "validity_ref",
        "identity_provenance",
    }
)
_ARGUMENT_BINDING_FIELDS = frozenset(
    {
        "requested",
        "effective",
        "executed",
        "scope",
        "authorization_match",
    }
)
_ARGUMENTS_FIELDS = frozenset({"snapshot_ref", "tool_ref", "scope_ref", "digest"})
_SCOPE_FIELDS = frozenset(
    {"scope_ref", "runtime_ref", "context_ref", "resource_refs", "operation"}
)
_MATCH_FIELDS = frozenset(
    {"result", "authorization_target_ref", "effective_target_ref"}
)
_DIGEST_FIELDS = frozenset({"algorithm", "representation", "value"})
_EXECUTION_FIELDS = frozenset({"release", "dispatch", "start", "completion"})
_STAGE_FIELDS = frozenset({"occurred", "at"})
_OUTCOME_FIELDS = frozenset({"status", "reason", "result_ref"})


class EvidenceSchemaError(ValueError):
    """The document violates the frozen v0.2 contract. Fail closed."""


class UnsupportedFieldError(EvidenceSchemaError):
    """The document carries fields outside the frozen v0.2 field set."""


def _fail(path: str, message: str) -> None:
    raise EvidenceSchemaError(f"{path}: {message}")


def _unsupported(path: str, extra: List[str]) -> None:
    raise UnsupportedFieldError(
        f"{path}: unsupported field(s) {sorted(extra)}; the frozen v0.2 "
        "contract does not assign them governance semantics"
    )


def _require_object(value: Any, path: str) -> Dict[str, Any]:
    if not isinstance(value, dict):
        _fail(path, f"expected JSON object, got {type(value).__name__}")
    return value


def _check_field_set(obj: Dict[str, Any], expected: frozenset, path: str) -> None:
    missing = sorted(expected - set(obj))
    if missing:
        _fail(path, f"missing required field(s) {missing}")
    extra = sorted(set(obj) - expected)
    if extra:
        _unsupported(path, extra)


def _check_string(
    value: Any, path: str, *, required: bool
) -> Optional[str]:
    if value is None:
        if required:
            _fail(path, "required string is null")
        return None
    if not isinstance(value, str):
        _fail(path, f"expected string, got {type(value).__name__}")
    if value.strip() == "":
        _fail(path, "string values must be non-empty and not whitespace-only")
    return value


def _check_time(value: Any, path: str, *, required: bool) -> Optional[str]:
    if value is None:
        if required:
            _fail(path, "required timestamp is null")
        return None
    if not isinstance(value, str):
        _fail(path, f"expected timestamp string, got {type(value).__name__}")
    if not _TIME_RE.match(value):
        _fail(path, f"timestamp {value!r} must match YYYY-MM-DDTHH:mm:ss[.fraction]Z")
    try:
        body = value[:-1]  # strip the trailing Z before fraction handling
        datetime.strptime(body.split(".")[0], "%Y-%m-%dT%H:%M:%S")
    except ValueError as error:
        _fail(path, f"timestamp {value!r} is not a real UTC datetime: {error}")
    return value


def _check_enum(value: Any, allowed: frozenset, path: str) -> str:
    if not isinstance(value, str) or value not in allowed:
        _fail(path, f"expected one of {sorted(allowed)}, got {value!r}")
    return value


def _check_string_list_or_null(value: Any, path: str) -> Optional[List[str]]:
    if value is None:
        return None
    if not isinstance(value, list):
        _fail(path, f"expected list of strings or null, got {type(value).__name__}")
    for index, item in enumerate(value):
        _check_string(item, f"{path}[{index}]", required=True)
    return value


# ---------------------------------------------------------------- strict JSON


def _reject_duplicate_keys(pairs: List[Tuple[str, Any]]) -> Dict[str, Any]:
    seen = set()
    for key, _ in pairs:
        if key in seen:
            raise EvidenceSchemaError(
                f"invalid JSON input: duplicate object key {key!r} "
                "(not an auto-repairable unknown)"
            )
        seen.add(key)
    return dict(pairs)


def validate_json_text(text: str) -> Dict[str, Any]:
    """Parse one evidence JSON text strictly; duplicate keys are invalid."""
    try:
        document = json.loads(text, object_pairs_hook=_reject_duplicate_keys)
    except EvidenceSchemaError:
        raise
    except ValueError as error:
        raise EvidenceSchemaError(f"invalid JSON input: {error}") from error
    if not isinstance(document, dict):
        _fail("$", "evidence document must be a JSON object")
    return document


# ------------------------------------------------------------- record bodies


def _check_identity_provenance(value: Any, path: str) -> None:
    obj = _require_object(value, path)
    _check_field_set(obj, _IDENTITY_FIELDS, path)
    source = _check_enum(obj["source"], frozenset({"trusted", "unknown"}), f"{path}.source")
    subject = _check_string(obj["subject_ref"], f"{path}.subject_ref", required=False)
    provenance = _check_string(
        obj["provenance_ref"], f"{path}.provenance_ref", required=False
    )
    reason = _check_string(obj["reason"], f"{path}.reason", required=False)
    if source == "trusted":
        # trusted must name a subject namespace and a verification basis;
        # it is never self-asserted by the proposing producer.
        if subject is None:
            _fail(f"{path}.subject_ref", "trusted identity requires a subject_ref")
        if provenance is None:
            _fail(
                f"{path}.provenance_ref",
                "trusted identity requires a provenance_ref",
            )
        if reason is not None:
            _fail(f"{path}.reason", "trusted identity must not carry a reason")
    else:
        if subject is not None or provenance is not None:
            _fail(
                path,
                "unknown identity must keep subject_ref/provenance_ref null; "
                "caller-claimed identity stays in the source record",
            )
        if reason is None:
            _fail(f"{path}.reason", "unknown identity requires a reason")


def _check_digest(value: Any, path: str) -> None:
    obj = _require_object(value, path)
    _check_field_set(obj, _DIGEST_FIELDS, path)
    algorithm = _check_string(obj["algorithm"], f"{path}.algorithm", required=True)
    if algorithm != "sha256":
        _fail(
            f"{path}.algorithm",
            f"only sha256 is defined by v0.2, got {algorithm!r}; foreign "
            "algorithms stay in the source record, they are not renamed",
        )
    _check_string(obj["representation"], f"{path}.representation", required=True)
    digest_value = _check_string(obj["value"], f"{path}.value", required=True)
    if not _HEX64_RE.match(digest_value):
        _fail(
            f"{path}.value",
            f"digest must be 64 lowercase hex characters, got {digest_value!r}",
        )


def _check_request_record(value: Any, path: str) -> None:
    obj = _require_object(value, path)
    _check_field_set(obj, _REQUEST_FIELDS, path)
    _check_string(obj["request_id"], f"{path}.request_id", required=False)
    _check_string(obj["tool_call_id"], f"{path}.tool_call_id", required=False)
    _check_string(obj["attempt_ref"], f"{path}.attempt_ref", required=False)
    _check_string(obj["runtime_ref"], f"{path}.runtime_ref", required=False)
    _check_string(obj["action_name"], f"{path}.action_name", required=False)
    _check_string(obj["action_ref"], f"{path}.action_ref", required=False)
    _check_identity_provenance(obj["identity_provenance"], f"{path}.identity_provenance")
    correlation = [
        obj["request_id"],
        obj["tool_call_id"],
        obj["attempt_ref"],
    ]
    if all(item is None for item in correlation):
        _fail(
            path,
            "a known RequestRecord needs at least one of "
            "request_id/tool_call_id/attempt_ref",
        )


def _check_decision_record(value: Any, path: str) -> None:
    obj = _require_object(value, path)
    _check_field_set(obj, _DECISION_FIELDS, path)
    _check_string(obj["decision_id"], f"{path}.decision_id", required=False)
    evaluation = _check_enum(
        obj["evaluation"], frozenset({"decided", "error", "unknown"}), f"{path}.evaluation"
    )
    action = obj["action"]
    if evaluation == "decided":
        # decided must commit to allow or block; local holds never collapse
        # into block, and modify does not exist in v0.2.
        _check_enum(action, frozenset({"allow", "block"}), f"{path}.action")
    elif action is not None:
        _fail(
            f"{path}.action",
            f"action must be null unless evaluation=decided, got {action!r}",
        )
    _check_string(obj["policy_ref"], f"{path}.policy_ref", required=False)
    _check_string(obj["target_ref"], f"{path}.target_ref", required=False)
    _check_time(obj["decided_at"], f"{path}.decided_at", required=False)


def _check_authorization_record(value: Any, path: str) -> None:
    obj = _require_object(value, path)
    _check_field_set(obj, _AUTHORIZATION_FIELDS, path)
    _check_string(obj["authorization_ref"], f"{path}.authorization_ref", required=True)
    disposition = _check_enum(
        obj["disposition"],
        frozenset({"granted", "refused", "unknown"}),
        f"{path}.disposition",
    )
    _check_string(obj["target_ref"], f"{path}.target_ref", required=False)
    approved_at = _check_time(obj["approved_at"], f"{path}.approved_at", required=False)
    _check_time(obj["expires_at"], f"{path}.expires_at", required=False)
    _check_string(obj["generation"], f"{path}.generation", required=False)
    _check_string(obj["validity_ref"], f"{path}.validity_ref", required=False)
    if disposition != "granted" and approved_at is not None:
        _fail(
            f"{path}.approved_at",
            f"approved_at must be null unless disposition=granted, got {approved_at!r}",
        )
    _check_identity_provenance(
        obj["identity_provenance"], f"{path}.identity_provenance"
    )


def _check_arguments_record(value: Any, path: str) -> None:
    obj = _require_object(value, path)
    _check_field_set(obj, _ARGUMENTS_FIELDS, path)
    _check_string(obj["snapshot_ref"], f"{path}.snapshot_ref", required=False)
    _check_string(obj["tool_ref"], f"{path}.tool_ref", required=False)
    _check_string(obj["scope_ref"], f"{path}.scope_ref", required=False)
    if obj["digest"] is not None:
        _check_digest(obj["digest"], f"{path}.digest")
    if obj["snapshot_ref"] is None and obj["digest"] is None:
        _fail(
            path,
            "an ArgumentsRecord needs at least one of snapshot_ref/digest",
        )


def _check_scope_record(value: Any, path: str) -> None:
    obj = _require_object(value, path)
    _check_field_set(obj, _SCOPE_FIELDS, path)
    _check_string(obj["scope_ref"], f"{path}.scope_ref", required=True)
    _check_string(obj["runtime_ref"], f"{path}.runtime_ref", required=False)
    _check_string(obj["context_ref"], f"{path}.context_ref", required=False)
    _check_string_list_or_null(obj["resource_refs"], f"{path}.resource_refs")
    _check_string(obj["operation"], f"{path}.operation", required=False)


def _check_match_record(value: Any, path: str) -> None:
    obj = _require_object(value, path)
    _check_field_set(obj, _MATCH_FIELDS, path)
    _check_enum(obj["result"], frozenset({"matched", "mismatched"}), f"{path}.result")
    _check_string(
        obj["authorization_target_ref"],
        f"{path}.authorization_target_ref",
        required=True,
    )
    _check_string(
        obj["effective_target_ref"], f"{path}.effective_target_ref", required=True
    )


def _check_stage_record(value: Any, path: str) -> None:
    obj = _require_object(value, path)
    _check_field_set(obj, _STAGE_FIELDS, path)
    occurred = obj["occurred"]
    if type(occurred) is not bool:
        _fail(f"{path}.occurred", f"expected boolean, got {occurred!r}")
    at = _check_time(obj["at"], f"{path}.at", required=False)
    if occurred is False and at is not None:
        # an evidenced non-occurrence has no occurrence time to record.
        _fail(
            f"{path}.at",
            f"occurred=false must keep at null, got {at!r}",
        )


def _check_outcome_record(value: Any, path: str) -> None:
    obj = _require_object(value, path)
    _check_field_set(obj, _OUTCOME_FIELDS, path)
    status = _check_enum(
        obj["status"],
        frozenset({"success", "failure", "not_executed", "cancelled", "unknown"}),
        f"{path}.status",
    )
    reason = _check_string(obj["reason"], f"{path}.reason", required=False)
    _check_string(obj["result_ref"], f"{path}.result_ref", required=False)
    if status != "success" and reason is None:
        _fail(
            f"{path}.reason",
            f"outcome status {status!r} requires a non-null reason",
        )


_RECORD_CHECKERS = {
    "request": _check_request_record,
    "decision": _check_decision_record,
    "authorization": _check_authorization_record,
}


def _check_observation(
    value: Any,
    path: str,
    allowed_statuses: frozenset,
    record_checker,
) -> None:
    obj = _require_object(value, path)
    _check_field_set(obj, _OBSERVATION_FIELDS, path)
    status = _check_enum(
        obj["status"],
        frozenset({STATUS_KNOWN, STATUS_UNKNOWN, STATUS_NOT_APPLICABLE}),
        f"{path}.status",
    )
    if status not in allowed_statuses:
        _fail(
            f"{path}.status",
            f"status {status!r} is not allowed here (allowed: "
            f"{sorted(allowed_statuses)}); not_applicable is not a shortcut "
            "for unobserved",
        )
    inner = obj["value"]
    source_ref = _check_string(obj["source_ref"], f"{path}.source_ref", required=False)
    reason = _check_string(obj["reason"], f"{path}.reason", required=False)
    if status == STATUS_KNOWN:
        if inner is None:
            _fail(f"{path}.value", "known observation requires a value")
        if reason is not None:
            _fail(f"{path}.reason", "known observation must keep reason null")
        if source_ref is None:
            _fail(f"{path}.source_ref", "known observation requires a source_ref")
        record_checker(inner, f"{path}.value")
    elif status == STATUS_UNKNOWN:
        if inner is not None:
            _fail(
                f"{path}.value",
                f"unknown must carry value=null, got {inner!r}; unknown is "
                "never a recorded fact",
            )
        if reason is None:
            _fail(f"{path}.reason", "unknown observation requires a reason")
    else:  # not_applicable
        if inner is not None:
            _fail(f"{path}.value", "not_applicable must carry value=null")
        if source_ref is None:
            _fail(
                f"{path}.source_ref",
                "not_applicable requires a source_ref supporting the "
                "inapplicability",
            )
        if reason is None:
            _fail(f"{path}.reason", "not_applicable observation requires a reason")


# ------------------------------------------------------------------ envelope


def validate_evidence_document(document: Dict[str, Any]) -> Dict[str, Any]:
    """Validate one parsed evidence object; returns it unmodified.

    No repair, no completion, no mutation: a passing document is exactly
    what was supplied.
    """
    _require_object(document, "$")
    _check_field_set(document, _ENVELOPE_FIELDS, "$")

    if document["schema_version"] != SCHEMA_VERSION:
        _fail(
            "$.schema_version",
            f"expected exactly {SCHEMA_VERSION!r}, got "
            f"{document['schema_version']!r}; unknown versions are not "
            "interpreted as this version",
        )
    _check_string(document["evidence_id"], "$.evidence_id", required=True)
    _check_string(document["producer_ref"], "$.producer_ref", required=True)
    _check_string(document["profile_ref"], "$.profile_ref", required=True)
    _check_time(document["recorded_at"], "$.recorded_at", required=True)
    _check_string(
        document["previous_evidence_ref"],
        "$.previous_evidence_ref",
        required=False,
    )

    _check_observation(
        document["request"],
        "$.request",
        _ALLOWED_STATUSES["request"],
        _check_request_record,
    )
    _check_observation(
        document["decision"],
        "$.decision",
        _ALLOWED_STATUSES["decision"],
        _check_decision_record,
    )
    _check_observation(
        document["authorization"],
        "$.authorization",
        _ALLOWED_STATUSES["authorization"],
        _check_authorization_record,
    )

    binding = _require_object(document["argument_binding"], "$.argument_binding")
    _check_field_set(binding, _ARGUMENT_BINDING_FIELDS, "$.argument_binding")
    _check_observation(
        binding["requested"],
        "$.argument_binding.requested",
        _ALLOWED_STATUSES["argument_binding.requested"],
        _check_arguments_record,
    )
    _check_observation(
        binding["effective"],
        "$.argument_binding.effective",
        _ALLOWED_STATUSES["argument_binding.effective"],
        _check_arguments_record,
    )
    _check_observation(
        binding["executed"],
        "$.argument_binding.executed",
        _ALLOWED_STATUSES["argument_binding.executed"],
        _check_arguments_record,
    )
    _check_observation(
        binding["scope"],
        "$.argument_binding.scope",
        _ALLOWED_STATUSES["argument_binding.scope"],
        _check_scope_record,
    )
    _check_observation(
        binding["authorization_match"],
        "$.argument_binding.authorization_match",
        _ALLOWED_STATUSES["argument_binding.authorization_match"],
        _check_match_record,
    )

    execution = _require_object(document["execution"], "$.execution")
    _check_field_set(execution, _EXECUTION_FIELDS, "$.execution")
    for stage in ("release", "dispatch", "start", "completion"):
        _check_observation(
            execution[stage],
            f"$.execution.{stage}",
            _ALLOWED_STATUSES[f"execution.{stage}"],
            _check_stage_record,
        )

    _check_observation(
        document["outcome"],
        "$.outcome",
        _ALLOWED_STATUSES["outcome"],
        _check_outcome_record,
    )
    return document


def validate_evidence_collection(documents: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Validate a sequence of evidence objects as one producer collection.

    Same (producer_ref, evidence_id) with identical content reads
    idempotently; the same id with different content is a conflict.
    """
    validated: List[Dict[str, Any]] = []
    by_id: Dict[Tuple[str, str], Dict[str, Any]] = {}
    for index, document in enumerate(documents):
        try:
            validate_evidence_document(document)
        except EvidenceSchemaError as error:
            raise EvidenceSchemaError(f"document[{index}]: {error}") from error
        key = (document["producer_ref"], document["evidence_id"])
        seen = by_id.get(key)
        if seen is None:
            by_id[key] = document
        elif seen != document:
            # Key order never matters; parsed deep equality is the contract.
            raise EvidenceSchemaError(
                f"document[{index}]: evidence_id {document['evidence_id']!r} "
                f"in producer {document['producer_ref']!r} conflicts with a "
                "different record under the same id"
            )
        validated.append(document)
    return validated
