"""Source loader tests: provenance pins, strict JSONL, inventory binding,
path safety. All sources are SYNTHETIC_TEST_FIXTURE=true."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from kerniq_external_validation import langchain_profile as profile
from kerniq_external_validation.source_loader import (
    SourceRejected,
    load_source,
    reverify_source_digest,
)
from kerniq_external_validation.tests.helpers import (
    events_to_jsonl,
    valid_events,
    valid_provenance,
    write_source,
)

from kerniq_external_validation.diagnostics import (
    INVALID_SOURCE,
    MISSING_PROVENANCE,
    SOURCE_BINDING_FAILURE,
    UNSUPPORTED_PROFILE,
)


def _codes(loaded):
    return [d.code for d in loaded.diagnostics]


# --- Positive -------------------------------------------------------------------


def test_static_synthetic_fixture_loads_clean():
    fixtures = Path(__file__).parent / "fixtures" / "synthetic_valid_source"
    loaded = load_source(fixtures)
    assert _codes(loaded) == []
    assert loaded.events
    assert loaded.provenance["synthetic_test_fixture"] is True


def test_exact_byte_digest_includes_final_lf(tmp_path):
    src = write_source(tmp_path / "src")
    loaded = load_source(src)
    import hashlib

    raw = (src / profile.RAW_FILENAME).read_bytes()
    assert raw.endswith(b"\n")
    assert loaded.raw_digest == hashlib.sha256(raw).hexdigest()
    assert loaded.raw_length == len(raw)


# --- Provenance (cases 7, 8) ------------------------------------------------------


def test_wrong_pinned_version_is_unsupported_profile(tmp_path):
    provenance = valid_provenance()
    provenance["producer"]["langchain-core"] = "1.6.1"
    src = write_source(tmp_path / "src", provenance=provenance)
    loaded = load_source(src)
    assert UNSUPPORTED_PROFILE in _codes(loaded)


def test_missing_provenance_facts_stay_missing(tmp_path):
    provenance = valid_provenance()
    del provenance["exporter"]
    provenance["capture"].pop("filters")
    src = write_source(tmp_path / "src", provenance=provenance)
    loaded = load_source(src)
    codes = _codes(loaded)
    assert codes.count(MISSING_PROVENANCE) >= 2


def test_degraded_termination_declaration_is_incomplete(tmp_path):
    provenance = valid_provenance()
    provenance["capture"]["termination"] = "truncated"
    src = write_source(tmp_path / "src", provenance=provenance)
    loaded = load_source(src)
    from kerniq_external_validation.diagnostics import INCOMPLETE_SOURCE

    assert INCOMPLETE_SOURCE in _codes(loaded)


def test_filtered_capture_refused(tmp_path):
    provenance = valid_provenance()
    provenance["capture"]["filters"] = {"include": ["on_tool_start", "on_tool_end"]}
    src = write_source(tmp_path / "src", provenance=provenance)
    loaded = load_source(src)
    assert UNSUPPORTED_PROFILE in _codes(loaded)


# --- Strict JSONL (cases 9-11) ------------------------------------------------------


def _write_raw_only(tmp_path, raw: bytes, **kwargs):
    return write_source(tmp_path / "src", raw_bytes=raw, **kwargs)


def test_malformed_json_line(tmp_path):
    raw = events_to_jsonl(valid_events(include_opaque_carrier=False))
    lines = raw.split(b"\n")
    lines[2] = b'{"event": "on_tool_start", broken'
    src = _write_raw_only(tmp_path, b"\n".join(lines) + b"\n")
    loaded = load_source(src)
    assert INVALID_SOURCE in _codes(loaded)


def test_duplicate_json_key(tmp_path):
    raw = events_to_jsonl(valid_events(include_opaque_carrier=False))
    lines = raw.split(b"\n")
    lines[0] = json.dumps({"event": "on_chain_start", "event": "on_chain_start"}, separators=(",", ":")).encode()
    src = _write_raw_only(tmp_path, b"\n".join(lines) + b"\n")
    loaded = load_source(src)
    assert INVALID_SOURCE in _codes(loaded)


def test_missing_final_lf(tmp_path):
    raw = events_to_jsonl(valid_events(include_opaque_carrier=False))
    src = _write_raw_only(tmp_path, raw[:-1])
    loaded = load_source(src)
    assert INVALID_SOURCE in _codes(loaded)


def test_bom_refused(tmp_path):
    raw = events_to_jsonl(valid_events(include_opaque_carrier=False))
    src = _write_raw_only(tmp_path, b"\xef\xbb\xbf" + raw)
    loaded = load_source(src)
    assert INVALID_SOURCE in _codes(loaded)


def test_crlf_refused(tmp_path):
    raw = events_to_jsonl(valid_events(include_opaque_carrier=False))
    src = _write_raw_only(tmp_path, raw.replace(b"\n", b"\r\n"))
    loaded = load_source(src)
    assert INVALID_SOURCE in _codes(loaded)


def test_blank_line_refused(tmp_path):
    raw = events_to_jsonl(valid_events(include_opaque_carrier=False))
    src = _write_raw_only(tmp_path, raw + b"\n")
    loaded = load_source(src)
    assert INVALID_SOURCE in _codes(loaded)


def test_nan_constant_refused(tmp_path):
    raw = events_to_jsonl(valid_events(include_opaque_carrier=False))
    lines = raw.split(b"\n")
    lines[2] = b'{"event":"on_tool_start","data":{"input":{"x":NaN}},"name":"t","run_id":"r","parent_ids":["root"]}'
    src = _write_raw_only(tmp_path, b"\n".join(lines) + b"\n")
    loaded = load_source(src)
    assert INVALID_SOURCE in _codes(loaded)


def test_non_object_line_refused(tmp_path):
    raw = events_to_jsonl(valid_events(include_opaque_carrier=False))
    lines = raw.split(b"\n")
    lines[2] = b'["not", "an", "event"]'
    src = _write_raw_only(tmp_path, b"\n".join(lines) + b"\n")
    loaded = load_source(src)
    assert INVALID_SOURCE in _codes(loaded)


# --- Inventory binding & path safety (cases 26 partial, 29) ---------------------------


def test_inventory_digest_mismatch_is_binding_failure(tmp_path):
    src = write_source(tmp_path / "src", tamper_inventory=True)
    loaded = load_source(src)
    assert SOURCE_BINDING_FAILURE in _codes(loaded)


def test_inventory_traversal_path_refused(tmp_path):
    src = tmp_path / "src"
    secret = tmp_path / "secret.txt"
    secret.write_bytes(b"outside")
    write_source(src, inventory_paths=[profile.RAW_FILENAME, profile.PROVENANCE_FILENAME, "../secret.txt"])
    loaded = load_source(src)
    assert SOURCE_BINDING_FAILURE in _codes(loaded)


def test_inventory_absolute_path_refused(tmp_path):
    src = write_source(tmp_path / "src")
    inventory = json.loads((src / profile.INVENTORY_FILENAME).read_text("utf-8"))
    outside = tmp_path / "outside.json"
    outside.write_bytes(b"{}")
    inventory["files"].append({"path": str(outside), "byte_length": 2, "sha256": "0" * 64})
    (src / profile.INVENTORY_FILENAME).write_text(json.dumps(inventory), encoding="utf-8")
    loaded = load_source(src)
    assert SOURCE_BINDING_FAILURE in _codes(loaded)


def test_inventory_duplicate_paths_refused(tmp_path):
    src = write_source(tmp_path / "src")
    inventory = json.loads((src / profile.INVENTORY_FILENAME).read_text("utf-8"))
    inventory["files"].append(dict(inventory["files"][0]))
    (src / profile.INVENTORY_FILENAME).write_text(json.dumps(inventory), encoding="utf-8")
    loaded = load_source(src)
    assert SOURCE_BINDING_FAILURE in _codes(loaded)


def test_inventory_missing_refused(tmp_path):
    src = write_source(tmp_path / "src")
    (src / profile.INVENTORY_FILENAME).unlink()
    loaded = load_source(src)
    assert SOURCE_BINDING_FAILURE in _codes(loaded)


def test_remote_url_source_rejected(tmp_path):
    with pytest.raises(SourceRejected):
        load_source(Path("https://example.com/source"))


# --- Byte re-verification (case 25) ------------------------------------------------


def test_source_mutation_between_read_and_recheck_detected(tmp_path):
    src = write_source(tmp_path / "src")
    loaded = load_source(src)
    raw = src / profile.RAW_FILENAME
    raw.write_bytes(raw.read_bytes() + b'{"event":"on_chain_end"}\n')
    binding = reverify_source_digest(loaded)
    assert binding is not None
    assert binding.code == SOURCE_BINDING_FAILURE


def test_reverify_clean_source_passes(tmp_path):
    src = write_source(tmp_path / "src")
    loaded = load_source(src)
    assert reverify_source_digest(loaded) is None
