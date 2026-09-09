"""Frozen Evidence v0.2 mapping for the external LangChain profile.

Implements exactly the mapping table frozen by
kerniq_langchain_external_profile_v0_6_2_freeze.md section 6 and the
qualification mapping matrix (section 14). The resulting document is passed
through the EXISTING frozen conformance validator
(kerniq_evidence_conformance.validate_evidence_document) — semantics are
never copied or reinterpreted here.

Truth boundary enforced by construction:
- request is a RUNTIME_TOOL_REQUEST_OBSERVATION from on_tool_start — never
  MODEL_REQUEST, never EXECUTED_ARGS;
- tool_call_id comes only from the matched typed terminal;
- attempt_ref is a namespaced runtime-invocation reference, never a
  fabricated model request or physical attempt ordinal;
- decision / authorization / effective / executed / scope / match /
  release / dispatch / start stay unknown with frozen reasons;
- completion is runtime settlement (occurred=true, at=null) — no physical
  entry is claimed;
- outcome is a source-reported successful return — no side-effect claim.
"""

from __future__ import annotations

import hashlib
from typing import Any, Dict

from kerniq_evidence_conformance import SCHEMA_VERSION, validate_evidence_document

from . import langchain_profile as profile
from .source_loader import LoadedSource
from .validator import MatchedIdentity


def _unknown(reason: str) -> Dict[str, Any]:
    return {"status": "unknown", "value": None, "source_ref": None, "reason": reason}


def _known(value: Dict[str, Any], source_ref: str) -> Dict[str, Any]:
    return {"status": "known", "value": value, "source_ref": source_ref, "reason": None}


def attempt_ref(source_digest: str, matched: MatchedIdentity) -> str:
    """Namespaced, locally-resolvable native invocation reference (freeze
    section 6: encodes the original identity components unambiguously,
    TOGETHER WITH the exact full source digest; resolves locally; executes
    nothing; contains no path and no retry ordinal)."""
    return (
        f"langchain-tool-run:{source_digest}:"
        f"{matched.root_run_id}:{matched.tool_run_id}"
    )


def runtime_ref(loaded: LoadedSource) -> str:
    """Reference to the declared source runtime provenance (freeze section 6:
    derived, not an integrity attestation; binds the exact full digest)."""
    return (
        "langchain-archive:"
        f"{loaded.raw_digest}:"
        "producer=langchain@1.4.0+core@1.6.2+langgraph@1.2.11+prebuilt@1.1.0"
    )


def build_evidence_document(loaded: LoadedSource, matched: MatchedIdentity) -> Dict[str, Any]:
    """Build the Evidence v0.2 document and validate it with the FROZEN
    conformance validator. Raises on any conformance violation; never repairs
    or downgrades the document to pass."""
    start_ref = loaded.archive_ref(matched.tool_start_line, "/data/input")
    terminal_ref = loaded.archive_ref(matched.tool_end_line, "/data/output/kwargs")
    identity_unknown = {
        "source": "unknown",
        "subject_ref": None,
        "provenance_ref": None,
        "reason": profile.REASON_IDENTITY_UNKNOWN,
    }

    document: Dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        # evidence_id binds the exact FULL source digest (opaque producer-ns
        # identity); the trailing hash is only a tool-run disambiguation salt
        # for producer-namespace uniqueness — it is not a source locator.
        "evidence_id": (
            "kerniq-external-validator:"
            f"{loaded.raw_digest}:"
            f"{hashlib.sha256(matched.tool_run_id.encode('utf-8')).hexdigest()[:12]}"
        ),
        "producer_ref": profile.PRODUCER_REF,
        "profile_ref": profile.PROFILE_REF,
        "recorded_at": _recorded_at(),
        "previous_evidence_ref": None,
        "request": _known(
            {
                # No native request id exists in this event stream; never
                # fabricated from line numbers or run ids (freeze section 6).
                "request_id": None,
                # Source-confirmed: the exact native id in the matched typed
                # terminal; terminal origin recorded in lineage below.
                "tool_call_id": matched.terminal_kwargs["tool_call_id"],
                "attempt_ref": attempt_ref(loaded.raw_digest, matched),
                "runtime_ref": runtime_ref(loaded),
                "action_name": matched.tool_name,
                # Display name only; no executable identity is established.
                "action_ref": None,
                "identity_provenance": identity_unknown,
            },
            start_ref,
        ),
        "decision": _unknown(profile.REASON_NO_DECISION),
        "authorization": _unknown(profile.REASON_NO_AUTHORIZATION),
        "argument_binding": {
            # Snapshot reference to start.data.input under
            # RUNTIME_TOOL_REQUEST_OBSERVATION; digest=null is permitted by
            # the frozen profile (no new argument digest scheme).
            "requested": _known(
                {
                    "snapshot_ref": start_ref,
                    "tool_ref": None,
                    "scope_ref": None,
                    "digest": None,
                },
                start_ref,
            ),
            "effective": _unknown(profile.REASON_NO_EFFECTIVE_ARGS),
            "executed": _unknown(profile.REASON_NO_EXECUTED_ARGS),
            "scope": _unknown(profile.REASON_NO_SCOPE),
            "authorization_match": _unknown(profile.REASON_NO_AUTHORIZATION_MATCH),
        },
        "execution": {
            "release": _unknown(profile.REASON_NO_RELEASE),
            "dispatch": _unknown(profile.REASON_NO_DISPATCH),
            # on_tool_start is a runtime tool-request observation BEFORE
            # validation/body — never a physical entry (freeze check 7).
            "start": _unknown(profile.REASON_NO_PHYSICAL_START),
            "completion": _known(
                {"occurred": True, "at": None},
                terminal_ref,
            ),
        },
        "outcome": _known(
            {
                # Source-reported successful return only; no external
                # business success, no side effect, no authorization.
                "status": "success",
                "reason": None,
                "result_ref": terminal_ref,
            },
            terminal_ref,
        ),
    }
    return validate_evidence_document(document)


def build_lineage(loaded: LoadedSource, matched: MatchedIdentity) -> Dict[str, Any]:
    """Explicit derivation rules and source locators for every known/derived
    field (freeze section 6: derivation rules belong in lineage/diagnostics,
    not in newly invented Evidence enums). Lives OUTSIDE the Evidence envelope."""
    return {
        "request_semantics": profile.REQUEST_SEMANTICS,
        "tool_call_id_origin": {
            "rule": "terminal kwargs.tool_call_id; retrospective use only, never a model-intent proof",
            "source_ref": loaded.archive_ref(matched.tool_end_line, "/data/output/kwargs/tool_call_id"),
        },
        "attempt_ref_rule": (
            "namespaced native root/tool invocation reference; "
            "no retry ordinal, no model request, no physical attempt"
        ),
        "requested_arguments": {
            "rule": "start.data.input snapshot under RUNTIME_TOOL_REQUEST_OBSERVATION; digest=null permitted",
            "source_ref": loaded.archive_ref(matched.tool_start_line, "/data/input"),
        },
        "completion": {
            "rule": "unique matching typed success terminal; runtime settlement only, at=null",
            "source_ref": loaded.archive_ref(matched.tool_end_line, "/data/output/kwargs/status"),
        },
        "outcome": {
            "rule": "source-reported successful return; no side-effect or business-success claim",
            "source_ref": loaded.archive_ref(matched.tool_end_line, "/data/output/kwargs"),
        },
        "correlation_key": {
            "source_digest": loaded.raw_digest,
            "root_run_id": matched.root_run_id,
            "tool_run_id": matched.tool_run_id,
        },
        "level_b_model_correlation": "false",
        "capability_classification": profile.CAPABILITY_ASSESSMENT,
    }


def _recorded_at() -> str:
    import datetime

    return (
        datetime.datetime.now(datetime.timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )
