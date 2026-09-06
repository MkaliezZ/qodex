"""Offline conformance proof for kerniq.governance-evidence.v0.2 (MVP).

Six required cases plus spec-derived invalid variants. All fixtures are
synthetic; the proof verifies that the frozen schema can express the
governance lifecycle facts truthfully — it never claims runtime capability.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

from kerniq_evidence_conformance import (
    EvidenceSchemaError,
    UnsupportedFieldError,
    validate_evidence_collection,
    validate_evidence_document,
    validate_json_text,
)

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"


def load_fixture(name: str) -> dict:
    return validate_json_text(
        (FIXTURES / name).read_text(encoding="utf-8")
    )


def reject(mutated: dict, match: str) -> None:
    with pytest.raises(EvidenceSchemaError, match=match):
        validate_evidence_document(mutated)


# ------------------------------------------------------------- CASE 1


class TestCase1SuccessfulExecution:
    def test_full_success_lifecycle_is_valid(self):
        document = validate_evidence_document(load_fixture("case1_success.json"))
        assert document["decision"]["value"]["action"] == "allow"
        assert document["authorization"]["value"]["disposition"] == "granted"
        for stage in ("release", "dispatch", "start", "completion"):
            observation = document["execution"][stage]
            assert observation["status"] == "known"
            assert observation["value"]["occurred"] is True
        assert document["outcome"]["value"]["status"] == "success"

    def test_success_outcome_may_omit_reason(self):
        document = validate_evidence_document(load_fixture("case1_success.json"))
        assert document["outcome"]["value"]["reason"] is None

    def test_fractional_seconds_and_returned_document_unmodified(self):
        raw = load_fixture("case1_success.json")
        snapshot = copy.deepcopy(raw)
        document = validate_evidence_document(raw)
        assert (
            document["execution"]["start"]["value"]["at"]
            == "2026-09-07T12:00:00.250Z"
        )
        assert document == snapshot  # no repair, no normalization, no mutation


# ------------------------------------------------------------- CASE 2


class TestCase2ApprovalThenPolicyBlock:
    def test_block_after_granted_approval_is_valid(self):
        document = validate_evidence_document(
            load_fixture("case2_approval_then_policy_block.json")
        )
        assert document["decision"]["value"]["action"] == "block"

    def test_policy_block_preserves_historical_approval(self):
        document = validate_evidence_document(
            load_fixture("case2_approval_then_policy_block.json")
        )
        authorization = document["authorization"]
        # approval existence survives the block; it is neither deleted,
        # downgraded, nor flipped to refused/not_applicable.
        assert authorization["status"] == "known"
        assert authorization["value"]["disposition"] == "granted"
        assert authorization["value"]["approved_at"] is not None

    def test_controlled_non_execution_terminal_state(self):
        document = validate_evidence_document(
            load_fixture("case2_approval_then_policy_block.json")
        )
        execution = document["execution"]
        for stage in ("release", "dispatch", "start"):
            assert execution[stage]["status"] == "known"
            assert execution[stage]["value"]["occurred"] is False
            assert execution[stage]["value"]["at"] is None
        # completion=true with dispatch=false is the controlled terminal.
        assert execution["completion"]["value"]["occurred"] is True
        assert document["outcome"]["value"]["status"] == "not_executed"
        assert document["outcome"]["value"]["reason"] == "policy_blocked"

    def test_schema_holds_block_and_granted_approval_simultaneously(self):
        # The frozen guarantee is expressive, not detective: the schema
        # preserves a granted approval next to a policy block (proven above)
        # and cannot force a producer to keep it. A producer that erases the
        # approval into not_applicable with a source-backed reason remains
        # structurally admissible — history preservation is a producer and
        # profile duty, not a structural constraint the MVP can verify.
        mutated = load_fixture("case2_approval_then_policy_block.json")
        mutated["authorization"] = {
            "status": "not_applicable",
            "value": None,
            "source_ref": "example:event-policy-block",
            "reason": "policy_blocked",
        }
        document = validate_evidence_document(mutated)
        assert document["authorization"]["status"] == "not_applicable"


# ------------------------------------------------------------- CASE 3


class TestCase3ArgumentVariation:
    def test_three_binding_phases_are_distinct(self):
        document = validate_evidence_document(
            load_fixture("case3_argument_variation.json")
        )
        binding = document["argument_binding"]
        requested = binding["requested"]["value"]["digest"]["value"]
        effective = binding["effective"]["value"]["digest"]["value"]
        assert requested != effective  # limit=10 vs limit=5
        assert binding["executed"]["status"] == "unknown"
        assert binding["executed"]["value"] is None
        assert binding["executed"]["reason"] == "no_physical_entry_instrumentation"

    def test_mismatched_authorization_target_is_recordable(self):
        document = validate_evidence_document(
            load_fixture("case3_argument_variation.json")
        )
        match = document["argument_binding"]["authorization_match"]
        assert match["status"] == "known"
        assert match["value"]["result"] == "mismatched"
        assert (
            match["value"]["authorization_target_ref"]
            != match["value"]["effective_target_ref"]
        )
        # the historical approval keeps its original target
        assert (
            document["authorization"]["value"]["target_ref"]
            == "conformance:target-c3-requested"
        )

    def test_arguments_record_needs_snapshot_or_digest(self):
        mutated = load_fixture("case3_argument_variation.json")
        mutated["argument_binding"]["requested"]["value"]["snapshot_ref"] = None
        mutated["argument_binding"]["requested"]["value"]["digest"] = None
        reject(mutated, "snapshot_ref/digest")

    def test_foreign_digest_algorithm_is_rejected(self):
        mutated = load_fixture("case3_argument_variation.json")
        mutated["argument_binding"]["requested"]["value"]["digest"]["algorithm"] = "sha512"
        reject(mutated, "only sha256")


# ------------------------------------------------------------- CASE 4


class TestCase4IdentityUnknown:
    def test_granted_authorization_with_unknown_identity_is_valid(self):
        document = validate_evidence_document(
            load_fixture("case4_identity_unknown.json")
        )
        authorization = document["authorization"]
        assert authorization["value"]["disposition"] == "granted"
        identity = authorization["value"]["identity_provenance"]
        # authorization existence != human attribution
        assert identity["source"] == "unknown"
        assert identity["subject_ref"] is None
        assert identity["reason"] == "legacy_approval_without_attribution"

    def test_requester_identity_unknown_is_valid(self):
        document = validate_evidence_document(
            load_fixture("case4_identity_unknown.json")
        )
        identity = document["request"]["value"]["identity_provenance"]
        assert identity["source"] == "unknown"
        assert identity["reason"] is not None

    def test_trusted_identity_requires_subject_and_provenance(self):
        mutated = load_fixture("case4_identity_unknown.json")
        mutated["authorization"]["value"]["identity_provenance"] = {
            "source": "trusted",
            "subject_ref": None,
            "provenance_ref": None,
            "reason": "claimed",
        }
        reject(mutated, "trusted identity requires a subject_ref")

    def test_unknown_identity_must_not_carry_subject(self):
        mutated = load_fixture("case4_identity_unknown.json")
        mutated["request"]["value"]["identity_provenance"] = {
            "source": "unknown",
            "subject_ref": "caller-claimed:alice",
            "provenance_ref": None,
            "reason": "unverified",
        }
        reject(mutated, "caller-claimed")


# ------------------------------------------------------------- CASE 5


class TestCase5UnknownSemantics:
    def test_unknown_start_is_not_converted_to_false(self):
        document = validate_evidence_document(
            load_fixture("case5_unknown_semantics.json")
        )
        start = document["execution"]["start"]
        assert start["status"] == "unknown"
        assert start["value"] is None  # unknown never becomes occurred=false
        # a sibling evidenced false stays a real false
        dispatch = document["execution"]["dispatch"]
        assert dispatch["value"]["occurred"] is False

    def test_known_outcome_with_status_unknown_is_valid(self):
        document = validate_evidence_document(
            load_fixture("case5_unknown_semantics.json")
        )
        outcome = document["outcome"]
        assert outcome["status"] == "known"
        assert outcome["value"]["status"] == "unknown"
        assert outcome["value"]["reason"] == "terminal_state_persistence_failed"

    def test_error_evaluation_keeps_action_null(self):
        document = validate_evidence_document(
            load_fixture("case5_unknown_semantics.json")
        )
        decision = document["decision"]["value"]
        assert decision["evaluation"] == "error"
        assert decision["action"] is None  # local errors never collapse to block

    def test_unknown_observation_may_point_at_incomplete_source(self):
        document = validate_evidence_document(
            load_fixture("case5_unknown_semantics.json")
        )
        start = document["execution"]["start"]
        assert start["source_ref"] == "conformance:partial-entry-log-c5"
        assert start["reason"] is not None

    def test_not_applicable_is_not_a_missing_field_shortcut(self):
        mutated = load_fixture("case5_unknown_semantics.json")
        mutated["request"]["status"] = "not_applicable"
        reject(mutated, "not allowed here")


# ------------------------------------------------------------- CASE 6


class TestCase6InvalidEvidence:
    def test_missing_required_envelope_field(self):
        mutated = load_fixture("case1_success.json")
        del mutated["recorded_at"]
        reject(mutated, "missing required field")

    def test_missing_required_record_field(self):
        mutated = load_fixture("case1_success.json")
        del mutated["decision"]["value"]["evaluation"]
        reject(mutated, "missing required field")

    def test_wrong_enenum_in_decision_action(self):
        mutated = load_fixture("case1_success.json")
        mutated["decision"]["value"]["action"] = "deny"
        reject(mutated, "allow.*block")

    def test_wrong_enum_in_outcome_status(self):
        mutated = load_fixture("case1_success.json")
        mutated["outcome"]["value"]["status"] = "blocked"
        reject(mutated, "success.*unknown")

    def test_digest_not_hex64(self):
        mutated = load_fixture("case1_success.json")
        mutated["argument_binding"]["requested"]["value"]["digest"]["value"] = (
            "CA502DEC04523CDC33AFECE69A9B600D5B9BD022D453791CC693B6B372F808AD"
        )
        reject(mutated, "64 lowercase hex")

    def test_digest_wrong_length(self):
        mutated = load_fixture("case1_success.json")
        mutated["argument_binding"]["requested"]["value"]["digest"]["value"] = "ca50"
        reject(mutated, "64 lowercase hex")

    def test_known_status_missing_value(self):
        mutated = load_fixture("case1_success.json")
        mutated["decision"]["value"] = None
        reject(mutated, "known observation requires a value")

    def test_unknown_status_carrying_value(self):
        mutated = load_fixture("case5_unknown_semantics.json")
        mutated["execution"]["start"]["value"] = {"occurred": False, "at": None}
        reject(mutated, "unknown must carry value=null")

    def test_known_status_missing_source_ref(self):
        mutated = load_fixture("case1_success.json")
        mutated["decision"]["source_ref"] = None
        reject(mutated, "known observation requires a source_ref")

    def test_known_status_with_reason_is_rejected(self):
        mutated = load_fixture("case1_success.json")
        mutated["decision"]["reason"] = "extra commentary"
        reject(mutated, "known observation must keep reason null")

    def test_occurred_false_with_at_time_is_rejected(self):
        mutated = load_fixture("case2_approval_then_policy_block.json")
        mutated["execution"]["dispatch"]["value"]["at"] = "2026-09-07T10:00:04Z"
        reject(mutated, "occurred=false must keep at null")

    def test_failure_outcome_requires_reason(self):
        mutated = load_fixture("case1_success.json")
        mutated["outcome"]["value"]["status"] = "failure"
        reject(mutated, "requires a non-null reason")

    def test_action_with_error_evaluation_is_rejected(self):
        mutated = load_fixture("case1_success.json")
        mutated["decision"]["value"]["evaluation"] = "error"
        reject(mutated, "action must be null unless evaluation=decided")

    def test_approved_at_with_refused_disposition_is_rejected(self):
        mutated = load_fixture("case1_success.json")
        mutated["authorization"]["value"]["disposition"] = "refused"
        reject(mutated, "approved_at must be null unless disposition=granted")

    def test_wrong_schema_version_is_rejected(self):
        mutated = load_fixture("case1_success.json")
        mutated["schema_version"] = "kerniq.governance-evidence.v0.3"
        reject(mutated, "expected exactly")

    def test_empty_and_whitespace_strings_are_rejected(self):
        mutated = load_fixture("case1_success.json")
        mutated["producer_ref"] = "   "
        reject(mutated, "non-empty and not whitespace-only")

    def test_invalid_timestamp_calendar_is_rejected(self):
        mutated = load_fixture("case1_success.json")
        mutated["recorded_at"] = "2026-13-40T25:61:61Z"
        reject(mutated, "not a real UTC datetime")

    def test_missing_request_correlation_is_rejected(self):
        mutated = load_fixture("case1_success.json")
        value = mutated["request"]["value"]
        value["request_id"] = None
        value["tool_call_id"] = None
        value["attempt_ref"] = None
        reject(mutated, "request_id/tool_call_id/attempt_ref")

    def test_unsupported_top_level_field(self):
        mutated = load_fixture("case1_success.json")
        mutated["revocation"] = {"revoked": True}
        with pytest.raises(UnsupportedFieldError, match="unsupported field"):
            validate_evidence_document(mutated)

    def test_duplicate_json_object_key(self):
        text = (FIXTURES / "case1_success.json").read_text(encoding="utf-8")
        text = text.replace(
            '"evidence_id": "conformance-case-1-success",',
            '"evidence_id": "conformance-case-1-success", '
            '"recorded_at": "1999-01-01T00:00:00Z",',
            1,
        )
        with pytest.raises(EvidenceSchemaError, match="duplicate object key"):
            validate_json_text(text)

    def test_scope_requires_scope_ref(self):
        mutated = load_fixture("case1_success.json")
        mutated["argument_binding"]["scope"]["value"]["scope_ref"] = None
        reject(mutated, "required string is null")


class TestCase6DuplicateEvidenceIdConflict:
    def base(self):
        return load_fixture("case1_success.json")

    def test_same_id_identical_content_reads_idempotently(self):
        first = self.base()
        second = load_fixture("case1_success.json")
        validate_evidence_collection([first, second])

    def test_same_id_different_content_is_a_conflict(self):
        first = self.base()
        conflicting = load_fixture("case1_success.json")
        conflicting["outcome"]["value"]["result_ref"] = "conformance:result-tampered"
        with pytest.raises(EvidenceSchemaError, match="conflicts with a different record"):
            validate_evidence_collection([first, conflicting])

    def test_same_id_different_producer_namespace_is_not_a_conflict(self):
        first = self.base()
        second = load_fixture("case1_success.json")
        second["producer_ref"] = "conformance:other-producer"
        validate_evidence_collection([first, second])

    def test_collection_reports_document_index_on_invalid_member(self):
        broken = load_fixture("case1_success.json")
        del broken["execution"]
        with pytest.raises(EvidenceSchemaError, match=r"document\[0\]"):
            validate_evidence_collection([broken])


# ------------------------------------------------- spec-example conformance


class TestSpecDocumentedExampleIsConformant:
    """The frozen spec's own §4 example must pass its own contract."""

    def test_spec_example_validates(self):
        document = validate_evidence_document(
            load_fixture("case2_approval_then_policy_block.json")
        )
        assert document["evidence_id"] == "example-evidence-2"
        assert document["schema_version"] == "kerniq.governance-evidence.v0.2"
