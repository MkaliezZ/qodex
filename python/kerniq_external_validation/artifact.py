"""external-validation-result artifact: canonical serialization and writer.

Implements the minimal artifact contract (pilot design sections 10-11 and
the v0.6.3 task brief). The artifact is a NEW pilot result envelope; it is
NOT an Evidence v0.2 document and is never fed to the core Evidence
validator. The embedded evidence document (when present) was already
validated by the frozen conformance validator during mapping.

Canonicalization frozen by this implementation proof
(ARTIFACT_CANONICALIZATION=kerniq-json-canonical-v1):
- UTF-8 bytes of json.dumps(value, sort_keys=True, separators=(",", ":"),
  ensure_ascii=False);
- object keys sorted by Unicode code point; no whitespace;
- the artifact tree is constrained to integers as its only numeric values,
  so no float normalization case exists;
- artifact_digest = SHA-256 over the canonical bytes of the envelope WITHOUT
  the artifact_digest field (self-exclusion), and the written file is the
  canonical serialization of the complete envelope, so the digest is
  byte-reproducible by any reader.

Privacy: the artifact carries no raw prompt, tool input/output payload
content, credentials, absolute paths or customer data. Locators are
namespaced digest references; diagnostics carry codes and positions only.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from . import langchain_profile as profile
from .diagnostics import Diagnostic, summarize
from .validator import ValidationOutcome

ARTIFACT_DIGEST_KEY = "artifact_digest"


def canonical_bytes(value: Any) -> bytes:
    """Deterministic serialization (kerniq-json-canonical-v1)."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def compute_artifact_digest(envelope: Dict[str, Any]) -> str:
    body = {key: value for key, value in envelope.items() if key != ARTIFACT_DIGEST_KEY}
    return sha256_hex(canonical_bytes(body))


def build_envelope(
    outcome: ValidationOutcome,
    *,
    started_at: str,
    completed_at: str,
    duration_ms: int,
    validation_id: str,
) -> Dict[str, Any]:
    """Assemble the result artifact from a validation outcome."""
    passed = outcome.result == "PASS" and outcome.evidence_document is not None
    envelope: Dict[str, Any] = {
        "pilot_version": profile.PILOT_VERSION,
        "artifact_version": profile.ARTIFACT_VERSION,
        "validator_version": profile.VALIDATOR_VERSION,
        "profile_id": profile.PROFILE_ID,
        "profile_version": profile.PROFILE_VERSION,
        "source_reference_type": "bundle_manifest",
        "source_digest": (
            {
                "algorithm": "sha256",
                "representation": profile.SOURCE_DIGEST_REPRESENTATION,
                "value": outcome.source_digest,
                "byte_length": outcome.source_byte_length,
            }
            if outcome.source_digest
            else None
        ),
        "result": outcome.result,
        "capability_assessment": profile.CAPABILITY_ASSESSMENT,
        "claims_proven": list(profile.CLAIMS_PROVEN) if passed else [],
        "claims_unknown": list(profile.CLAIMS_UNKNOWN),
        "claims_refused": list(profile.CLAIMS_REFUSED),
        "claim_checks": _claim_checks(outcome) if passed else [],
        "evidence_validation": (
            {
                "status": "pass",
                "schema_version": "kerniq.governance-evidence.v0.2",
                "validator": "kerniq_evidence_conformance (frozen)",
            }
            if passed
            else {"status": "not_run", "schema_version": None, "validator": "kerniq_evidence_conformance (frozen)"}
        ),
        "diagnostics": summarize(outcome.diagnostics),
        "exclusions": [
            {
                "line": line,
                "code": "OPAQUE_SOURCE_EXCLUDED",
                "reason": "nonessential opaque Command carrier; raw line retained; not used for known evidence",
            }
            for line in outcome.opaque_exclusions
        ],
        "evidence": outcome.evidence_document,
        "lineage": outcome.lineage,
        "validation_started_at": started_at,
        "validation_completed_at": completed_at,
        "duration_ms": max(0, int(duration_ms)),
        "validation_id": validation_id,
        "privacy": {
            "local_only": True,
            "contains_raw_payloads": False,
            "share_policy_version": "kerniq-external-validation-share-v1",
        },
    }
    envelope[ARTIFACT_DIGEST_KEY] = {
        "algorithm": "sha256",
        "canonicalization": profile.ARTIFACT_CANONICALIZATION,
        "value": compute_artifact_digest(envelope),
    }
    return envelope


def _claim_checks(outcome: ValidationOutcome) -> List[Dict[str, Any]]:
    assert outcome.lineage is not None and outcome.evidence_document is not None
    request = outcome.evidence_document["request"]["value"]
    checks = {
        "TOOL_REQUEST_OBSERVED": outcome.lineage["requested_arguments"]["source_ref"],
        "TOOL_CALL_ID_FROM_TERMINAL": outcome.lineage["tool_call_id_origin"]["source_ref"],
        "TOOL_ACTION_NAME": outcome.evidence_document["request"]["source_ref"],
        "TOOL_SUCCESSFUL_RETURN_SOURCE_REPORTED": outcome.lineage["outcome"]["source_ref"],
        "TOOL_RUN_LIFECYCLE_CORRELATION": (
            f"langchain-archive:{outcome.source_digest[:12]}"
            f"#root={outcome.lineage['correlation_key']['root_run_id']}"
            f"#tool={outcome.lineage['correlation_key']['tool_run_id']}"
        ),
        "RUNTIME_COMPLETION_OBSERVED": outcome.lineage["completion"]["source_ref"],
    }
    return [
        {"claim": claim, "source_ref": locator, "rule_id": profile.CLAIM_RULES[claim]}
        for claim, locator in checks.items()
        if claim in profile.CLAIM_RULES
    ]


def write_artifact(envelope: Dict[str, Any], output_path: Path) -> bytes:
    """Write the artifact as its own canonical bytes; returns what was written."""
    output_path = Path(output_path)
    data = canonical_bytes(envelope) + b"\n"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(data)
    return data
