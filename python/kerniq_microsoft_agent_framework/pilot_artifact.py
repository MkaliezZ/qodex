"""External pilot artifact: construction, privacy scan, digest, verification.

The artifact is a NEW pilot result envelope (EXTERNAL_PILOT_ARTIFACT_VERSION
0.1). It is NOT a new Evidence schema: the embedded per-case documents are
existing Evidence v0.2 projections produced by kerniq_microsoft_agent_framework
.evidence and re-validated here by the frozen conformance validator.

Canonicalization: kerniq-json-canonical-v1 (same frozen representation as the
external LangChain validator): UTF-8 bytes of
json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False);
the artifact tree contains only integers as numeric values, so no float
normalization case exists. artifact_digest excludes itself and the written
file is the canonical serialization plus a final LF.

Privacy: no API keys, no environment dumps, no source code, no raw prompts,
model requests/responses, tool argument values or tool result bodies. Only
digests/enums/IDs. A pre-write privacy scan refuses on known secret patterns
and on the literal process credential value; verification re-runs the scan.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .qualification import AGENTFUSE_REF, MAF_HASHES, MAF_VERSION, PROFILE

ARTIFACT_VERSION = "0.1"
CANONICALIZATION = "kerniq-json-canonical-v1"
DIGEST_KEY = "artifact_digest"
PROVIDER = "deepseek-official"
REQUESTED_MODEL = "deepseek-v4-flash"

# The single frozen version truth lives in qualification.qualify_framework's
# pins; MAF_VERSION is imported from there. The three non-core pins are not
# exported as module constants (qualification.py is frozen this round), so
# they are mirrored here and locked to the qualification source by a parity
# test that fails if either side drifts.
EXPECTED_PACKAGE_VERSIONS = {
    "agent-framework-core": MAF_VERSION,
    "agent-framework-openai": "1.14.2",
    "openai": "3.11.0",
    "pydantic": "2.13.5",
}

REQUIRED_TOP_LEVEL = (
    "artifact_version", "created_at", "kerniq_commit", "profile",
    "package_versions", "qualified_source_sha256", "agentfuse_ref",
    "provider", "requested_model", "tool", "block_case", "allow_case",
    DIGEST_KEY,
)

CASE_REQUIRED = (
    "status", "real_model_tool_call", "call_id", "occurrence_id",
    "decision", "effective_args_digest", "release_occurred",
    "dispatch_occurred", "start_occurred", "bound_handler_entry_count",
    "pilot_entry_marker_exists", "outcome",
)


class ArtifactRejected(ValueError):
    """Stable machine-readable refusal reason."""


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def compute_digest(envelope: Dict[str, Any]) -> str:
    body = {k: v for k, v in envelope.items() if k != DIGEST_KEY}
    return hashlib.sha256(canonical_bytes(body)).hexdigest()


# --- Privacy scan ---------------------------------------------------------------

_SECRET_PATTERNS: Tuple[Tuple[str, re.Pattern[str]], ...] = (
    ("openai_style_key", re.compile(r"sk-[A-Za-z0-9_\-]{20,}")),
    ("bearer_token", re.compile(r"Bearer\s+[A-Za-z0-9._\-]{20,}")),
    ("aws_access_key", re.compile(r"AKIA[0-9A-Z]{16}")),
    ("github_token", re.compile(r"gh[pousr]_[A-Za-z0-9]{30,}")),
    ("private_key_block", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
)


def privacy_scan(text: str, *, environment_values: Optional[List[str]] = None) -> Optional[str]:
    """Return a refusal reason if a known secret pattern (or the literal
    process credential) appears in the text."""
    for label, pattern in _SECRET_PATTERNS:
        if pattern.search(text):
            return "SUSPECTED_SECRET_" + label.upper()
    for value in environment_values or ():
        if value and len(value) >= 8 and value in text:
            return "PROCESS_CREDENTIAL_VALUE_PRESENT"
    return None


# --- Construction -----------------------------------------------------------------


def build_envelope(
    *,
    created_at: str,
    kerniq_commit: str,
    package_versions: Dict[str, str],
    tool_import_identifier: str,
    block_case: Dict[str, Any],
    allow_case: Dict[str, Any],
    self_reported_label: Optional[str],
) -> Dict[str, Any]:
    envelope: Dict[str, Any] = {
        "artifact_version": ARTIFACT_VERSION,
        "created_at": created_at,
        "kerniq_commit": kerniq_commit,
        "profile": PROFILE,
        "package_versions": dict(package_versions),
        "qualified_source_sha256": dict(MAF_HASHES),
        "agentfuse_ref": AGENTFUSE_REF,
        "provider": PROVIDER,
        "requested_model": REQUESTED_MODEL,
        "tool": {
            "import_identifier": tool_import_identifier,
            # Binds the declared tool identity; the tool's SOURCE CODE is never stored.
            "identifier_digest": "sha256:" + hashlib.sha256(tool_import_identifier.encode("utf-8")).hexdigest(),
        },
        "outside_operator_claim": "self_reported",
        "self_reported_label": self_reported_label,
        "model_request_to_tool_run_correlation_proven": False,
        "block_case": block_case,
        "allow_case": allow_case,
    }
    envelope[DIGEST_KEY] = {
        "algorithm": "sha256",
        "canonicalization": CANONICALIZATION,
        "value": compute_digest(envelope),
    }
    return envelope


def write_artifact(envelope: Dict[str, Any], output: Path) -> bytes:
    text = canonical_bytes(envelope).decode("utf-8")
    reason = privacy_scan(
        text,
        environment_values=[
            v for k, v in os.environ.items()
            if "API_KEY" in k or "TOKEN" in k or "SECRET" in k
        ],
    )
    if reason:
        raise ArtifactRejected("REFUSE_ARTIFACT_WRITE:" + reason)
    data = canonical_bytes(envelope) + b"\n"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(data)
    return data


# --- Verification -------------------------------------------------------------------


def parse_artifact_bytes(raw: bytes) -> Dict[str, Any]:
    def _reject_duplicate_keys(pairs):
        seen = set()
        for key, _ in pairs:
            if key in seen:
                raise ArtifactRejected("DUPLICATE_JSON_KEY")
            seen.add(key)
        return dict(pairs)

    def _reject_constant(name):
        raise ArtifactRejected("NON_FINITE_JSON_CONSTANT")

    if not raw.endswith(b"\n"):
        raise ArtifactRejected("MISSING_FINAL_LF")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise ArtifactRejected("INVALID_UTF8")
    try:
        value = json.loads(text, object_pairs_hook=_reject_duplicate_keys, parse_constant=_reject_constant)
    except ArtifactRejected:
        raise
    except ValueError:
        raise ArtifactRejected("MALFORMED_JSON")
    if not isinstance(value, dict):
        raise ArtifactRejected("NOT_AN_OBJECT")
    if raw != canonical_bytes(value) + b"\n":
        raise ArtifactRejected("NON_CANONICAL_BYTES")
    return value




def parse_artifact_file(path: Path) -> Dict[str, Any]:
    return parse_artifact_bytes(Path(path).read_bytes())


def verify_artifact_file(path: Path) -> Tuple[str, Optional[str]]:
    """Verify an artifact file.

    Returns exactly one of:
      ("VERIFIED", None)     - canonical, internally consistent, matches the
                               frozen pilot qualification metadata, and BOTH
                               BLOCK and a successfully-run ALLOW satisfy the
                               pilot invariants (a complete pilot artifact);
      ("INCOMPLETE", reason) - structurally valid partial artifact (e.g.
                               BLOCK-only); NOT a complete pilot result;
      ("REJECTED", reason)   - tampered/malformed/inconsistent artifact.

    VERIFIED means canonical integrity and invariant consistency only. It
    does NOT cryptographically prove who produced the artifact, does not
    attest that the reported runtime events occurred, and does not establish
    operator identity or external validation.
    """
    try:
        return _verify(path)
    except ArtifactRejected as exc:
        return "REJECTED", str(exc)
    except OSError:
        return "REJECTED", "ARTIFACT_UNREADABLE"


def _verify(path: Path) -> Tuple[str, Optional[str]]:
    artifact = parse_artifact_file(path)

    digest_field = artifact.get(DIGEST_KEY)
    if not isinstance(digest_field, dict):
        raise ArtifactRejected("MISSING_ARTIFACT_DIGEST")
    if digest_field.get("algorithm") != "sha256":
        raise ArtifactRejected("UNSUPPORTED_DIGEST_ALGORITHM")
    if digest_field.get("canonicalization") != CANONICALIZATION:
        raise ArtifactRejected("UNSUPPORTED_DIGEST_CANONICALIZATION")
    if digest_field.get("value") != compute_digest(artifact):
        raise ArtifactRejected("ARTIFACT_DIGEST_MISMATCH")

    if artifact.get("artifact_version") != ARTIFACT_VERSION:
        raise ArtifactRejected("UNSUPPORTED_ARTIFACT_VERSION")
    for field in REQUIRED_TOP_LEVEL:
        if field not in artifact:
            raise ArtifactRejected("MISSING_REQUIRED_FIELD:" + field)

    # --- exact frozen qualification metadata (single truth: qualification) ---
    if artifact.get("profile") != PROFILE:
        raise ArtifactRejected("QUALIFICATION_PROFILE_MISMATCH")
    if artifact.get("agentfuse_ref") != AGENTFUSE_REF:
        raise ArtifactRejected("QUALIFICATION_AGENTFUSE_REF_MISMATCH")
    if artifact.get("qualified_source_sha256") != MAF_HASHES:
        raise ArtifactRejected("QUALIFICATION_HASHES_MISMATCH")
    versions = artifact.get("package_versions")
    if not isinstance(versions, dict):
        raise ArtifactRejected("PACKAGE_VERSIONS_MISSING")
    for package, expected in EXPECTED_PACKAGE_VERSIONS.items():
        if versions.get(package) != expected:
            raise ArtifactRejected("QUALIFICATION_PACKAGE_VERSION_MISMATCH:" + package)
    if artifact.get("provider") != PROVIDER:
        raise ArtifactRejected("PROVIDER_MISMATCH")
    if artifact.get("requested_model") != REQUESTED_MODEL:
        raise ArtifactRejected("REQUESTED_MODEL_MISMATCH")

    tool = artifact.get("tool")
    if not isinstance(tool, dict):
        raise ArtifactRejected("TOOL_METADATA_MISSING")
    identifier = tool.get("import_identifier")
    if not isinstance(identifier, str) or not identifier:
        raise ArtifactRejected("TOOL_IDENTIFIER_MISSING")
    expected_digest = "sha256:" + hashlib.sha256(identifier.encode("utf-8")).hexdigest()
    if tool.get("identifier_digest") != expected_digest:
        raise ArtifactRejected("TOOL_IDENTIFIER_DIGEST_MISMATCH")

    # operator identity is self-reported only; never trust it as proof
    if artifact.get("outside_operator_claim") not in (None, "self_reported", "unknown"):
        raise ArtifactRejected("OPERATOR_CLAIM_OVERSTATED")

    _verify_case(artifact["block_case"], expect_block=True)
    _bind_case_to_evidence(artifact["block_case"], expect_block=True)

    allow_case = artifact["allow_case"]
    if allow_case.get("status") == "not_run":
        if allow_case.get("reason") != "allow_acknowledgement_missing":
            raise ArtifactRejected("INVALID_NOT_RUN_REASON")
        # structurally valid partial artifact: not a complete pilot result
        return "INCOMPLETE", "ALLOW_CASE_NOT_RUN"

    _verify_case(allow_case, expect_block=False)
    _bind_case_to_evidence(allow_case, expect_block=False)

    # decision/outcome separation and Evidence conformance for ran cases
    from kerniq_evidence_conformance import validate_evidence_document

    for case in (artifact["block_case"], allow_case):
        document = case["evidence_v0_2"]
        try:
            validate_evidence_document(document)
        except Exception:
            raise ArtifactRejected("EVIDENCE_DOCUMENT_INVALID")
        decision = document["decision"]["value"]
        outcome = document["outcome"]["value"]
        if expect_separation_violation(decision, outcome):
            raise ArtifactRejected("DECISION_OUTCOME_CONFLATION")
        if document["authorization"]["status"] != "unknown":
            raise ArtifactRejected("AUTHORIZATION_OVERSTATED")

    # privacy re-scan over the full artifact text
    reason = privacy_scan(path.read_bytes().decode("utf-8", errors="replace"))
    if reason:
        raise ArtifactRejected("PRIVACY_SCAN_FAILED:" + reason)
    return "VERIFIED", None


def expect_separation_violation(decision: Dict[str, Any], outcome: Dict[str, Any]) -> bool:
    """A policy BLOCK must never be encoded as an execution failure, and an
    allow+failure must never be rewritten as a block/not-executed."""
    action = decision.get("action")
    status = outcome.get("status")
    if action == "block" and status not in ("not_executed",):
        return True
    if action == "allow" and status not in ("success", "failure", "cancelled", "unknown"):
        return True
    return False


def _bind_case_to_evidence(case: Dict[str, Any], *, expect_block: bool) -> None:
    """Pilot-envelope-level cross-field binding between the case record and
    its embedded Evidence v0.2 document. This is the pilot verifier's own
    semantic responsibility, independent of schema-level validation."""
    document = case.get("evidence_v0_2")
    if not isinstance(document, dict):
        raise ArtifactRejected("EVIDENCE_DOCUMENT_MISSING")
    evidence_decision = document["decision"]["value"]["action"]
    evidence_outcome = document["outcome"]["value"]["status"]
    if case.get("decision") != evidence_decision:
        raise ArtifactRejected("CASE_EVIDENCE_DECISION_MISMATCH")
    if case.get("outcome") != evidence_outcome:
        raise ArtifactRejected("CASE_EVIDENCE_OUTCOME_MISMATCH")

    binding = document["argument_binding"]
    effective_digest = binding["effective"]["value"]["digest"]["value"]
    if case.get("effective_args_digest") != effective_digest:
        raise ArtifactRejected("CASE_EVIDENCE_EFFECTIVE_DIGEST_MISMATCH")
    executed = binding["executed"]
    if expect_block:
        if executed["status"] != "not_applicable":
            raise ArtifactRejected("CASE_EVIDENCE_EXECUTED_STATUS_MISMATCH")
    else:
        if executed["status"] != "known":
            raise ArtifactRejected("CASE_EVIDENCE_EXECUTED_STATUS_MISMATCH")
        if case.get("executed_args_digest") != executed["value"]["digest"]["value"]:
            raise ArtifactRejected("CASE_EVIDENCE_EXECUTED_DIGEST_MISMATCH")

    execution = document["execution"]
    for stage in ("release", "dispatch", "start"):
        occurred = execution[stage]["value"]["occurred"]
        if occurred != bool(case.get(stage + "_occurred")):
            raise ArtifactRejected("CASE_EVIDENCE_EXECUTION_STAGE_MISMATCH")
        if occurred == expect_block:
            # BLOCK must have none of these stages; ALLOW must have all three
            raise ArtifactRejected("CASE_EVIDENCE_EXECUTION_STAGE_MISMATCH")


def _verify_case(case: Dict[str, Any], *, expect_block: bool) -> None:
    if not isinstance(case, dict):
        raise ArtifactRejected("CASE_NOT_AN_OBJECT")
    for field in CASE_REQUIRED:
        if field not in case:
            raise ArtifactRejected("MISSING_CASE_FIELD:" + field)
    if case.get("real_model_tool_call") is not True:
        raise ArtifactRejected("REAL_MODEL_TOOL_CALL_NOT_ASSERTED")
    if not isinstance(case.get("call_id"), str) or not case["call_id"]:
        raise ArtifactRejected("NATIVE_CALL_ID_MISSING")
    if not isinstance(case.get("occurrence_id"), str) or not case["occurrence_id"]:
        raise ArtifactRejected("OCCURRENCE_ID_MISSING")
    if not _is_sha256(case.get("effective_args_digest")):
        raise ArtifactRejected("EFFECTIVE_DIGEST_INVALID")
    release = bool(case.get("release_occurred"))
    dispatch = bool(case.get("dispatch_occurred"))
    start = bool(case.get("start_occurred"))
    entries = case.get("bound_handler_entry_count")
    marker = bool(case.get("pilot_entry_marker_exists"))
    decision = case.get("decision")
    outcome = case.get("outcome")

    if expect_block:
        if decision != "block":
            raise ArtifactRejected("BLOCK_CASE_DECISION_NOT_BLOCK")
        if release or dispatch or start:
            raise ArtifactRejected("BLOCK_CASE_EXECUTION_FLAGS_SET")
        if entries != 0:
            raise ArtifactRejected("BLOCK_CASE_ENTRY_COUNT_NOT_ZERO")
        if marker:
            raise ArtifactRejected("BLOCK_CASE_MARKER_PRESENT")
        if outcome != "not_executed":
            raise ArtifactRejected("BLOCK_CASE_OUTCOME_NOT_NOT_EXECUTED")
        if case.get("executed_args_digest") is not None:
            raise ArtifactRejected("BLOCK_CASE_EXECUTED_DIGEST_PRESENT")
    else:
        # A complete pilot requires a SUCCESSFUL ALLOW invocation: the real
        # backend raises on handler failure, and v0.1 does not claim complete
        # artifacts for failed user-tool runs.
        if decision != "allow":
            raise ArtifactRejected("ALLOW_CASE_DECISION_NOT_ALLOW")
        if not (release and dispatch and start):
            raise ArtifactRejected("ALLOW_CASE_EXECUTION_FLAGS_MISSING")
        if entries != 1:
            raise ArtifactRejected("ALLOW_CASE_ENTRY_COUNT_NOT_ONE")
        if not marker:
            raise ArtifactRejected("ALLOW_CASE_MARKER_MISSING")
        if outcome != "success":
            raise ArtifactRejected("ALLOW_OUTCOME_NOT_SUCCESS")
        if not _is_sha256(case.get("executed_args_digest")):
            raise ArtifactRejected("EXECUTED_DIGEST_INVALID")
        if case.get("executed_args_digest") != case.get("effective_args_digest"):
            raise ArtifactRejected("EFFECTIVE_EXECUTED_DIGEST_MISMATCH")
        if case.get("handler_return_status") != "SUCCESS":
            raise ArtifactRejected("HANDLER_STATUS_NOT_SUCCESS")


def _is_sha256(value: Any) -> bool:
    return isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value) is not None
