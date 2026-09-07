"""Offline LangChain limited projector: fixed bundle → Evidence v0.2.

Fail-closed. Reads only the pinned engineering-source-bundle, verifies both
bundle digests before touching a single event, enforces the limited
profile's structured-subset and opaque-exclusion rules, and emits one
kerniq.governance-evidence.v0.2 document validated by the frozen conformance
validator. Never upgrades unknowns, never parses opaque reprs, never
re-runs or imports anything from the source runtime.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from kerniq_evidence_conformance import (
    SCHEMA_VERSION,
    validate_evidence_document,
)

from . import langchain_profile as profile

DIAG_DIGEST_MISMATCH = "bundle_identity_mismatch"
DIAG_OPAQUE_EXCLUDED = "opaque_event_excluded"
DIAG_MISSING_REQUIRED_SOURCE = "missing_required_source_event"
DIAG_CORRELATION_MISMATCH = "correlation_mismatch"
DIAG_CONFLICTING_RESULT = "conflicting_terminal_result"
DIAG_STRUCTURE_MISMATCH = "source_structure_mismatch"


class ProjectionRefusal(RuntimeError):
    """Bundle-level refusal: identity/structure failures abort everything."""


@dataclass
class LangChainProjectionResult:
    document: Optional[Dict[str, Any]]
    diagnostics: List[Dict[str, Any]] = field(default_factory=list)
    lineage: Dict[str, Any] = field(default_factory=dict)
    opaque_exclusions: List[int] = field(default_factory=list)


def _unknown(reason: str, source_ref: Optional[str] = None) -> Dict[str, Any]:
    return {"status": "unknown", "value": None, "source_ref": source_ref, "reason": reason}


def _known(value: Dict[str, Any], source_ref: str) -> Dict[str, Any]:
    return {"status": "known", "value": value, "source_ref": source_ref, "reason": None}


def _line_ref(line: int) -> str:
    return f"{profile.BUNDLE_DIR}/raw/native-events.jsonl#L{line}"


def canonical_args_digest(args: Dict[str, Any]) -> str:
    compact = json.dumps(args, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(compact.encode("utf-8")).hexdigest()


def _load_lines(bundle_root: Path) -> List[Dict[str, Any]]:
    raw = bundle_root / "raw" / "native-events.jsonl"
    lines = [
        json.loads(line)
        for line in raw.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    if len(lines) != 53:
        raise ProjectionRefusal(
            f"source structure mismatch: expected 53 raw lines, found {len(lines)}"
        )
    return lines


def _verify_identity(bundle_root: Path) -> None:
    manifest_digest = hashlib.sha256(
        (bundle_root / "manifest.json").read_bytes()
    ).hexdigest()
    raw_digest = hashlib.sha256(
        (bundle_root / "raw" / "native-events.jsonl").read_bytes()
    ).hexdigest()
    if manifest_digest != profile.MANIFEST_SHA256 or raw_digest != profile.RAW_SHA256:
        raise ProjectionRefusal(
            "bundle identity mismatch: "
            f"manifest={manifest_digest[:16]}… raw={raw_digest[:16]}… "
            "(projection refuses to proceed on unverifiable source)"
        )


def _enforce_opaque_exclusion(
    lines: List[Dict[str, Any]], diagnostics: List[Dict[str, Any]]
) -> List[int]:
    """Hard-exclude the four opaque Command carrier lines. Detection is by
    structure (lc type marker + langgraph Command id), never by reading the
    repr; the repr content is not accessed at all."""
    excluded: List[int] = []
    for number in profile.OPAQUE_EXCLUDED_LINES:
        blob = json.dumps(lines[number - 1])
        has_type = f'"type": "{profile.OPAQUE_TYPE}"' in blob
        has_command_id = json.dumps(profile.OPAQUE_COMMAND_ID) in blob
        if not (has_type and has_command_id):
            # P2-1 fail closed: a pinned opaque line that no longer carries
            # the exact expected marker means the source deviates from the
            # audited structure; exclusion cannot proceed on faith.
            raise ProjectionRefusal(
                "opaque marker missing on pinned line "
                f"{number}: the limited profile only admits a source whose "
                "excluded lines carry the audited not_implemented Command "
                "marker (repr never read)"
            )
        diagnostics.append(
            {
                "code": DIAG_OPAQUE_EXCLUDED,
                "line": number,
                "detail": (
                    "langgraph.types.Command serialized as not_implemented; "
                    "repr never parsed; excluded from all known evidence"
                ),
                "detected": True,
            }
        )
        excluded.append(number)
    # No unapproved opaque Command may hide on other lines: a new
    # not_implemented Command outside the pinned exclusion set refuses
    # instead of silently widening the profile.
    for number, event in enumerate(lines, start=1):
        if number in profile.OPAQUE_EXCLUDED_LINES:
            continue
        blob = json.dumps(event)
        if (
            f'"type": "{profile.OPAQUE_TYPE}"' in blob
            and json.dumps(profile.OPAQUE_COMMAND_ID) in blob
        ):
            raise ProjectionRefusal(
                "unexpected opaque Command on unapproved line "
                f"{number}: the limited profile does not widen "
                "OPAQUE_EXCLUDED_LINES by content"
            )
    return excluded


def _extract_tool_request(
    lines: List[Dict[str, Any]], diagnostics: List[Dict[str, Any]]
) -> Optional[Dict[str, Any]]:
    event = lines[profile.L_MODEL_TOOL_REQUEST - 1]
    if event.get("event") != "on_chat_model_end":
        diagnostics.append(
            {
                "code": DIAG_STRUCTURE_MISMATCH,
                "line": profile.L_MODEL_TOOL_REQUEST,
                "detail": "expected on_chat_model_end",
            }
        )
        return None
    output = event.get("data", {}).get("output", {})
    tool_calls = (output.get("kwargs", {}) or {}).get("tool_calls") or []
    if len(tool_calls) != 1:
        diagnostics.append(
            {
                "code": DIAG_CORRELATION_MISMATCH,
                "line": profile.L_MODEL_TOOL_REQUEST,
                "detail": f"expected exactly one structured tool call, found {len(tool_calls)}",
            }
        )
        return None
    return tool_calls[0]


def _extract_tool_end(
    lines: List[Dict[str, Any]], diagnostics: List[Dict[str, Any]]
) -> Optional[Dict[str, Any]]:
    event = lines[profile.L_TOOL_END - 1]
    if event.get("event") != "on_tool_end":
        diagnostics.append(
            {
                "code": DIAG_STRUCTURE_MISMATCH,
                "line": profile.L_TOOL_END,
                "detail": "expected on_tool_end",
            }
        )
        return None
    message = event.get("data", {}).get("output", {})
    return (message.get("kwargs", {}) or {})


def _check_correlation(
    request: Dict[str, Any],
    tool_end: Dict[str, Any],
    lines: List[Dict[str, Any]],
    diagnostics: List[Dict[str, Any]],
) -> bool:
    if request.get("id") != profile.TOOL_CALL_ID:
        diagnostics.append(
            {
                "code": DIAG_CORRELATION_MISMATCH,
                "detail": (
                    f"tool_call_id mismatch at request: {request.get('id')!r}"
                ),
            }
        )
        return False
    if tool_end.get("tool_call_id") != profile.TOOL_CALL_ID:
        diagnostics.append(
            {
                "code": DIAG_CORRELATION_MISMATCH,
                "detail": (
                    f"tool_call_id mismatch at result: {tool_end.get('tool_call_id')!r}"
                ),
            }
        )
        return False
    tool_start = lines[profile.L_TOOL_START - 1]
    if tool_start.get("run_id") != profile.TOOL_RUN_ID:
        diagnostics.append(
            {
                "code": DIAG_CORRELATION_MISMATCH,
                "detail": "tool run_id mismatch at on_tool_start",
            }
        )
        return False
    tool_end_event = lines[profile.L_TOOL_END - 1]
    if tool_end_event.get("run_id") != profile.TOOL_RUN_ID:
        diagnostics.append(
            {
                "code": DIAG_CORRELATION_MISMATCH,
                "detail": "tool run_id mismatch at on_tool_end",
            }
        )
        return False
    if tool_end_event.get("run_id") != tool_start.get("run_id"):
        diagnostics.append(
            {
                "code": DIAG_CORRELATION_MISMATCH,
                "detail": "on_tool_start/on_tool_end run ids diverge",
            }
        )
        return False
    start_parents = tool_start.get("parent_ids", [])
    end_parents = tool_end_event.get("parent_ids", [])
    # parent_ids is the ancestor chain: the pinned root run must appear in
    # both, and the start/end chains must be consistent with each other.
    if (
        profile.ROOT_RUN_ID not in start_parents
        or profile.ROOT_RUN_ID not in end_parents
    ):
        diagnostics.append(
            {
                "code": DIAG_CORRELATION_MISMATCH,
                "detail": "tool run not nested under the pinned root run chain",
            }
        )
        return False
    if start_parents != end_parents:
        diagnostics.append(
            {
                "code": DIAG_CORRELATION_MISMATCH,
                "detail": "tool start/end parent chains diverge",
            }
        )
        return False
    return True


def project_langchain_limited(
    bundle_root: Path,
    *,
    recorded_at: str,
    projection_id: str = "langchain-limited-v0-5-2",
) -> LangChainProjectionResult:
    """Project the pinned bundle under the limited profile or refuse."""
    bundle_root = Path(bundle_root)
    _verify_identity(bundle_root)
    lines = _load_lines(bundle_root)

    diagnostics: List[Dict[str, Any]] = []
    excluded = _enforce_opaque_exclusion(lines, diagnostics)

    request_call = _extract_tool_request(lines, diagnostics)
    tool_end_kwargs = _extract_tool_end(lines, diagnostics)
    if request_call is None or tool_end_kwargs is None:
        return LangChainProjectionResult(
            document=None, diagnostics=diagnostics, opaque_exclusions=excluded
        )
    if not _check_correlation(request_call, tool_end_kwargs, lines, diagnostics):
        return LangChainProjectionResult(
            document=None, diagnostics=diagnostics, opaque_exclusions=excluded
        )

    # Conflicting-terminal guard: a second differing on_tool_end for the
    # same tool_call_id anywhere in the structured subset refuses the call.
    same_call_results = []
    for number, event in enumerate(lines, start=1):
        if number in excluded or event.get("event") != "on_tool_end":
            continue
        kwargs = (event.get("data", {}).get("output", {}) or {}).get("kwargs", {}) or {}
        if kwargs.get("tool_call_id") == profile.TOOL_CALL_ID:
            same_call_results.append((number, kwargs))
    distinct = {
        json.dumps(kwargs, sort_keys=True) for _, kwargs in same_call_results
    }
    if len(distinct) > 1:
        diagnostics.append(
            {
                "code": DIAG_CONFLICTING_RESULT,
                "detail": "multiple conflicting terminal results for one tool call",
            }
        )
        return LangChainProjectionResult(
            document=None, diagnostics=diagnostics, opaque_exclusions=excluded
        )

    identity_unknown = {
        "source": "unknown",
        "subject_ref": None,
        "provenance_ref": None,
        "reason": profile.IDENTITY_UNKNOWN_REASON,
    }
    args = request_call["args"]
    digest = {
        "algorithm": "sha256",
        "representation": profile.ARGS_REPRESENTATION,
        "value": canonical_args_digest(args),
    }

    lineage = {
        "profile": profile.PROFILE_ID,
        "source_commit": profile.SOURCE_COMMIT,
        "opaque_exclusions": excluded,
        "fields": {
            "request": {
                "rule": "L21 on_chat_model_end AIMessage kwargs.tool_calls[0] (structured, fully typed)",
                "source_line": profile.L_MODEL_TOOL_REQUEST,
            },
            "requested_arguments": {
                "rule": f"L21 tool_call.args → sha256 canonical JSON ({profile.ARGS_REPRESENTATION})",
                "source_line": profile.L_MODEL_TOOL_REQUEST,
                "digest": digest["value"],
            },
            "correlation": {
                "rule": "native tool_call_id + run_id + parent_ids chain (never name/timestamp/args equality)",
                "source_lines": [profile.L_MODEL_TOOL_REQUEST, profile.L_TOOL_START, profile.L_TOOL_END],
            },
            "completion": {
                "rule": "typed on_tool_end (L27) with matching tool_call_id — observed terminal only",
                "source_line": profile.L_TOOL_END,
                "corroborating": [profile.L_TOOLS_NODE_START, profile.L_TOOLS_NODE_END],
            },
            "outcome": {
                "rule": "ToolMessage status=success content=42 → source-confirmed successful return (no side-effect claim)",
                "source_line": profile.L_TOOL_END,
            },
        },
    }

    # P1-2 fail closed: the limited profile audited exactly one terminal
    # shape -- ToolMessage status="success" content="42". Anything else
    # (missing/unknown/unexpected status, unexpected content, changed
    # result shape) refuses the projection; no failure mapping exists in
    # this profile and none is invented.
    if (
        tool_end_kwargs.get("status") != "success"
        or tool_end_kwargs.get("content") != "42"
    ):
        diagnostics.append(
            {
                "code": DIAG_STRUCTURE_MISMATCH,
                "line": profile.L_TOOL_END,
                "detail": (
                    "terminal result does not match the audited success "
                    f"shape (status={tool_end_kwargs.get('status')!r}, "
                    f"content={tool_end_kwargs.get('content')!r}); the "
                    "limited profile has no failure mapping and refuses "
                    "instead of guessing"
                ),
            }
        )
        return LangChainProjectionResult(
            document=None, diagnostics=diagnostics, opaque_exclusions=excluded
        )

    def build_document() -> Dict[str, Any]:
        return {
            "schema_version": SCHEMA_VERSION,
            "evidence_id": (
                f"{projection_id}:{profile.RAW_SHA256[:12]}:"
                f"{hashlib.sha256(profile.TOOL_CALL_ID.encode()).hexdigest()[:12]}"
            ),
            "producer_ref": profile.PRODUCER_REF,
            "profile_ref": profile.PROFILE_REF,
            "recorded_at": recorded_at,
            "previous_evidence_ref": None,
            "request": _known(
                {
                    "request_id": None,  # no native request id in this format
                    "tool_call_id": profile.TOOL_CALL_ID,
                    "attempt_ref": None,  # no native attempt id: never fabricated
                    "runtime_ref": profile.RUNTIME_REF,
                    "action_name": request_call["name"],
                    "action_ref": None,  # display name only; no versioned action ref
                    "identity_provenance": identity_unknown,
                },
                _line_ref(profile.L_MODEL_TOOL_REQUEST),
            ),
            "decision": _unknown(profile.NO_DECISION_REASON),
            "authorization": _unknown(profile.NO_AUTHORIZATION_REASON),
            "argument_binding": {
                # structured model tool-request arguments, digested
                "requested": _known(
                    {
                        "snapshot_ref": _line_ref(profile.L_MODEL_TOOL_REQUEST),
                        "tool_ref": None,
                        "scope_ref": None,
                        "digest": digest,
                    },
                    _line_ref(profile.L_MODEL_TOOL_REQUEST),
                ),
                # no post-decision snapshot exists in the limited subset
                "effective": _unknown("no_effective_snapshot_in_limited_profile"),
                # on_tool_start input existing ≠ observed entry args; the
                # limited profile records no physical-entry instrumentation
                "executed": _unknown("no_physical_entry_instrumentation"),
                "scope": _unknown("langchain_native_stream_records_no_scope"),
                "authorization_match": _unknown(
                    "no_positive_authorization_to_compare"
                ),
            },
            "execution": {
                "release": _unknown("no_release_receipt_in_limited_profile"),
                "dispatch": _unknown("no_dispatch_receipt_in_limited_profile"),
                # on_tool_start is the agent-graph tool node, NOT the
                # physical function entry: never upgraded to start.
                "start": _unknown("on_tool_start_is_not_physical_entry"),
                "completion": _known(
                    {"occurred": True, "at": None},
                    _line_ref(profile.L_TOOL_END),
                ),
            },
            "outcome": _known(
                {
                    "status": "success",
                    "reason": None,
                    "result_ref": _line_ref(profile.L_TOOL_END),
                },
                _line_ref(profile.L_TOOL_END),
            ),
        }

    document = validate_evidence_document(build_document())
    return LangChainProjectionResult(
        document=document,
        diagnostics=diagnostics,
        lineage=lineage,
        opaque_exclusions=excluded,
    )
