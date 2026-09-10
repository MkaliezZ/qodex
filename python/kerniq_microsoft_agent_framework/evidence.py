"""Project only local adapter observations into the frozen Evidence v0.2."""
from typing import Any
from kerniq_evidence_conformance import SCHEMA_VERSION, validate_evidence_document
from .backend import Invocation, TOOL_NAME, now
from .qualification import PROFILE


def project(record: Invocation) -> dict[str, Any]:
    if not record.events or record.events[-1]["phase"] != "closed":
        raise ValueError("open_invocation_has_no_final_non_occurrence_evidence")
    ref = "maf-local-observation:" + record.request_id
    def unknown(reason: str) -> dict[str, Any]:
        return {"status": "unknown", "value": None, "source_ref": None, "reason": reason}
    def known(value: dict[str, Any], phase: str) -> dict[str, Any]:
        return {"status": "known", "value": value, "source_ref": ref + "#" + phase, "reason": None}
    tool_ref = PROFILE + ":" + TOOL_NAME
    scope_ref = record.run_id
    def arguments(digest: str, phase: str) -> dict[str, Any]:
        return known({"snapshot_ref": None, "tool_ref": tool_ref, "scope_ref": scope_ref,
                      "digest": {"algorithm": "sha256", "representation": "utf8-json-exact-v1",
                                 "value": digest}}, phase)
    phases = {event["phase"]: event["at"] for event in record.events}
    decision = record.decision
    document = {
        "schema_version": SCHEMA_VERSION, "evidence_id": record.request_id,
        "producer_ref": "kerniq:maf-local-function-adapter-v0.8", "profile_ref": PROFILE,
        "recorded_at": now(), "previous_evidence_ref": None,
        "request": known({
            "request_id": record.request_id, "tool_call_id": record.call_id,
            "attempt_ref": record.occurrence_id, "runtime_ref": record.run_id,
            "action_name": TOOL_NAME, "action_ref": tool_ref,
            "identity_provenance": {"source": "unknown", "subject_ref": None,
                                   "provenance_ref": None, "reason": "no_authenticated_requester"},
        }, "request"),
        "decision": known({
            "decision_id": decision["evidence"]["record_id"], "evaluation": "decided",
            "action": decision["action"], "policy_ref": decision["policy_id"],
            "target_ref": "sha256:" + record.effective_digest, "decided_at": phases["decision"],
        }, "decision") if decision else unknown("no_valid_bound_decision"),
        "authorization": unknown("policy_decision_is_not_human_authorization"),
        "argument_binding": {
            "requested": unknown("context_is_validated_effective_args_not_exact_model_request"),
            "effective": arguments(record.effective_digest, "request"),
            "executed": arguments(record.executed_digest, "start") if record.executed_digest else {
                "status": "not_applicable", "value": None, "source_ref": ref, "reason": record.reason},
            "scope": known({"scope_ref": scope_ref, "runtime_ref": record.run_id,
                            "context_ref": record.run_id, "resource_refs": None,
                            "operation": "local_custom_function"}, "request"),
            "authorization_match": unknown("no_authorization_to_attribute"),
        },
        "execution": {stage: known({"occurred": stage in phases, "at": phases.get(stage)},
                                  stage if stage in phases else "closed")
                      for stage in ("release", "dispatch", "start", "completion")},
        "outcome": known({"status": record.outcome, "reason": record.reason or None,
                          "result_ref": ref + "#completion" if record.outcome == "success" else None},
                         "closed"),
    }
    validate_evidence_document(document)
    return document
