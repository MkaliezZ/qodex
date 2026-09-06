"""Offline projection proof: DSH native observer bundles → Evidence v0.2.

Real captures (clearly separated from synthetic variants) prove the
positive mapping; synthetic variants — labeled ``syn_*`` — only verify that
the projection never upgrades or invents facts. No variant is claimed as a
new real runtime run.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from kerniq_evidence_conformance import validate_evidence_document
from kerniq_evidence_projection import project_bundle, profile

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"
RECORDED_AT = "2026-09-07T16:00:00Z"


def project(name: str, projection_id: str = "proof"):
    return project_bundle(
        FIXTURES / name, recorded_at=RECORDED_AT, projection_id=projection_id
    )


# ------------------------------------------------------------- CASE 1


class TestCase1RealSuccessfulCall:
    def test_valid_projection_from_real_capture(self):
        result = project("real_success_read_call.jsonl")
        assert result.diagnostics == []
        assert len(result.documents) == 1
        document = result.documents[0]
        validate_evidence_document(document)  # revalidated independently

        request = document["request"]
        assert request["status"] == "known"
        assert request["value"]["tool_call_id"] == "call_00_C3bKZTCjl6xO2JeK9yBw6519"
        assert request["value"]["action_name"] == "read"
        assert request["value"]["identity_provenance"]["source"] == "unknown"

        decision = document["decision"]
        assert decision["status"] == "known"
        assert decision["value"]["evaluation"] == "decided"
        assert decision["value"]["action"] == "allow"
        assert decision["value"]["decided_at"] is None  # no timestamps exist

        execution = document["execution"]
        assert execution["dispatch"]["status"] == "known"
        assert execution["dispatch"]["value"]["occurred"] is True
        assert execution["dispatch"]["value"]["at"] is None
        assert execution["start"]["status"] == "unknown"  # hook ≠ tool entry
        assert execution["completion"]["value"]["occurred"] is True

        assert document["outcome"]["value"]["status"] == "success"
        assert document["outcome"]["value"]["reason"] is None

    def test_projection_is_deterministic(self):
        first = project("real_success_read_call.jsonl", projection_id="det")
        second = project("real_success_read_call.jsonl", projection_id="det")
        assert first.documents == second.documents
        assert first.bundle_digest == second.bundle_digest

    def test_lineage_preserves_source_references(self):
        result = project("real_success_read_call.jsonl")
        lineage = result.lineage[0]
        assert lineage["fields"]["request"]["source_lines"] == [1]
        assert lineage["fields"]["decision"]["source_lines"] == [3]
        assert lineage["fields"]["execution"]["source_lines"]["dispatch"] == [4]
        assert lineage["fields"]["outcome"]["source_lines"] == [5]
        assert lineage["bundle_digest"] == result.bundle_digest
        assert lineage["fields"]["request"]["rule"].startswith("model_request→")


# ------------------------------------------------------- real blocked sample


class TestRealBlockedCall:
    def test_blocked_real_capture_keeps_blocked_not_failed(self):
        result = project("real_block_read_call.jsonl")
        assert result.diagnostics == []
        document = result.documents[0]
        decision = document["decision"]
        # DSH "deny" is the audited adapter spelling of canonical block.
        assert decision["value"]["action"] == "block"
        execution = document["execution"]
        assert execution["dispatch"]["status"] == "unknown"
        assert execution["completion"]["value"]["occurred"] is True
        # Blocked != Failed: the error-shaped result after a policy deny
        # with no dispatch is the denial feedback terminal.
        assert document["outcome"]["value"]["status"] == "not_executed"
        assert document["outcome"]["value"]["reason"] == "policy_blocked"


# ------------------------------------------------------------- CASE 2


class TestCase2IncompleteEvents:
    def test_request_dispatch_without_result_yields_unknown_outcome(self):
        result = project("syn_truncated_no_result.jsonl")
        assert result.diagnostics == []
        document = result.documents[0]
        assert document["execution"]["completion"]["status"] == "unknown"
        outcome = document["outcome"]
        assert outcome["status"] == "unknown"
        assert outcome["value"] is None
        assert outcome["reason"] == "result_event_missing"
        # never auto success/failure
        assert document["outcome"].get("value") is None

    def test_outcome_is_not_fabricated_as_failure(self):
        result = project("syn_truncated_no_result.jsonl")
        document = result.documents[0]
        assert document["execution"]["dispatch"]["value"]["occurred"] is True
        assert document["outcome"]["status"] == "unknown"


# ------------------------------------------------------------- CASE 3


class TestCase3ArgumentsMissing:
    def test_no_args_in_source_keeps_binding_unknown(self):
        result = project("real_success_read_call.jsonl")
        binding = result.documents[0]["argument_binding"]
        for stage in ("requested", "effective", "executed"):
            assert binding[stage]["status"] == "unknown"
            assert binding[stage]["value"] is None
            assert binding[stage]["reason"] == (
                f"dsh_observer_records_no_{stage}_arguments"
            )
        assert binding["scope"]["status"] == "unknown"
        assert binding["authorization_match"]["status"] == "unknown"

    def test_unknown_binding_is_not_copied_across_stages(self):
        result = project("real_success_read_call.jsonl")
        binding = result.documents[0]["argument_binding"]
        reasons = {binding[s]["reason"] for s in ("requested", "effective", "executed")}
        assert len(reasons) == 3  # three distinct gaps, not one copied value


# ------------------------------------------------------------- CASE 4


class TestCase4IdentityUnknown:
    def test_authorization_event_without_identity_keeps_unknown_provenance(self):
        result = project("syn_approval_no_identity.jsonl")
        assert result.diagnostics == []
        document = result.documents[0]
        authorization = document["authorization"]
        assert authorization["status"] == "known"
        assert authorization["value"]["disposition"] == "granted"
        identity = authorization["value"]["identity_provenance"]
        # authorization existence != human attribution
        assert identity["source"] == "unknown"
        assert identity["subject_ref"] is None
        assert identity["provenance_ref"] is None
        assert identity["reason"] == profile.IDENTITY_UNKNOWN_REASON
        # approval does not manufacture a policy allow
        assert document["decision"]["value"]["action"] == "allow"  # from pre_execute only
        lineage = result.lineage[0]["fields"]["authorization"]
        assert lineage.get("synthetic_source") is True

    def test_approval_without_target_keeps_match_unknown(self):
        result = project("syn_approval_no_identity.jsonl")
        binding = result.documents[0]["argument_binding"]
        assert binding["authorization_match"]["status"] == "unknown"
        assert binding["authorization_match"]["reason"] == (
            profile.MATCH_UNKNOWN_NO_TARGET_REASON
        )


# ------------------------------------------------- test-required categories


class TestMissingField:
    def test_event_missing_required_source_field_is_diagnosed(self):
        result = project("syn_result_missing_field.jsonl")
        codes = [d["code"] for d in result.diagnostics]
        assert "missing_required_source_field" in codes
        # the group without a usable result keeps outcome unknown
        document = result.documents[0]
        assert document["outcome"]["status"] == "unknown"

    def test_event_missing_correlation_key_is_diagnosed(self):
        result = project("syn_missing_correlation.jsonl")
        codes = [d["code"] for d in result.diagnostics]
        assert "missing_correlation_key" in codes
        # the orphan line is never merged into the correlated call
        assert len(result.documents) == 1
        assert result.documents[0]["request"]["value"]["action_name"] == "read"


class TestUnsupportedEvent:
    def test_unknown_phase_is_diagnosed_not_mapped(self):
        result = project("syn_unsupported_event.jsonl")
        codes = [d["code"] for d in result.diagnostics]
        assert "unsupported_event" in codes
        detail = next(d for d in result.diagnostics if d["code"] == "unsupported_event")
        assert "cache_flush" in detail["detail"]
        # the real call still projects cleanly
        assert len(result.documents) == 1
        assert result.documents[0]["outcome"]["value"]["status"] == "success"

    def test_malformed_json_line_is_diagnosed(self, tmp_path):
        bundle = tmp_path / "broken.jsonl"
        bundle.write_text('{"phase":"model_request","toolCallId":"c1"\n', encoding="utf-8")
        result = project_bundle(
            bundle, recorded_at=RECORDED_AT, projection_id="proof"
        )
        assert [d["code"] for d in result.diagnostics] == ["malformed_line"]
        assert result.documents == []


class TestUnknownPreservation:
    def test_unknown_never_becomes_false_or_known(self):
        result = project("syn_truncated_no_result.jsonl")
        document = result.documents[0]
        completion = document["execution"]["completion"]
        assert completion["status"] == "unknown"
        assert completion["value"] is None  # not occurred=false, not true
        assert completion["reason"] == "result_event_missing"

    def test_release_has_no_receipt_anywhere(self):
        for name in (
            "real_success_read_call.jsonl",
            "real_block_read_call.jsonl",
            "syn_truncated_no_result.jsonl",
        ):
            document = project(name).documents[0]
            assert document["execution"]["release"]["status"] == "unknown"

    def test_recorded_at_is_projection_time_not_event_time(self):
        document = project("real_success_read_call.jsonl").documents[0]
        assert document["recorded_at"] == RECORDED_AT
        assert document["decision"]["value"]["decided_at"] is None


class TestConflictingSource:
    def test_conflicting_decisions_are_not_published(self):
        result = project("syn_conflicting_decisions.jsonl")
        codes = [d["code"] for d in result.diagnostics]
        assert "conflicting_source" in codes
        # fail closed: the whole conflicting group is withheld
        assert result.documents == []

    def test_identical_duplicate_lines_read_idempotently(self, tmp_path):
        original = (FIXTURES / "real_success_read_call.jsonl").read_text(encoding="utf-8")
        bundle = tmp_path / "dup.jsonl"
        bundle.write_text(original + original, encoding="utf-8")
        result = project_bundle(bundle, recorded_at=RECORDED_AT, projection_id="dup")
        assert result.diagnostics == []
        assert len(result.documents) == 1  # same call, not two


class TestRealVersusSyntheticSeparation:
    def test_real_fixtures_carry_their_capture_digest(self):
        for name in ("real_success_read_call.jsonl", "real_block_read_call.jsonl"):
            result = project(name)
            assert result.diagnostics == []
            assert len(result.bundle_digest) == 64

    def test_synthetic_variants_are_labeled_files(self):
        synthetic = sorted(p.name for p in FIXTURES.glob("syn_*.jsonl"))
        assert len(synthetic) == 6
        real = sorted(p.name for p in FIXTURES.glob("real_*.jsonl"))
        assert len(real) == 2
