"""Local artifact verification: re-derive everything from the source bytes.

Verify NEVER trusts self-reported artifact fields alone. It re-reads the
source bundle's exact bytes, recomputes the source digest, re-runs the full
offline validation and Evidence mapping with the frozen profile, and
compares the fresh derivation against the artifact (excluding run-metadata
such as timestamps and validation ids, per pilot design section 11).
It also recomputes the artifact digest over the canonical envelope with the
digest field excluded.

Outcomes: VERIFIED or REJECTED with machine-readable reasons. No network,
no source mutation, no artifact rewrite.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from . import langchain_profile as profile
from .artifact import ARTIFACT_DIGEST_KEY, canonical_bytes, compute_artifact_digest
from .source_loader import SourceRejected, load_source
from .validator import validate_source

VERIFIED = "VERIFIED"
REJECTED = "REJECTED"

# Artifact fields that legitimately vary between runs of the same input;
# replay comparison excludes exactly these (pilot design section 11).
_RUN_METADATA_KEYS = (
    "validation_started_at",
    "validation_completed_at",
    "duration_ms",
    "validation_id",
)


@dataclass
class VerifyOutcome:
    status: str
    reasons: List[str] = field(default_factory=list)
    artifact_digest: Optional[str] = None


def _reject(reason: str) -> VerifyOutcome:
    return VerifyOutcome(status=REJECTED, reasons=[reason])


def _parse_artifact(path: Path) -> VerifyOutcome:
    if not path.is_file():
        return _reject("artifact file not found")
    try:
        text = path.read_bytes().decode("utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        return _reject(f"artifact unreadable: {type(exc).__name__}")
    try:
        artifact = json.loads(text)
    except ValueError as exc:
        return _reject(f"artifact is not valid JSON: {type(exc).__name__}")
    if not isinstance(artifact, dict):
        return _reject("artifact is not a JSON object")
    if artifact.get(ARTIFACT_DIGEST_KEY) is None:
        return _reject("artifact carries no artifact_digest")
    expected = artifact[ARTIFACT_DIGEST_KEY].get("value")
    if not isinstance(expected, str):
        return _reject("artifact_digest.value is not a string")
    actual = compute_artifact_digest(artifact)
    if actual != expected:
        return _reject(
            "artifact_digest mismatch: recomputed digest does not match the stored value"
        )
    return VerifyOutcome(status=VERIFIED, artifact_digest=actual, reasons=[])


def verify_artifact(artifact_path: Path, source_dir: Path) -> VerifyOutcome:
    artifact_path = Path(artifact_path)
    parsed = _parse_artifact(artifact_path)
    if parsed.status == REJECTED:
        return parsed
    artifact = json.loads(artifact_path.read_bytes().decode("utf-8"))

    if artifact.get("profile_id") != profile.PROFILE_ID or artifact.get("profile_version") != profile.PROFILE_VERSION:
        return _reject("artifact profile identity does not match the frozen profile")

    try:
        loaded = load_source(source_dir)
    except SourceRejected as exc:
        return _reject(f"source unusable: {exc}")

    source_binding = artifact.get("source_digest") or {}
    if not isinstance(source_binding, dict) or source_binding.get("value") != loaded.raw_digest:
        return _reject(
            "source binding failure: artifact source_digest does not match the recomputed digest of the supplied source"
        )

    fresh = validate_source(loaded)

    if fresh.result != artifact.get("result"):
        return _reject(
            f"claim consistency failure: artifact result {artifact.get('result')!r} != replayed result {fresh.result!r}"
        )

    if fresh.evidence_document is not None:
        stored_evidence = artifact.get("evidence")
        if not isinstance(stored_evidence, dict):
            return _reject("artifact claims PASS but embeds no evidence document")
        a = _strip_run_metadata(stored_evidence)
        b = _strip_run_metadata(fresh.evidence_document)
        a.pop("recorded_at", None)
        b.pop("recorded_at", None)
        if canonical_bytes(a) != canonical_bytes(b):
            return _reject(
                "claim consistency failure: embedded evidence differs from the replayed evidence mapping"
            )
        if list(artifact.get("claims_proven") or []) != list(profile.CLAIMS_PROVEN):
            return _reject("claim consistency failure: claims_proven does not match the frozen taxonomy")
    else:
        if artifact.get("claims_proven"):
            return _reject("claim consistency failure: claims_proven non-empty while replay produced no evidence")

    if list(artifact.get("claims_refused") or []) != list(profile.CLAIMS_REFUSED):
        return _reject("claim consistency failure: claims_refused does not match the frozen taxonomy")

    digest = compute_artifact_digest(artifact)
    return VerifyOutcome(status=VERIFIED, artifact_digest=digest, reasons=[])


def _strip_run_metadata(value: Dict[str, Any]) -> Dict[str, Any]:
    return {key: item for key, item in value.items() if key not in _RUN_METADATA_KEYS}
