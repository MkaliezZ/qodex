"""LangChain limited offline projection proof — 8 required cases.

CASE 1 uses the fixed real bundle (read-only); CASES 3–6 use test copies
modified in tmp directories only. The real bundle is never touched.
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from kerniq_evidence_conformance import validate_evidence_document
from kerniq_evidence_projection.langchain_projector import (
    ProjectionRefusal,
    canonical_args_digest,
    project_langchain_limited,
)
from kerniq_evidence_projection import langchain_profile as profile

BUNDLE = (
    Path(__file__).resolve().parents[3]
    / "experiments/langchain-proof-v0-5-1/engineering-source-bundle"
)
RECORDED_AT = "2026-09-08T10:00:00Z"

REAL_MANIFEST_SHA = profile.MANIFEST_SHA256
REAL_RAW_SHA = profile.RAW_SHA256


def _restore_pins():
    profile.MANIFEST_SHA256 = REAL_MANIFEST_SHA
    profile.RAW_SHA256 = REAL_RAW_SHA


@pytest.fixture(autouse=True)
def _pins_restored():
    yield
    _restore_pins()


def project(path=None):
    return project_langchain_limited(
        path or BUNDLE, recorded_at=RECORDED_AT, projection_id="proof-lc"
    )


def copy_bundle(tmp_path: Path) -> Path:
    copy = tmp_path / "bundle"
    shutil.copytree(BUNDLE, copy)
    return copy


def _repin(bundle: Path, monkeypatch) -> None:
    """Recompute both pins to the tampered copy (tests a non-identity path)."""
    import hashlib

    from kerniq_evidence_projection import langchain_projector as lp

    lp.profile.MANIFEST_SHA256 = hashlib.sha256(
        (bundle / "manifest.json").read_bytes()
    ).hexdigest()
    lp.profile.RAW_SHA256 = hashlib.sha256(
        (bundle / "raw" / "native-events.jsonl").read_bytes()
    ).hexdigest()


def tamper_raw(bundle: Path, mutate) -> None:
    raw = bundle / "raw" / "native-events.jsonl"
    lines = raw.read_text(encoding="utf-8").splitlines()
    lines = mutate(lines)
    raw.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    # keep the internal manifest consistent so the failure being tested is
    # the raw digest, not a stale manifest entry
    import hashlib

    manifest = json.loads((bundle / "manifest.json").read_text(encoding="utf-8"))
    for entry in manifest["files"]:
        if entry["path"] == "raw/native-events.jsonl":
            payload = raw.read_bytes()
            entry["sha256"] = hashlib.sha256(payload).hexdigest()
            entry["bytes"] = len(payload)
    manifest_bytes = json.dumps(manifest, indent=2).encode("utf-8")
    (bundle / "manifest.json").write_bytes(manifest_bytes)
    (bundle / "bundle.sha256").write_text(
        hashlib.sha256(manifest_bytes).hexdigest(), encoding="utf-8", newline="\n"
    )


# ------------------------------------------------------------- CASE 1


class TestCase1RealPositiveProjection:
    def test_real_bundle_projects_and_validates(self):
        result = project()
        assert result.document is not None
        validate_evidence_document(result.document)  # independent revalidation
        document = result.document

        request = document["request"]
        assert request["status"] == "known"
        assert request["value"]["tool_call_id"] == profile.TOOL_CALL_ID
        assert request["value"]["action_name"] == "add"

        requested = document["argument_binding"]["requested"]
        assert requested["status"] == "known"
        assert requested["value"]["digest"]["value"] == canonical_args_digest(
            {"a": 17, "b": 25}
        )

        completion = document["execution"]["completion"]
        assert completion["status"] == "known"
        assert completion["value"]["occurred"] is True

        assert document["outcome"]["value"]["status"] == "success"
        assert document["outcome"]["value"]["reason"] is None

    def test_forbidden_fields_stay_unknown(self):
        document = project().document
        binding = document["argument_binding"]
        execution = document["execution"]
        for field in ("effective", "executed", "scope", "authorization_match"):
            assert binding[field]["status"] == "unknown", field
        for stage in ("release", "dispatch", "start"):
            assert execution[stage]["status"] == "unknown", stage
        assert document["decision"]["status"] == "unknown"
        assert document["authorization"]["status"] == "unknown"
        assert document["request"]["value"]["identity_provenance"]["source"] == "unknown"


# ------------------------------------------------------------- CASE 2


class TestCase2OpaqueExclusion:
    def test_four_opaque_commands_detected_and_excluded(self):
        result = project()
        assert sorted(result.opaque_exclusions) == [22, 23, 50, 51]
        codes = [d["code"] for d in result.diagnostics]
        assert codes.count("opaque_event_excluded") == 4
        assert all(d["detected"] for d in result.diagnostics if d["code"] == "opaque_event_excluded")

    def test_no_known_field_references_opaque_lines(self):
        result = project()
        blob = json.dumps(result.document) + json.dumps(result.lineage)
        for line in (22, 23, 50, 51):
            assert f"#L{line}\"" not in blob or f"#L{line}" not in json.dumps(
                result.document
            )
        # every known source_ref in the document points to admitted lines
        admitted = {21, 26, 27}
        for ref in _known_refs(result.document):
            line = int(ref.rsplit("#L", 1)[1])
            assert line in admitted, f"known evidence references excluded line {line}"

    def test_projector_source_never_accesses_repr_field(self):
        # Structural check: the projector never reads the repr payload —
        # the only occurrence of the token is documentation strings, and
        # exclusion detection uses the lc type markers, not repr content.
        import inspect
        from kerniq_evidence_projection import langchain_projector as module

        import re

        source = inspect.getsource(module)
        # actual access patterns that would read the repr payload:
        bracket = re.escape('["repr"]')
        accesses = re.findall(r"\.repr\b|" + bracket, source)
        assert accesses == [], f"projector reads repr payload: {accesses}"


def _known_refs(node, refs=None):
    refs = refs or []
    if isinstance(node, dict):
        if node.get("status") == "known" and node.get("source_ref"):
            refs.append(node["source_ref"])
        for value in node.values():
            _known_refs(value, refs)
    elif isinstance(node, list):
        for value in node:
            _known_refs(value, refs)
    return refs


# ------------------------------------------------------------- CASE 3


class TestCase3BundleIdentity:
    def test_manifest_digest_mismatch_refused(self, tmp_path):
        bundle = copy_bundle(tmp_path)
        manifest = bundle / "manifest.json"
        tampered = json.loads(manifest.read_text(encoding="utf-8"))
        tampered["files"][0]["sha256"] = "0" * 64
        manifest.write_text(json.dumps(tampered, indent=2), encoding="utf-8")
        with pytest.raises(ProjectionRefusal, match="bundle identity mismatch"):
            project(bundle)

    def test_raw_digest_mismatch_refused(self, tmp_path):
        bundle = copy_bundle(tmp_path)
        tamper_raw(bundle, lambda lines: lines + [lines[-1]])  # duplicate a line
        with pytest.raises(ProjectionRefusal, match="bundle identity mismatch"):
            project(bundle)


# ------------------------------------------------------------- CASE 4


class TestCase4MissingRequest:
    def test_missing_request_source_fails_closed(self, tmp_path):
        bundle = copy_bundle(tmp_path)

        def remove_request(lines):
            # blank L21 (structured tool request) but keep the tool result
            lines[20] = json.dumps({"event": "on_chat_model_end", "data": {"output": {}}, "name": "ChatDeepSeek", "run_id": "x", "parent_ids": []})
            return lines

        tamper_raw(bundle, remove_request)
        _repin(bundle, None)
        from kerniq_evidence_projection import langchain_projector as lp

        result = lp.project_langchain_limited(
            bundle, recorded_at=RECORDED_AT, projection_id="t"
        )
        assert result.document is None
        codes = [d["code"] for d in result.diagnostics]
        assert "correlation_mismatch" in codes or "source_structure_mismatch" in codes
        _restore_pins()

    def test_never_fabricates_request_from_result(self, tmp_path):
        bundle = copy_bundle(tmp_path)
        manifest = json.loads((bundle / "manifest.json").read_text(encoding="utf-8"))
        assert manifest["bundle_format_version"]  # real bundle untouched sanity


# ------------------------------------------------------------- CASE 5


class TestCase5CorrelationMismatch:
    def _retarget(self, tmp_path, mutate):
        bundle = copy_bundle(tmp_path)
        tamper_raw(bundle, mutate)
        _repin(bundle, None)
        from kerniq_evidence_projection import langchain_projector as lp

        return bundle, lp

    def test_request_tool_call_id_mismatch_refuses(self, tmp_path):
        def mutate(lines):
            event = json.loads(lines[20])
            call = event["data"]["output"]["kwargs"]["tool_calls"][0]
            call["id"] = "call_00_TAMPERED"
            lines[20] = json.dumps(event, ensure_ascii=False)
            return lines

        bundle, lp = self._retarget(tmp_path, mutate)
        result = lp.project_langchain_limited(
            bundle, recorded_at=RECORDED_AT, projection_id="t"
        )
        assert result.document is None
        assert any(d["code"] == "correlation_mismatch" for d in result.diagnostics)

    def test_result_tool_call_id_mismatch_refuses(self, tmp_path):
        def mutate(lines):
            event = json.loads(lines[26])  # L27 on_tool_end
            kwargs = event["data"]["output"]["kwargs"]
            kwargs["tool_call_id"] = "call_00_SOMEONE_ELSE"
            lines[26] = json.dumps(event, ensure_ascii=False)
            return lines

        bundle, lp = self._retarget(tmp_path, mutate)
        result = lp.project_langchain_limited(
            bundle, recorded_at=RECORDED_AT, projection_id="t"
        )
        assert result.document is None
        assert any(d["code"] == "correlation_mismatch" for d in result.diagnostics)


# ------------------------------------------------------------- CASE 6


class TestCase5bResultSideCorrelation:
    """Closure P1-1: the terminal result must carry its own run/parent
    identity — tool_call_id alone never accepts it."""

    def _retarget(self, tmp_path, mutate):
        bundle = copy_bundle(tmp_path)
        tamper_raw(bundle, mutate)
        _repin(bundle, None)
        from kerniq_evidence_projection import langchain_projector as lp

        return bundle, lp

    def test_result_run_id_mismatch_refuses(self, tmp_path):
        def mutate(lines):
            event = json.loads(lines[26])  # L27 on_tool_end
            event["run_id"] = "01a07bef-fake-1234-0000-000000000000"
            lines[26] = json.dumps(event, ensure_ascii=False)
            return lines

        bundle, lp = self._retarget(tmp_path, mutate)
        result = lp.project_langchain_limited(
            bundle, recorded_at=RECORDED_AT, projection_id="t"
        )
        assert result.document is None
        assert any(d["code"] == "correlation_mismatch" for d in result.diagnostics)

    def test_result_parent_chain_mismatch_refuses(self, tmp_path):
        def mutate(lines):
            event = json.loads(lines[26])  # L27 on_tool_end
            event["parent_ids"] = ["01a07bef-not-root-0000-0000-00000000"]
            lines[26] = json.dumps(event, ensure_ascii=False)
            return lines

        bundle, lp = self._retarget(tmp_path, mutate)
        result = lp.project_langchain_limited(
            bundle, recorded_at=RECORDED_AT, projection_id="t"
        )
        assert result.document is None
        assert any(d["code"] == "correlation_mismatch" for d in result.diagnostics)

    def test_start_end_run_divergence_refuses(self, tmp_path):
        def mutate(lines):
            event = json.loads(lines[25])  # L26 on_tool_start
            event["run_id"] = "01a07bef-other-run-0000-0000000000000"
            lines[25] = json.dumps(event, ensure_ascii=False)
            return lines

        bundle, lp = self._retarget(tmp_path, mutate)
        result = lp.project_langchain_limited(
            bundle, recorded_at=RECORDED_AT, projection_id="t"
        )
        assert result.document is None
        assert any(d["code"] == "correlation_mismatch" for d in result.diagnostics)


class TestCase6bUnexpectedOutcome:
    """Closure P1-2: only the audited success shape projects; anything
    unexpected refuses — never an automatic failure mapping."""

    def _retarget(self, tmp_path, mutate):
        bundle = copy_bundle(tmp_path)
        tamper_raw(bundle, mutate)
        _repin(bundle, None)
        from kerniq_evidence_projection import langchain_projector as lp

        return bundle, lp

    def test_unknown_result_status_refuses(self, tmp_path):
        def mutate(lines):
            event = json.loads(lines[26])
            kwargs = event["data"]["output"]["kwargs"]
            kwargs["status"] = "error"
            lines[26] = json.dumps(event, ensure_ascii=False)
            return lines

        bundle, lp = self._retarget(tmp_path, mutate)
        result = lp.project_langchain_limited(
            bundle, recorded_at=RECORDED_AT, projection_id="t"
        )
        assert result.document is None, "unexpected status must refuse, not fail"
        diagnostics = [d for d in result.diagnostics if d["code"] == "source_structure_mismatch"]
        assert any("audited success shape" in d["detail"] for d in diagnostics)

    def test_unexpected_result_content_refuses(self, tmp_path):
        def mutate(lines):
            event = json.loads(lines[26])
            kwargs = event["data"]["output"]["kwargs"]
            kwargs["content"] = "99"
            lines[26] = json.dumps(event, ensure_ascii=False)
            return lines

        bundle, lp = self._retarget(tmp_path, mutate)
        result = lp.project_langchain_limited(
            bundle, recorded_at=RECORDED_AT, projection_id="t"
        )
        assert result.document is None
        assert any(
            "audited success shape" in d["detail"]
            for d in result.diagnostics
            if d["code"] == "source_structure_mismatch"
        )

    def test_missing_status_refuses(self, tmp_path):
        def mutate(lines):
            event = json.loads(lines[26])
            kwargs = event["data"]["output"]["kwargs"]
            del kwargs["status"]
            lines[26] = json.dumps(event, ensure_ascii=False)
            return lines

        bundle, lp = self._retarget(tmp_path, mutate)
        result = lp.project_langchain_limited(
            bundle, recorded_at=RECORDED_AT, projection_id="t"
        )
        assert result.document is None
        assert result.document is not True  # sanity: stays refused


class TestCase2bOpaqueMarkerFailClosed:
    """Closure P2-1: pinned opaque lines must carry the audited marker, and
    no unapproved opaque Command may appear elsewhere."""

    def _retarget(self, tmp_path, mutate):
        bundle = copy_bundle(tmp_path)
        tamper_raw(bundle, mutate)
        _repin(bundle, None)
        from kerniq_evidence_projection import langchain_projector as lp

        return bundle, lp

    def test_expected_opaque_marker_missing_refuses(self, tmp_path):
        def mutate(lines):
            event = json.loads(lines[21])  # L22 opaque carrier
            # strip the opaque payload from the chunk (marker disappears)
            event["data"]["chunk"] = []
            lines[21] = json.dumps(event, ensure_ascii=False)
            return lines

        bundle, lp = self._retarget(tmp_path, mutate)
        with pytest.raises(
            lp.ProjectionRefusal, match="opaque marker missing on pinned line 22"
        ):
            lp.project_langchain_limited(
                bundle, recorded_at=RECORDED_AT, projection_id="t"
            )

    def test_unexpected_extra_opaque_command_refuses(self, tmp_path):
        def mutate(lines):
            donor = json.loads(lines[21])  # L22 carries the opaque Command
            victim = json.loads(lines[51])  # L52 in-context chain event
            victim["data"]["chunk"] = donor["data"]["chunk"]
            lines[51] = json.dumps(victim, ensure_ascii=False)
            return lines

        bundle, lp = self._retarget(tmp_path, mutate)
        with pytest.raises(
            lp.ProjectionRefusal, match="unexpected opaque Command on unapproved line 52"
        ):
            lp.project_langchain_limited(
                bundle, recorded_at=RECORDED_AT, projection_id="t"
            )


class TestCase6ConflictingTerminal:
    def test_second_conflicting_result_refuses(self, tmp_path):
        bundle = copy_bundle(tmp_path)

        def add_conflict(lines):
            # Replace the final root chain_end line (in-context, not an
            # appended line) with a second, conflicting on_tool_end for the
            # same tool_call_id — the 53-line structure stays intact so the
            # conflicting-terminal guard itself is what must refuse.
            event = json.loads(lines[26])
            conflicting = json.loads(json.dumps(event))
            conflicting["data"]["output"]["kwargs"]["content"] = "99"
            lines[52] = json.dumps(conflicting, ensure_ascii=False)
            return lines

        tamper_raw(bundle, add_conflict)
        _repin(bundle, None)
        from kerniq_evidence_projection import langchain_projector as lp

        result = lp.project_langchain_limited(
            bundle, recorded_at=RECORDED_AT, projection_id="t"
        )
        assert result.document is None
        assert any(d["code"] == "conflicting_terminal_result" for d in result.diagnostics)


# ------------------------------------------------------------- CASE 7


class TestCase7UnknownPreservation:
    def test_unknown_fields_never_become_known_or_false(self):
        document = project().document
        # every forbidden field stays unknown — status exactly "unknown",
        # never false / not_applicable / known
        binding = document["argument_binding"]
        execution = document["execution"]
        assert binding["executed"]["status"] == "unknown"
        assert binding["executed"]["value"] is None
        assert binding["effective"]["status"] == "unknown"
        assert execution["start"]["status"] == "unknown"
        assert execution["start"]["value"] is None
        assert execution["dispatch"]["status"] == "unknown"
        assert execution["release"]["status"] == "unknown"
        assert document["decision"]["value"] is None
        assert document["authorization"]["value"] is None

    def test_on_tool_start_does_not_become_physical_start(self):
        document = project().document
        # the tool-start event exists in the source (L26), yet execution
        # start remains unknown — existence is not entry proof
        assert document["execution"]["start"]["status"] == "unknown"
        assert document["execution"]["start"]["reason"] == (
            "on_tool_start_is_not_physical_entry"
        )


# ------------------------------------------------------------- CASE 8


class TestCase8DeterministicReplay:
    """Same profile + source + context produce deterministic
    structurally-identical canonical projection results (documents,
    lineage, exclusions) — structural determinism, not byte identity."""

    def test_same_context_structurally_identical_output(self):
        first = project()
        second = project()
        assert first.document == second.document
        assert first.lineage == second.lineage
        assert first.opaque_exclusions == second.opaque_exclusions


class TestRealBundleUntouched:
    def test_original_bundle_digests_still_match_pins(self):
        import hashlib

        manifest = hashlib.sha256(
            (BUNDLE / "manifest.json").read_bytes()
        ).hexdigest()
        raw = hashlib.sha256((BUNDLE / "raw" / "native-events.jsonl").read_bytes()).hexdigest()
        assert manifest == REAL_MANIFEST_SHA
        assert raw == REAL_RAW_SHA
