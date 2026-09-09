"""Local artifact verification: re-derive everything from the source bytes.

Verify NEVER trusts self-reported artifact fields alone. It:

1. parses the artifact STRICTLY (duplicate keys / NaN / invalid UTF-8 / lone
   surrogates / non-object / missing final LF refused) and enforces
   canonical-input identity (file bytes == canonical serialization + LF);
2. checks artifact_digest.algorithm/canonicalization/value against a
   recomputation over the self-excluded canonical envelope;
3. re-reads the source bundle's exact bytes and re-checks the source digest
   binding;
4. re-runs the FULL offline validation and Evidence mapping with the frozen
   profile, rebuilds the expected artifact envelope, and compares the whole
   shareable semantic envelope deterministically
   (ARTIFACT_SEMANTIC_REPLAY_BINDING=true).

Only genuinely per-run metadata is excluded from the comparison:
validation_started_at / validation_completed_at / duration_ms /
validation_id (tool-run clock facts that cannot be re-derived from a
replay), artifact_digest (self-referential), and evidence.recorded_at —
the Evidence v0.2 schema defines recorded_at as "time this record was
generated", so every replay mints a new one; pilot design section 11
requires replay comparison to exclude clock-type run metadata. Each
exclusion is covered by a dedicated test.

Outcomes: VERIFIED or REJECTED with machine-readable reasons. No network,
no source mutation, no artifact rewrite.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from . import langchain_profile as profile
from .artifact import (
    ARTIFACT_DIGEST_KEY,
    ArtifactFormatError,
    build_envelope,
    canonical_bytes,
    compute_artifact_digest,
    parse_artifact_bytes,
)
from .source_loader import SourceRejected, load_source
from .validator import validate_source

VERIFIED = "VERIFIED"
REJECTED = "REJECTED"

RUN_METADATA_KEYS = (
    "validation_started_at",
    "validation_completed_at",
    "duration_ms",
    "validation_id",
)

DIGEST_ALGORITHM = "sha256"


@dataclass
class VerifyOutcome:
    status: str
    reasons: List[str] = field(default_factory=list)
    artifact_digest: Optional[str] = None


def _reject(reason: str) -> VerifyOutcome:
    return VerifyOutcome(status=REJECTED, reasons=[reason])


def _semantic(envelope: Dict[str, Any]) -> Dict[str, Any]:
    """Whole-envelope semantic projection: everything except the explicitly
    allowed per-run metadata and the self-referential digest."""
    out = {
        key: value
        for key, value in envelope.items()
        if key not in RUN_METADATA_KEYS and key != ARTIFACT_DIGEST_KEY
    }
    evidence = out.get("evidence")
    if isinstance(evidence, dict) and "recorded_at" in evidence:
        out["evidence"] = {**evidence, "recorded_at": "<run-metadata>"}
    return out


def verify_artifact(artifact_path: Path, source_dir: Path) -> VerifyOutcome:
    artifact_path = Path(artifact_path)

    # --- strict parse + canonical input enforcement ---
    try:
        artifact = parse_artifact_bytes(artifact_path.read_bytes())
    except OSError:
        return _reject("artifact file not found or unreadable")
    except ArtifactFormatError as exc:
        return _reject(f"artifact format refused: {exc}")

    # --- digest field checks ---
    digest_field = artifact.get(ARTIFACT_DIGEST_KEY)
    if not isinstance(digest_field, dict):
        return _reject("artifact carries no artifact_digest object")
    if digest_field.get("algorithm") != DIGEST_ALGORITHM:
        return _reject(f"artifact_digest.algorithm must be {DIGEST_ALGORITHM!r}")
    if digest_field.get("canonicalization") != profile.ARTIFACT_CANONICALIZATION:
        return _reject(
            f"artifact_digest.canonicalization must be {profile.ARTIFACT_CANONICALIZATION!r}"
        )
    recomputed = compute_artifact_digest(artifact)
    if digest_field.get("value") != recomputed:
        return _reject("artifact_digest mismatch: recomputed digest does not match the stored value")

    # --- frozen profile identity ---
    if artifact.get("profile_id") != profile.PROFILE_ID or artifact.get("profile_version") != profile.PROFILE_VERSION:
        return _reject("artifact profile identity does not match the frozen profile")

    # --- source binding (value checked first for a precise reason; the rest
    # of the source_digest record is bound by the whole-envelope replay) ---
    try:
        loaded = load_source(source_dir)
    except SourceRejected as exc:
        return _reject(f"source unusable: {exc}")
    source_binding = artifact.get("source_digest")
    if not isinstance(source_binding, dict) or source_binding.get("value") != loaded.raw_digest:
        return _reject(
            "source binding failure: artifact source_digest does not match the recomputed digest of the supplied source"
        )

    # --- full semantic replay ---
    fresh = validate_source(loaded)
    expected = build_envelope(
        fresh,
        started_at="replay",
        completed_at="replay",
        duration_ms=0,
        validation_id="replay",
    )
    if canonical_bytes(_semantic(artifact)) != canonical_bytes(_semantic(expected)):
        return _reject(
            "semantic envelope mismatch: the replayed validation does not reproduce the stored artifact "
            "(all shareable fields are bound: result, capability_assessment, claims, claim_checks, "
            "diagnostics, exclusions, evidence_validation, source_digest record, evidence, lineage, "
            "privacy, identity versions)"
        )

    return VerifyOutcome(status=VERIFIED, artifact_digest=recomputed, reasons=[])
