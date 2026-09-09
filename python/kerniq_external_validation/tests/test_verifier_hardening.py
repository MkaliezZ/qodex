"""Proof-closure hardening tests.

Two confirmed blockers:
1. ARTIFACT_SEMANTIC_REPLAY_BINDING — every shareable semantic field of the
   artifact is re-derived from the source bytes and compared; forging any
   bound field (even WITH a recomputed artifact_digest) is REJECTED.
2. ARTIFACT_CANONICAL_INPUT_ENFORCED — artifact files must parse strictly
   and be byte-identical to their canonical serialization (+final LF).
3. FULL_SOURCE_DIGEST_REFERENCES — all source-bound references carry the
   full 64-hex digest (SOURCE_REFERENCE_DIGEST_LENGTH=64).
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from kerniq_external_validation import langchain_profile as profile
from kerniq_external_validation.artifact import (
    ARTIFACT_DIGEST_KEY,
    canonical_bytes,
    compute_artifact_digest,
)
from kerniq_external_validation.cli import main
from kerniq_external_validation.tests.helpers import write_source
from kerniq_external_validation.verifier import REJECTED, VERIFIED, verify_artifact

HEX64 = re.compile(r"^[0-9a-f]{64}$")


@pytest.fixture()
def validated(tmp_path):
    src = write_source(tmp_path / "src")
    out = tmp_path / "result.json"
    assert main(["validate", "--source", str(src), "--output", str(out)]) == 0
    artifact = json.loads(out.read_text("utf-8"))
    return src, out, artifact


def _rewrite_canonical(out: Path, artifact: dict) -> None:
    out.write_bytes(canonical_bytes(artifact) + b"\n")


def _forged(validated, mutate):
    """Apply a mutation, recompute the artifact digest (attacker-friendly),
    rewrite canonically, and verify. The forged field must still be caught
    by the semantic replay binding."""
    src, out, artifact = validated
    mutate(artifact)
    artifact[ARTIFACT_DIGEST_KEY]["value"] = compute_artifact_digest(artifact)
    _rewrite_canonical(out, artifact)
    outcome = verify_artifact(out, src)
    assert outcome.status == REJECTED
    assert any("semantic envelope mismatch" in r for r in outcome.reasons)
    return outcome


# --- Semantic replay binding: forged WITH recomputed digest -------------------


def test_forged_capability_assessment_rejected(validated):
    def mutate(artifact):
        artifact["capability_assessment"] = "GOVERNED"

    _forged(validated, mutate)


def test_forged_claims_unknown_rejected(validated):
    def mutate(artifact):
        artifact["claims_unknown"] = []

    _forged(validated, mutate)


def test_forged_claim_checks_rejected(validated):
    def mutate(artifact):
        artifact["claim_checks"][0]["source_ref"] = "langchain-archive:deadbeef#L1"

    _forged(validated, mutate)


def test_forged_diagnostics_rejected(validated):
    def mutate(artifact):
        artifact["diagnostics"] = []

    _forged(validated, mutate)


def test_forged_exclusions_rejected(validated):
    def mutate(artifact):
        artifact["exclusions"] = [
            {"line": 3, "code": "OPAQUE_SOURCE_EXCLUDED", "reason": "hidden"}
        ]

    _forged(validated, mutate)


def test_forged_privacy_local_only_rejected(validated):
    def mutate(artifact):
        artifact["privacy"]["local_only"] = False

    _forged(validated, mutate)


def test_forged_validator_version_rejected(validated):
    def mutate(artifact):
        artifact["validator_version"] = "0.0.0-backdoor"

    _forged(validated, mutate)


def test_forged_source_digest_representation_rejected(validated):
    def mutate(artifact):
        artifact["source_digest"]["representation"] = "lenient-jsonl-v9"

    _forged(validated, mutate)


def test_forged_source_digest_byte_length_rejected(validated):
    def mutate(artifact):
        artifact["source_digest"]["byte_length"] = 1

    _forged(validated, mutate)


def test_forged_evidence_payload_rejected(validated):
    def mutate(artifact):
        artifact["evidence"]["outcome"]["value"]["status"] = "not_executed"

    _forged(validated, mutate)


def test_forged_result_downgrade_rejected(validated):
    # downgrading PASS to a refusal also differs from the replayed result
    def mutate(artifact):
        artifact["result"] = "PARTIAL"

    _forged(validated, mutate)


def test_forged_pilot_version_rejected(validated):
    def mutate(artifact):
        artifact["pilot_version"] = "9.9"

    _forged(validated, mutate)


# --- Allowed run-metadata variance (documented exclusion rationale) ------------


def test_recorded_at_run_metadata_variance_still_verified(tmp_path):
    # evidence.recorded_at is the Evidence v0.2 "time this record was
    # generated": every replay mints a new one, and pilot design section 11
    # requires replay comparison to exclude clock-type run metadata. Changing
    # ONLY that clock (digest honestly recomputed) stays VERIFIED — while
    # every semantic field stays bound (covered by the forged-* tests).
    src = write_source(tmp_path / "a")
    out = tmp_path / "r.json"
    main(["validate", "--source", str(src), "--output", str(out)])
    artifact = json.loads(out.read_text("utf-8"))
    artifact["evidence"]["recorded_at"] = "2020-01-01T00:00:00Z"
    artifact[ARTIFACT_DIGEST_KEY]["value"] = compute_artifact_digest(artifact)
    _rewrite_canonical(out, artifact)
    assert verify_artifact(out, src).status == VERIFIED


def test_run_clock_metadata_variance_still_verified(validated):
    src, out, artifact = validated
    artifact["validation_started_at"] = "2020-01-01T00:00:00Z"
    artifact["validation_completed_at"] = "2020-01-01T00:00:09Z"
    artifact["duration_ms"] = 999999
    artifact["validation_id"] = "different-run"
    artifact[ARTIFACT_DIGEST_KEY]["value"] = compute_artifact_digest(artifact)
    _rewrite_canonical(out, artifact)
    assert verify_artifact(out, src).status == VERIFIED


# --- Strict artifact parsing / canonical input enforcement ----------------------


def test_duplicate_artifact_json_key_rejected(validated):
    src, out, _ = validated
    # hand-written bytes: a Python dict literal would silently drop the dup
    out.write_bytes(b'{"result":"PASS","result":"PASS"}\n')
    outcome = verify_artifact(out, src)
    assert outcome.status == REJECTED
    assert any("strict JSON" in r for r in outcome.reasons)


def test_non_canonical_whitespace_order_rejected(validated):
    src, out, artifact = validated
    artifact[ARTIFACT_DIGEST_KEY]["value"] = compute_artifact_digest(artifact)
    # semantically equal JSON, pretty-printed (non-canonical spacing)
    out.write_bytes(json.dumps(artifact, ensure_ascii=False, indent=2).encode("utf-8") + b"\n")
    outcome = verify_artifact(out, src)
    assert outcome.status == REJECTED
    assert any("canonical" in r for r in outcome.reasons)


def test_artifact_without_final_lf_rejected(validated):
    src, out, artifact = validated
    out.write_bytes(canonical_bytes(artifact))  # no trailing LF
    assert verify_artifact(out, src).status == REJECTED


def test_artifact_nan_rejected(validated):
    src, out, _ = validated
    out.write_bytes(b'{"result": NaN}\n')
    assert verify_artifact(out, src).status == REJECTED


def test_artifact_invalid_utf8_rejected(validated):
    src, out, _ = validated
    out.write_bytes(b'{"result": "\xff\xfe"}\n')
    assert verify_artifact(out, src).status == REJECTED


def test_artifact_non_object_top_level_rejected(validated):
    src, out, _ = validated
    out.write_bytes(b"[1, 2, 3]\n")
    assert verify_artifact(out, src).status == REJECTED


def test_artifact_digest_algorithm_tamper_rejected(validated):
    src, out, artifact = validated
    artifact[ARTIFACT_DIGEST_KEY]["algorithm"] = "sha512"
    artifact[ARTIFACT_DIGEST_KEY]["value"] = compute_artifact_digest(artifact)
    _rewrite_canonical(out, artifact)
    outcome = verify_artifact(out, src)
    assert outcome.status == REJECTED
    assert any("algorithm" in r for r in outcome.reasons)


def test_artifact_digest_canonicalization_tamper_rejected(validated):
    src, out, artifact = validated
    artifact[ARTIFACT_DIGEST_KEY]["canonicalization"] = "rfc8785"
    artifact[ARTIFACT_DIGEST_KEY]["value"] = compute_artifact_digest(artifact)
    _rewrite_canonical(out, artifact)
    outcome = verify_artifact(out, src)
    assert outcome.status == REJECTED
    assert any("canonicalization" in r for r in outcome.reasons)


# --- Full digest references (SOURCE_REFERENCE_DIGEST_LENGTH=64) -----------------


def test_all_source_refs_carry_full_64_hex_digest(validated):
    src, out, artifact = validated
    evidence = artifact["evidence"]
    refs = [
        evidence["request"]["source_ref"],
        evidence["request"]["value"]["attempt_ref"],
        evidence["request"]["value"]["runtime_ref"],
        evidence["argument_binding"]["requested"]["value"]["snapshot_ref"],
        evidence["argument_binding"]["requested"]["source_ref"],
        evidence["execution"]["completion"]["source_ref"],
        evidence["outcome"]["source_ref"],
        evidence["outcome"]["value"]["result_ref"],
    ]
    for ref in refs:
        assert "langchain-" in ref
    # attempt_ref embeds the digest between the scheme and the run ids
    attempt = evidence["request"]["value"]["attempt_ref"]
    digest = attempt.split(":")[1]
    assert HEX64.match(digest), attempt
    # archive refs embed the digest as the first segment after the scheme
    # (before any ':' producer suffix or '#' locator)
    for ref in refs:
        if ref.startswith("langchain-archive:"):
            digest = ref[len("langchain-archive:") :].split(":", 1)[0].split("#", 1)[0]
            assert HEX64.match(digest), ref
    # evidence_id binds the full digest too
    assert HEX64.match(evidence["evidence_id"].split(":")[1])
    # claim correlation locator uses the full digest
    correlation = [c for c in artifact["claim_checks"] if c["claim"] == "TOOL_RUN_LIFECYCLE_CORRELATION"][0]
    assert HEX64.match(correlation["source_ref"].split("#", 1)[0].split(":", 1)[1])
    # lineage correlation key is the exact digest
    assert artifact["lineage"]["correlation_key"]["source_digest"] == artifact["source_digest"]["value"]
    # nothing anywhere still references a 12-hex truncated digest form
    text = out.read_text("utf-8")
    assert not re.search(r"langchain-[a-z-]+:[0-9a-f]{12}[:#]", text)


def test_runtime_ref_uses_full_digest(validated):
    _, _, artifact = validated
    runtime_ref = artifact["evidence"]["request"]["value"]["runtime_ref"]
    prefix, rest = runtime_ref.split(":", 1)
    digest, producer = rest.split(":", 1)
    assert prefix == "langchain-archive"
    assert HEX64.match(digest)
    assert producer.startswith("producer=langchain@")
