"""Artifact and verifier tests (cases 4-6, 25-30): deterministic canonical
serialization, artifact integrity, replay-based verification, privacy and
path-safety invariants."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from kerniq_external_validation import langchain_profile as profile
from kerniq_external_validation.artifact import (
    ARTIFACT_DIGEST_KEY,
    build_envelope,
    canonical_bytes,
    compute_artifact_digest,
)
from kerniq_external_validation.cli import main
from kerniq_external_validation.source_loader import load_source
from kerniq_external_validation.tests.helpers import (
    TOOL_CONTENT,
    TOOL_INPUT,
    write_source,
)
from kerniq_external_validation.validator import validate_source
from kerniq_external_validation.verifier import REJECTED, VERIFIED, verify_artifact

_RUN_METADATA = (
    "validation_started_at",
    "validation_completed_at",
    "duration_ms",
    "validation_id",
)


def _stable(envelope):
    # artifact_digest legitimately varies: it binds the full envelope
    # including run metadata (timestamps/duration); pilot design only
    # requires the derived claim/result parts to be deterministic.
    excluded = _RUN_METADATA + (ARTIFACT_DIGEST_KEY,)
    stable = {k: v for k, v in envelope.items() if k not in excluded}
    evidence = stable.get("evidence")
    if isinstance(evidence, dict) and "recorded_at" in evidence:
        stable["evidence"] = {**evidence, "recorded_at": "<excluded>"}
    return stable


def _validate_to_artifact(tmp_path, source_name="src", artifact_name="result.json"):
    src = write_source(tmp_path / source_name)
    out = tmp_path / artifact_name
    rc = main(["validate", "--source", str(src), "--output", str(out)])
    return src, out, rc, json.loads(out.read_text("utf-8"))


# --- Cases 4-6 -----------------------------------------------------------------------


def test_case4_valid_artifact_generated(tmp_path):
    src, out, rc, artifact = _validate_to_artifact(tmp_path)
    assert rc == 0
    assert artifact["result"] == "PASS"
    assert artifact["profile_id"] == profile.PROFILE_ID
    assert artifact["profile_version"] == profile.PROFILE_VERSION
    assert artifact["capability_assessment"] == "OBSERVED"
    assert artifact["source_digest"]["representation"] == "utf8-jsonl-exact-v1"
    assert artifact["evidence_validation"]["status"] == "pass"
    assert len(artifact["claims_proven"]) == len(profile.CLAIMS_PROVEN)
    assert sorted(artifact["claim_checks"], key=lambda c: c["claim"])


def test_case5_verify_succeeds(tmp_path):
    src, out, rc, _ = _validate_to_artifact(tmp_path)
    assert rc == 0
    outcome = verify_artifact(out, src)
    assert outcome.status == VERIFIED
    assert verify_artifact(out, src).status == VERIFIED


def test_case6_deterministic_output_checks(tmp_path):
    src1 = write_source(tmp_path / "a")
    src2 = write_source(tmp_path / "b")
    out1, out2 = tmp_path / "r1.json", tmp_path / "r2.json"
    main(["validate", "--source", str(src1), "--output", str(out1)])
    main(["validate", "--source", str(src2), "--output", str(out2)])
    art1, art2 = json.loads(out1.read_text("utf-8")), json.loads(out2.read_text("utf-8"))
    # same input -> stable parts byte-identical (canonical bytes)
    assert canonical_bytes(_stable(art1)) == canonical_bytes(_stable(art2))
    # the whole file is its own canonical serialization (+ trailing LF)
    assert out1.read_bytes() == canonical_bytes(art1) + b"\n"
    # digest excludes itself
    assert art1[ARTIFACT_DIGEST_KEY]["value"] == compute_artifact_digest(art1)


def test_canonical_bytes_sorted_compact_no_ascii_escape():
    assert canonical_bytes({"b": 1, "a": "é"}) == b'{"a":"\xc3\xa9","b":1}'


# --- Cases 27-28: artifact tampering ----------------------------------------------------


def test_case27_artifact_tampering_detected(tmp_path):
    src, out, _, artifact = _validate_to_artifact(tmp_path)
    artifact["result"] = "PARTIAL"  # forged without recomputing digest
    out.write_text(json.dumps(artifact, ensure_ascii=False), encoding="utf-8")
    assert verify_artifact(out, src).status == REJECTED


def test_case27b_forged_with_recomputed_digest_caught_by_replay(tmp_path):
    src, out, _, artifact = _validate_to_artifact(tmp_path)
    artifact["claims_proven"] = list(artifact["claims_proven"]) + ["PHYSICAL_EXECUTION"]
    artifact[ARTIFACT_DIGEST_KEY]["value"] = compute_artifact_digest(artifact)  # attacker recomputes
    out.write_text(json.dumps(artifact, ensure_ascii=False), encoding="utf-8")
    outcome = verify_artifact(out, src)
    assert outcome.status == REJECTED
    assert any("claims_proven" in r or "claim consistency" in r for r in outcome.reasons)


def test_case28_invalid_artifact_digest_detected(tmp_path):
    src, out, _, artifact = _validate_to_artifact(tmp_path)
    artifact[ARTIFACT_DIGEST_KEY]["value"] = "0" * 64
    out.write_text(json.dumps(artifact, ensure_ascii=False), encoding="utf-8")
    assert verify_artifact(out, src).status == REJECTED


def test_verify_rejects_unknown_profile_artifact(tmp_path):
    src, out, _, artifact = _validate_to_artifact(tmp_path)
    artifact["profile_version"] = "9.9.9"
    artifact[ARTIFACT_DIGEST_KEY]["value"] = compute_artifact_digest(artifact)
    out.write_text(json.dumps(artifact, ensure_ascii=False), encoding="utf-8")
    assert verify_artifact(out, src).status == REJECTED


def test_verify_rejects_missing_artifact_file(tmp_path):
    src = write_source(tmp_path / "src")
    outcome = verify_artifact(tmp_path / "missing.json", src)
    assert outcome.status == REJECTED


# --- Case 26: source binding -----------------------------------------------------------------


def test_case26_source_digest_mismatch_detected(tmp_path):
    src, out, _, _artifact = _validate_to_artifact(tmp_path)
    # a different (but internally valid) source must not verify
    from kerniq_external_validation.tests.helpers import valid_events

    different = write_source(
        tmp_path / "different",
        events=valid_events(include_opaque_carrier=False),
    )
    outcome = verify_artifact(out, different)
    assert outcome.status == REJECTED
    assert any("source binding" in r for r in outcome.reasons)


def test_verify_rejected_source_still_verifies_consistently(tmp_path):
    # refused sources produce artifacts too; verify must confirm the refusal
    from kerniq_external_validation.tests.helpers import valid_provenance

    provenance = valid_provenance()
    provenance["producer"]["langchain-core"] = "1.6.1"
    src = write_source(tmp_path / "src", provenance=provenance)
    out = tmp_path / "result.json"
    rc = main(["validate", "--source", str(src), "--output", str(out)])
    assert rc == 2
    assert verify_artifact(out, src).status == VERIFIED
    # the same bytes under a valid provenance re-derive a different result,
    # so the artifact's refusal result no longer matches the replay
    mismatching = write_source(tmp_path / "other2")
    assert verify_artifact(out, mismatching).status == REJECTED


# --- Privacy & path leakage (cases 29-30) -------------------------------------------------------


def test_case30_no_absolute_path_or_payload_leakage(tmp_path):
    src, out, rc, _ = _validate_to_artifact(tmp_path)
    text = out.read_text("utf-8")
    assert str(tmp_path) not in text
    assert str(src) not in text
    assert "C:\\" not in text and "F:\\" not in text
    assert "http://" not in text and "https://" not in text
    # no raw tool payload content in the artifact
    assert TOOL_CONTENT not in text
    assert "A-1234" not in text  # tool input value
    artifact = json.loads(text)
    for entry in artifact["diagnostics"]:
        assert set(entry) <= {"code", "severity", "count", "first"}


def test_case29_path_traversal_source_refused(tmp_path):
    from kerniq_external_validation.diagnostics import SOURCE_BINDING_FAILURE
    from kerniq_external_validation.source_loader import SourceRejected, load_source

    src = write_source(tmp_path / "src")
    inventory = json.loads((src / profile.INVENTORY_FILENAME).read_text("utf-8"))
    inventory["files"].append({"path": "../../etc/passwd", "byte_length": 0, "sha256": "0" * 64})
    (src / profile.INVENTORY_FILENAME).write_text(json.dumps(inventory), encoding="utf-8")
    loaded = load_source(src)
    assert SOURCE_BINDING_FAILURE in [d.code for d in loaded.diagnostics]


# --- No-network assumption -------------------------------------------------------------------


def test_validate_and_verify_never_touch_the_network(tmp_path, monkeypatch):
    import socket

    def _no_sockets(*args, **kwargs):
        raise AssertionError("network access attempted during local validation")

    monkeypatch.setattr(socket, "socket", _no_sockets)
    monkeypatch.setattr(socket, "create_connection", _no_sockets)
    src, out, rc, _ = _validate_to_artifact(tmp_path)
    assert rc == 0
    assert verify_artifact(out, src).status == VERIFIED
