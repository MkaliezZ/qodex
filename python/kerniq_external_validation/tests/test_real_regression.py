"""Real regression reference: the historical internal capture bundle
(experiments/langchain-proof-v0-5-1) is Core 1.6.1, so the pinned version
gate of the EXTERNAL profile must refuse it. This check proves the generic
matcher is not accidentally dependent on the historical bundle, and that the
version gate is real — it is NOT external validation and NOT a Core 1.6.2
positive runtime test.

Read-only: raw bytes are copied unchanged into a temporary source directory
with an HONEST provenance declaration (the versions the old capture really
used); nothing under experiments/ is modified."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from kerniq_external_validation import langchain_profile as profile
from kerniq_external_validation.diagnostics import UNSUPPORTED_PROFILE
from kerniq_external_validation.source_loader import load_source
from kerniq_external_validation.tests.helpers import write_source
from kerniq_external_validation.validator import validate_source

REPO_ROOT = Path(__file__).resolve().parents[3]
OLD_BUNDLE_RAW = REPO_ROOT / "experiments" / "langchain-proof-v0-5-1" / "engineering-source-bundle" / "raw" / "native-events.jsonl"


def _old_capture_provenance() -> dict:
    """Honest declaration of the historical capture environment (Core 1.6.1)."""
    return {
        "synthetic_test_fixture": True,
        "producer": {
            "langchain": "1.4.0",
            "langchain-core": "1.6.1",  # the old capture really used 1.6.1
            "langgraph": "1.2.11",
            "langgraph-prebuilt": "1.1.0",
        },
        "environment": {"python": "3.11.15", "pydantic": "2.13.5"},
        "serializer": {
            "identity": profile.PINNED_SERIALIZER_IDENTITY,
            "langchain-core": "1.6.1",
        },
        "exporter": {"identity": "team-lab-native-stream-consumer", "version": "1"},
        "capture": {
            "method": profile.PINNED_STREAM_METHOD,
            "version": profile.PINNED_STREAM_VERSION,
            "filters": profile.FILTER_DECLARED_NONE,
            "scope": "historical internal capture (regression reference only)",
            "termination": profile.TERMINATION_NORMAL,
        },
    }


def test_old_bundle_exists_readonly():
    assert OLD_BUNDLE_RAW.is_file(), "historical regression bundle missing"


def test_old_core_161_bundle_refused_by_version_gate(tmp_path):
    raw = OLD_BUNDLE_RAW.read_bytes()  # read-only copy, bytes unchanged
    src = write_source(
        tmp_path / "regression-source",
        raw_bytes=raw,
        provenance=_old_capture_provenance(),
    )
    # byte identity of the copy
    assert hashlib.sha256(raw).hexdigest() == hashlib.sha256((src / profile.RAW_FILENAME).read_bytes()).hexdigest()

    loaded = load_source(src)
    codes = [d.code for d in loaded.diagnostics]
    assert UNSUPPORTED_PROFILE in codes
    outcome = validate_source(loaded)
    assert outcome.result != "PASS"
    assert outcome.evidence_document is None


def test_old_bundle_without_provenance_bundle_refused(tmp_path):
    # pointing straight at the historical bundle directory (no inventory/
    # provenance layout) is a binding failure, never a best-effort parse
    loaded = load_source(OLD_BUNDLE_RAW.parent.parent)
    from kerniq_external_validation.diagnostics import SOURCE_BINDING_FAILURE

    assert SOURCE_BINDING_FAILURE in [d.code for d in loaded.diagnostics]
