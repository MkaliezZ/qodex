"""Evidence mapping tests: truth boundary, locators, conformance reuse
(cases 2, 34 and the freeze section 6 mapping table)."""

from __future__ import annotations

import pytest

from kerniq_evidence_conformance import validate_evidence_document

from kerniq_external_validation import langchain_profile as profile
from kerniq_external_validation.source_loader import load_source
from kerniq_external_validation.tests.helpers import TOOL_NAME, write_source
from kerniq_external_validation.validator import validate_source


@pytest.fixture()
def passed(tmp_path):
    src = write_source(tmp_path / "src")
    outcome = validate_source(load_source(src))
    assert outcome.result == "PASS"
    return outcome


def test_mapped_document_is_validated_by_frozen_conformance_validator(passed):
    # re-running the FROZEN validator on the same document must succeed and
    # return the document unmodified (no copied semantics)
    document = validate_evidence_document(passed.evidence_document)
    assert document == passed.evidence_document


def test_request_is_runtime_observation_not_model_request(passed):
    request = passed.evidence_document["request"]["value"]
    assert request["request_id"] is None  # never fabricated
    assert request["action_name"] == TOOL_NAME
    assert request["action_ref"] is None  # display name only
    assert request["identity_provenance"]["source"] == "unknown"
    # namespaced runtime invocation reference, never a model request id
    assert request["attempt_ref"].startswith("langchain-tool-run:")
    assert passed.matched.root_run_id in request["attempt_ref"]
    assert passed.matched.tool_run_id in request["attempt_ref"]


def test_case34_model_request_correlation_not_fabricated(passed):
    document = passed.evidence_document
    assert document["request"]["value"]["request_id"] is None
    assert document["execution"]["start"]["status"] == "unknown"
    lineage = passed.lineage
    assert lineage["level_b_model_correlation"] == "false"
    assert lineage["tool_call_id_origin"]["source_ref"].endswith("/data/output/kwargs/tool_call_id")
    # the frozen taxonomy refuses the model-intent claim
    assert "MODEL_INTENT_PROVENANCE" in profile.CLAIMS_REFUSED
    assert "MODEL_INTENT_PROVENANCE" not in profile.CLAIMS_PROVEN


def test_completion_is_runtime_settlement_only(passed):
    completion = passed.evidence_document["execution"]["completion"]
    assert completion["status"] == "known"
    assert completion["value"] == {"occurred": True, "at": None}
    assert completion["source_ref"].endswith("/data/output/kwargs")


def test_outcome_is_source_reported_success(passed):
    outcome = passed.evidence_document["outcome"]
    assert outcome["status"] == "known"
    assert outcome["value"]["status"] == "success"
    assert outcome["value"]["reason"] is None
    assert outcome["value"]["result_ref"].startswith("langchain-archive:")


def test_requested_args_snapshot_pointer_and_null_digest(passed):
    requested = passed.evidence_document["argument_binding"]["requested"]
    assert requested["status"] == "known"
    value = requested["value"]
    assert value["digest"] is None  # permitted: no new argument digest scheme
    assert value["snapshot_ref"].endswith("#L5#/data/input") or "/data/input" in value["snapshot_ref"]


def test_every_known_field_carries_precise_locator(passed):
    document = passed.evidence_document
    for path in (
        ("request",),
        ("argument_binding", "requested"),
        ("execution", "completion"),
        ("outcome",),
    ):
        node = document
        for key in path:
            node = node[key]
        ref = node["source_ref"]
        assert ref.startswith("langchain-archive:") and "#L" in ref and "#" in ref.split("#L", 1)[1]


def test_correlation_key_is_digest_root_tool_triple(passed):
    key = passed.lineage["correlation_key"]
    assert key["source_digest"] == passed.source_digest
    assert key["root_run_id"] == passed.matched.root_run_id
    assert key["tool_run_id"] == passed.matched.tool_run_id
