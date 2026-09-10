"""External pilot kit v0.1 tests (synthetic unit tests; no network).

Real-provider proof is the separate dry run / fresh-clone usability journey,
never a mock substitution. These tests cover the tool contract, the pilot
entry observation, artifact privacy/digest semantics, verifier invariants and
the check/run refusal paths using a fake governed backend that reuses the
real Invocation/RunResult records."""

from __future__ import annotations

import asyncio
import hashlib
import json
from dataclasses import asdict
from pathlib import Path
from typing import Any, Callable

import pytest

agent_framework = pytest.importorskip("agent_framework")  # noqa: F841 - lane gate

from kerniq_microsoft_agent_framework import pilot, pilot_artifact
from kerniq_microsoft_agent_framework.backend import Invocation, RunResult, TOOL_NAME, now
from kerniq_microsoft_agent_framework.evidence import project
from kerniq_microsoft_agent_framework.pilot import (
    PilotObservedTool,
    PilotRefused,
    import_user_tool,
)
from kerniq_microsoft_agent_framework.pilot_artifact import (
    ArtifactRejected,
    build_envelope,
    canonical_bytes,
    compute_digest,
    privacy_scan,
    verify_artifact_file,
    write_artifact,
)

PROBE_VALUE = "kerniq-v0-8"


# --- helpers ---------------------------------------------------------------------


def _decision(action: str) -> dict[str, Any]:
    return {
        "action": action,
        "policy_id": "policy:pilot-fixture",
        "evidence": {"record_id": "record:pilot-fixture"},
    }


def _make_record(*, block: bool, executed: bool, outcome: str | None = None) -> Invocation:
    record = Invocation(
        request_id="maf-request-pilot" + hashlib.sha256(now().encode()).hexdigest()[:8],
        call_id="call_00_pilotfixture000000000000000000",
        occurrence_id="occur_pilot_fixture",
        run_id="maf-run-pilotfixture",
        effective_digest=hashlib.sha256(
            json.dumps({"value": PROBE_VALUE}, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest(),
        parent_call_id=None,
    )
    record.event("request")
    record.decision = _decision("block" if block else "allow")
    record.event("decision")
    if block:
        record.outcome = "not_executed"
        record.reason = "agentfuse_policy_block"
        record.event("blocked")
    else:
        record.event("release")
        record.event("dispatch")
        record.event("start")
        record.executed_digest = record.effective_digest
        record.outcome = outcome or "success"
        record.reason = "" if record.outcome == "success" else "physical_handler_RuntimeError"
        record.event("completion")
    record.event("closed")
    return record


class FakeGovernedBackend:
    """Reuses the real record semantics without a provider/MAF run."""

    def __init__(self, *, handler_raises: bool = False, executed_mismatch: bool = False) -> None:
        self.handler_raises = handler_raises
        self.executed_mismatch = executed_mismatch
        self.start_task_calls = 0

    async def start_task(self, client: Any, handler: Callable, *, block: bool, delegated: bool = False) -> RunResult:
        self.start_task_calls += 1
        record = _make_record(block=block, executed=not block)
        if not block:
            if self.executed_mismatch:
                record.executed_digest = "0" * 64
            try:
                await handler(PROBE_VALUE)
            except RuntimeError:
                record.outcome = "failure"
                record.reason = "physical_handler_RuntimeError"
        class _Response:
            response_id = "resp_pilot_fixture"
            text = "fixture"
        return RunResult(record.run_id, [record], _Response(), [])


class _NullClient:
    pass


def _client_factory():
    return _NullClient()


async def _user_tool_ok(value: str) -> str:
    return "digested:" + hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]


async def _user_tool_raises(value: str) -> str:
    raise RuntimeError("business failure")


def _tmp_user_module(tmp_path: Path, source: str) -> str:
    import uuid

    name = "user_tools_" + uuid.uuid4().hex[:10]
    (tmp_path / (name + ".py")).write_text(source, encoding="utf-8")
    return name


async def _envelope(tmp_path: Path, *, handler_raises: bool = False, executed_mismatch: bool = False) -> dict:
    backend = FakeGovernedBackend(handler_raises=handler_raises, executed_mismatch=executed_mismatch)
    block_case = await pilot._run_case(backend, _client_factory, _user_tool_ok, block=True)
    allow_case = await pilot._run_case(backend, _client_factory, _user_tool_ok if not handler_raises else _user_tool_raises, block=False)
    return build_envelope(
        created_at="2026-09-10T00:00:00Z",
        kerniq_commit="0" * 40,
        package_versions={
            "agent-framework-core": "1.17.0", "agent-framework-openai": "1.14.2",
            "openai": "3.11.0", "pydantic": "2.13.5",
        },
        tool_import_identifier="user_tools:pilot_tool",
        block_case=block_case,
        allow_case=allow_case,
        self_reported_label=None,
    )


def _envelope_sync(tmp_path: Path, **kwargs) -> dict:
    return asyncio.run(_envelope(tmp_path, **kwargs))


def _write_verified_artifact(tmp_path: Path, envelope: dict) -> Path:
    path = tmp_path / "artifact.json"
    write_artifact(envelope, path)
    return path


def _rewrite(path: Path, mutate: Callable[[dict], None]) -> None:
    artifact = json.loads(path.read_text("utf-8"))
    mutate(artifact)
    artifact[pilot_artifact.DIGEST_KEY]["value"] = compute_digest(artifact)
    path.write_bytes(canonical_bytes(artifact) + b"\n")


# --- Tool import contract (cases 6-8) ----------------------------------------------


def test_case6_invalid_tool_import_refused(tmp_path, monkeypatch):
    monkeypatch.syspath_prepend(str(tmp_path))
    with pytest.raises(PilotRefused, match="TOOL_IMPORT_MALFORMED"):
        import_user_tool("no-colon-here")
    with pytest.raises(PilotRefused, match="TOOL_IMPORT_FAILED"):
        import_user_tool("definitely_missing_module:fn")


def test_case7_sync_function_refused(tmp_path, monkeypatch):
    monkeypatch.syspath_prepend(str(tmp_path))
    module = _tmp_user_module(tmp_path, "def pilot_tool(value: str) -> str:\n    return value\n")
    with pytest.raises(PilotRefused, match="TOOL_NOT_ASYNC"):
        import_user_tool(module + ":pilot_tool")


@pytest.mark.parametrize(
    "source,reason",
    [
        ("async def pilot_tool(a: str, b: str) -> str:\n    return a\n", "TOOL_SIGNATURE_UNSUPPORTED"),
        ("async def pilot_tool(value: int) -> str:\n    return 'x'\n", "TOOL_VALUE_NOT_STR"),
        ("async def pilot_tool(value) -> str:\n    return 'x'\n", "TOOL_VALUE_ANNOTATION_MISSING"),
        ("async def pilot_tool(value: str) -> int:\n    return 1\n", "TOOL_RETURN_UNSUPPORTED"),
        ("pilot_tool = 42\n", "TOOL_NOT_CALLABLE"),
        ("other_name = None\n", "TOOL_ATTRIBUTE_MISSING"),
    ],
)
def test_case8_unsupported_signatures_refused(tmp_path, monkeypatch, source, reason):
    monkeypatch.syspath_prepend(str(tmp_path))
    module = _tmp_user_module(tmp_path, source)
    with pytest.raises(PilotRefused, match=reason):
        import_user_tool(module + ":pilot_tool")


def test_valid_tool_imports_with_missing_return_warning(tmp_path, monkeypatch):
    monkeypatch.syspath_prepend(str(tmp_path))
    module = _tmp_user_module(tmp_path, "async def pilot_tool(value: str):\n    return 'ok'\n")
    func, warning = import_user_tool(module + ":pilot_tool")
    assert asyncio_iscoroutine(func)
    assert warning == "TOOL_RETURN_ANNOTATION_MISSING_RUNTIME_CHECKED"


def asyncio_iscoroutine(func) -> bool:
    import asyncio

    return asyncio.iscoroutinefunction(func)


# --- Pilot entry observation (cases 9-11, 22) ----------------------------------------


def test_case9_10_block_means_no_user_handler_entry_and_no_marker(tmp_path):
    backend = FakeGovernedBackend()
    case = asyncio.run(pilot._run_case(backend, _client_factory, _user_tool_ok, block=True))
    assert case["decision"] == "block"
    assert case["bound_handler_entry_count"] == 0
    assert case["pilot_entry_marker_exists"] is False
    assert case["outcome"] == "not_executed"
    assert case["release_occurred"] is False and case["dispatch_occurred"] is False and case["start_occurred"] is False


def test_case11_allow_means_exactly_one_entry(tmp_path):
    backend = FakeGovernedBackend()
    case = asyncio.run(pilot._run_case(backend, _client_factory, _user_tool_ok, block=False))
    assert case["decision"] == "allow"
    assert case["bound_handler_entry_count"] == 1
    assert case["pilot_entry_marker_exists"] is True
    assert case["pilot_entry_marker_line_count"] == 1
    assert case["outcome"] == "success"
    assert case["handler_return_status"] == "SUCCESS"
    assert case["result_type"] == "str"
    assert case["result_sha256"]


def test_case22_no_automatic_retry(tmp_path):
    backend = FakeGovernedBackend(handler_raises=True)
    # the user tool raised: the pilot refuses instead of producing a complete
    # ALLOW case, and never retries (exactly one start_task / one entry)
    with pytest.raises(PilotRefused, match="ALLOW_INVARIANT_OUTCOME_SUCCESS_REQUIRED"):
        asyncio.run(pilot._run_case(backend, _client_factory, _user_tool_raises, block=False))
    assert backend.start_task_calls == 1  # one operation, no pilot retry


def test_case14_handler_failure_is_not_a_complete_pilot(tmp_path):
    # Decision != Outcome remains a proven fact of the underlying MAF
    # governance lane (covered by the governance suite); but pilot v0.1
    # refuses to build a complete ALLOW case from a failed user-tool run,
    # matching the real backend which surfaces MiddlewareFailure.
    backend = FakeGovernedBackend(handler_raises=True)
    with pytest.raises(PilotRefused, match="ALLOW_INVARIANT_OUTCOME_SUCCESS_REQUIRED"):
        asyncio.run(pilot._run_case(backend, _client_factory, _user_tool_raises, block=False))


def test_case15_effective_executed_binding_enforced(tmp_path):
    backend = FakeGovernedBackend(executed_mismatch=True)
    with pytest.raises(PilotRefused, match="ALLOW_INVARIANT_ARGUMENT_BINDING"):
        asyncio.run(pilot._run_case(backend, _client_factory, _user_tool_ok, block=False))


def test_observed_tool_rejects_non_string_return(tmp_path):
    observed = PilotObservedTool(_user_tool_ok, tmp_path)

    async def bad_tool(value: str) -> str:
        return 42  # type: ignore[return-value]

    observed.user_tool = bad_tool
    with pytest.raises(TypeError):
        asyncio.run(observed(PROBE_VALUE))
    assert observed.entries == 1 and observed.marker.exists()


# --- Artifact: privacy, digest, verify (cases 16-21) ------------------------------------


def test_case16_artifact_contains_no_raw_args_or_results(tmp_path):
    envelope = _envelope_sync(tmp_path)
    text = canonical_bytes(envelope).decode("utf-8")
    assert PROBE_VALUE not in text  # raw tool argument value
    assert "digested:" not in text  # raw tool result body
    assert envelope["tool"] == {
        "import_identifier": "user_tools:pilot_tool",
        "identifier_digest": "sha256:" + hashlib.sha256(b"user_tools:pilot_tool").hexdigest(),
    }


def test_valid_artifact_verifies(tmp_path):
    envelope = _envelope_sync(tmp_path)
    path = _write_verified_artifact(tmp_path, envelope)
    assert path.read_bytes() == canonical_bytes(envelope) + b"\n"
    status, reason = verify_artifact_file(path)
    assert status == "VERIFIED", reason


def test_case17_artifact_digest_mutation_rejected(tmp_path):
    path = _write_verified_artifact(tmp_path, _envelope_sync(tmp_path))
    artifact = json.loads(path.read_text("utf-8"))
    artifact["artifact_digest"]["value"] = "0" * 64
    path.write_bytes(canonical_bytes(artifact) + b"\n")
    status, reason = verify_artifact_file(path)
    assert status == "REJECTED" and "DIGEST_MISMATCH" in reason


def test_case18_forged_block_state_rejected(tmp_path):
    path = _write_verified_artifact(tmp_path, _envelope_sync(tmp_path))
    _rewrite(path, lambda artifact: artifact["block_case"].update(bound_handler_entry_count=1))
    status, reason = verify_artifact_file(path)
    assert status == "REJECTED" and "ENTRY_COUNT_NOT_ZERO" in reason


def test_case19_forged_allow_state_rejected(tmp_path):
    path = _write_verified_artifact(tmp_path, _envelope_sync(tmp_path))
    _rewrite(path, lambda artifact: artifact["allow_case"].update(executed_args_digest="0" * 64))
    status, reason = verify_artifact_file(path)
    assert status == "REJECTED" and "DIGEST_MISMATCH" in reason or "MISMATCH" in str(reason)


def test_case20_malformed_json_rejected(tmp_path):
    path = tmp_path / "broken.json"
    path.write_bytes(b'{"artifact_version": "0.1",\n')
    status, reason = verify_artifact_file(path)
    assert status == "REJECTED" and "MALFORMED_JSON" in reason


def test_duplicate_json_key_rejected(tmp_path):
    path = tmp_path / "dup.json"
    path.write_bytes(b'{"a":1,"a":1}\n')
    status, reason = verify_artifact_file(path)
    assert status == "REJECTED" and "DUPLICATE_JSON_KEY" in reason


def test_non_canonical_and_missing_lf_rejected(tmp_path):
    path = tmp_path / "spacing.json"
    path.write_bytes(b'{"a": 1}\n')  # valid JSON, non-canonical spacing
    status, reason = verify_artifact_file(path)
    assert status == "REJECTED" and "NON_CANONICAL_BYTES" in reason
    path2 = tmp_path / "nolf.json"
    path2.write_bytes(b'{"a":1}')
    status, reason = verify_artifact_file(path2)
    assert status == "REJECTED" and "FINAL_LF" in reason


def test_case21_evidence_v0_2_documents_validate_and_tamper_rejected(tmp_path):
    envelope = _envelope_sync(tmp_path)
    validate = __import__("kerniq_evidence_conformance", fromlist=["validate_evidence_document"]).validate_evidence_document
    validate(envelope["block_case"]["evidence_v0_2"])
    validate(envelope["allow_case"]["evidence_v0_2"])
    path = _write_verified_artifact(tmp_path, envelope)
    # not_executed outcomes require a non-empty reason under the frozen schema;
    # clearing it is an Evidence-level tamper the verifier must reject
    def _clear_reason(artifact):
        artifact["block_case"]["evidence_v0_2"]["outcome"]["value"]["reason"] = None
    _rewrite(path, _clear_reason)
    status, reason = verify_artifact_file(path)
    assert status == "REJECTED"


def test_decision_outcome_separation_enforced(tmp_path):
    path = _write_verified_artifact(tmp_path, _envelope_sync(tmp_path))
    # a policy BLOCK rewritten as an execution failure is decision/outcome conflation
    _rewrite(path, lambda artifact: artifact["block_case"]["evidence_v0_2"]["outcome"].update(status="failure"))
    status, reason = verify_artifact_file(path)
    assert status == "REJECTED"


def test_privacy_scan_refuses_secrets():
    assert privacy_scan("token sk-abcdefghij0123456789abcdefghij") is not None
    assert privacy_scan("Bearer abcdefghijklmnopqrstuvwxyz012345") is not None
    assert privacy_scan("-----BEGIN RSA PRIVATE KEY-----") is not None
    assert privacy_scan("clean text") is None
    assert privacy_scan("contains s3cretvalue inline", environment_values=["s3cretvalue"]) is not None


def test_write_artifact_refuses_when_credential_present(tmp_path, monkeypatch):
    envelope = _envelope_sync(tmp_path)
    envelope["self_reported_label"] = "sk-abcdefghij0123456789abcdefghij"  # smuggled secret
    envelope[pilot_artifact.DIGEST_KEY]["value"] = compute_digest(envelope)
    with pytest.raises(ArtifactRejected, match="REFUSE_ARTIFACT_WRITE"):
        write_artifact(envelope, tmp_path / "x.json")


# --- check command refusal paths (cases 1-5) ------------------------------------------------


def _check_args(tool="user_tools:pilot_tool", output=None):
    import argparse

    return argparse.Namespace(tool=tool, output=output)


def _patch_qualification(monkeypatch, exc: Exception | None):
    import kerniq_microsoft_agent_framework.qualification as qualification

    if exc is None:
        monkeypatch.setattr(qualification, "qualify_framework", lambda: None)
    else:
        def _raise():
            raise exc
        monkeypatch.setattr(qualification, "qualify_framework", _raise)
    monkeypatch.setattr(qualification, "load_agentfuse", lambda root: None)


def test_case1_check_pass(tmp_path, monkeypatch):
    monkeypatch.syspath_prepend(str(tmp_path))
    module = _tmp_user_module(tmp_path, "async def pilot_tool(value: str) -> str:\n    return value\n")
    _patch_qualification(monkeypatch, None)
    monkeypatch.setenv("KERNIQ_AGENTFUSE_SOURCE", str(tmp_path))
    monkeypatch.setenv("DEEPSEEK_API_KEY", "dummy-present")
    import io
    import contextlib

    buffer = io.StringIO()
    with contextlib.redirect_stdout(buffer):
        rc = pilot.run_check(_check_args(tool=module + ":pilot_tool", output=str(tmp_path / "a.json")))
    assert rc == 0, buffer.getvalue()
    assert "PILOT_CHECK=PASS" in buffer.getvalue()


def test_case2_wrong_maf_version_refused(tmp_path, monkeypatch):
    _patch_qualification(monkeypatch, ValueError("unqualified_package:agent-framework-core"))
    monkeypatch.delenv("KERNIQ_AGENTFUSE_SOURCE", raising=False)
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    import contextlib
    import io

    buffer = io.StringIO()
    with contextlib.redirect_stdout(buffer):
        rc = pilot.run_check(_check_args())
    assert rc == 2
    assert "REASON=UNQUALIFIED_PACKAGE:agent-framework-core" in buffer.getvalue()


def test_case3_source_hash_mismatch_refused(tmp_path, monkeypatch):
    _patch_qualification(monkeypatch, ValueError("unqualified_source:_tools.py"))
    monkeypatch.delenv("KERNIQ_AGENTFUSE_SOURCE", raising=False)
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    import contextlib
    import io

    buffer = io.StringIO()
    with contextlib.redirect_stdout(buffer):
        rc = pilot.run_check(_check_args())
    assert rc == 2
    assert "REASON=UNQUALIFIED_MAF_SOURCE:_tools.py" in buffer.getvalue()


def test_case4_missing_agentfuse_source_refused(tmp_path, monkeypatch):
    _patch_qualification(monkeypatch, None)
    monkeypatch.delenv("KERNIQ_AGENTFUSE_SOURCE", raising=False)
    monkeypatch.setenv("DEEPSEEK_API_KEY", "dummy")
    import contextlib
    import io

    buffer = io.StringIO()
    with contextlib.redirect_stdout(buffer):
        rc = pilot.run_check(_check_args())
    assert rc == 2
    assert "REASON=AGENTFUSE_SOURCE_MISSING" in buffer.getvalue()


def test_case5_missing_provider_credential_refused(tmp_path, monkeypatch):
    _patch_qualification(monkeypatch, None)
    monkeypatch.setenv("KERNIQ_AGENTFUSE_SOURCE", str(tmp_path))
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    import contextlib
    import io

    buffer = io.StringIO()
    with contextlib.redirect_stdout(buffer):
        rc = pilot.run_check(_check_args())
    assert rc == 2
    assert "REASON=PROVIDER_CREDENTIAL_MISSING" in buffer.getvalue()


def test_case12_allow_requires_explicit_acknowledgement_flag():
    parser = pilot._build_parser()
    args = parser.parse_args(["run", "--tool", "m:f", "--output", "a.json"])
    assert args.i_understand_allow_executes_tool is False
    args = parser.parse_args(["run", "--tool", "m:f", "--output", "a.json", "--i-understand-allow-executes-tool"])
    assert args.i_understand_allow_executes_tool is True


def test_run_refuses_existing_artifact_without_overwrite(tmp_path, monkeypatch):
    output = tmp_path / "exists.json"
    output.write_text("{}")
    monkeypatch.setattr(pilot.asyncio, "run", lambda coro: (_close(coro), 0)[1])
    import contextlib
    import io

    buffer = io.StringIO()
    with contextlib.redirect_stdout(buffer):
        rc = pilot.main(["run", "--tool", "m:f", "--output", str(output)])
    assert rc == 2
    assert "REASON=ARTIFACT_ALREADY_EXISTS" in buffer.getvalue()


def _close(coro):
    coro.close()


# --- Verifier truth-boundary closure -------------------------------------------------
# Exact frozen qualification metadata, complete-vs-partial artifacts, and
# case↔Evidence cross-field binding. Forgeries recompute the artifact digest
# (attacker-friendly) so the refusal must come from the semantic checks.


def _forged(tmp_path: Path, envelope: dict, mutate) -> Path:
    path = tmp_path / ("forged-" + hashlib.sha256(repr(mutate).encode()).hexdigest()[:8] + ".json")
    artifact = json.loads(canonical_bytes(envelope).decode("utf-8"))
    mutate(artifact)
    artifact[pilot_artifact.DIGEST_KEY]["value"] = compute_digest(artifact)
    path.write_bytes(canonical_bytes(artifact) + b"\n")
    return path


@pytest.mark.parametrize(
    "package",
    ["agent-framework-core", "agent-framework-openai", "openai", "pydantic"],
)
def test_closure_1_4_wrong_package_version_rejected(tmp_path, package):
    envelope = _envelope_sync(tmp_path)
    path = _forged(tmp_path, envelope, lambda artifact: artifact["package_versions"].update({package: "9.9.9"}))
    status, reason = verify_artifact_file(path)
    assert status == "REJECTED"
    assert reason == "QUALIFICATION_PACKAGE_VERSION_MISMATCH:" + package


def test_closure_5_provider_changed_rejected(tmp_path):
    envelope = _envelope_sync(tmp_path)
    path = _forged(tmp_path, envelope, lambda artifact: artifact.update(provider="openai-official"))
    status, reason = verify_artifact_file(path)
    assert (status, reason) == ("REJECTED", "PROVIDER_MISMATCH")


def test_closure_6_requested_model_changed_rejected(tmp_path):
    envelope = _envelope_sync(tmp_path)
    path = _forged(tmp_path, envelope, lambda artifact: artifact.update(requested_model="deepseek-chat"))
    status, reason = verify_artifact_file(path)
    assert (status, reason) == ("REJECTED", "REQUESTED_MODEL_MISMATCH")


def test_closure_7_tool_identifier_digest_forged_rejected(tmp_path):
    envelope = _envelope_sync(tmp_path)
    path = _forged(
        tmp_path, envelope,
        lambda artifact: artifact["tool"].update(identifier_digest="sha256:" + "0" * 64),
    )
    status, reason = verify_artifact_file(path)
    assert (status, reason) == ("REJECTED", "TOOL_IDENTIFIER_DIGEST_MISMATCH")


def test_closure_8_block_only_artifact_is_incomplete_not_verified(tmp_path):
    envelope = _envelope_sync(tmp_path)
    envelope["allow_case"] = {"status": "not_run", "reason": "allow_acknowledgement_missing"}
    envelope[pilot_artifact.DIGEST_KEY]["value"] = compute_digest(envelope)
    path = tmp_path / "block-only.json"
    write_artifact(envelope, path)
    status, reason = verify_artifact_file(path)
    assert (status, reason) == ("INCOMPLETE", "ALLOW_CASE_NOT_RUN")
    # the CLI must not exit 0 for an INCOMPLETE artifact
    import contextlib
    import io

    buffer = io.StringIO()
    with contextlib.redirect_stdout(buffer):
        rc = pilot.main(["verify", str(path)])
    assert rc != 0
    assert "VERIFY_RESULT=INCOMPLETE" in buffer.getvalue()


def test_closure_9_complete_block_allow_verifies(tmp_path):
    status, reason = verify_artifact_file(_write_verified_artifact(tmp_path, _envelope_sync(tmp_path)))
    assert (status, reason) == ("VERIFIED", None)


def test_closure_10_case_decision_differs_from_evidence_rejected(tmp_path):
    envelope = _envelope_sync(tmp_path)

    def mutate(artifact):
        artifact["block_case"]["decision"] = "allow"  # case says allow...
        # ...while every other invariant keeps describing the real BLOCK run

    path = _forged(tmp_path, envelope, mutate)
    status, reason = verify_artifact_file(path)
    assert status == "REJECTED"
    assert "CASE_EVIDENCE_DECISION_MISMATCH" in reason or "BLOCK_CASE" in reason


def test_closure_11_case_outcome_differs_from_evidence_rejected(tmp_path):
    envelope = _envelope_sync(tmp_path)

    def mutate(artifact):
        artifact["allow_case"]["outcome"] = "failure"
        artifact["allow_case"]["handler_return_status"] = "FAILURE"

    path = _forged(tmp_path, envelope, mutate)
    status, reason = verify_artifact_file(path)
    assert status == "REJECTED"
    assert "CASE_EVIDENCE_OUTCOME_MISMATCH" in reason or "ALLOW_OUTCOME_NOT_SUCCESS" in reason


def test_closure_12_effective_digest_differs_from_evidence_rejected(tmp_path):
    envelope = _envelope_sync(tmp_path)
    path = _forged(
        tmp_path, envelope,
        lambda artifact: artifact["block_case"].update(effective_args_digest="1" * 64),
    )
    status, reason = verify_artifact_file(path)
    assert status == "REJECTED"
    assert reason == "CASE_EVIDENCE_EFFECTIVE_DIGEST_MISMATCH"


def test_closure_13_allow_executed_digest_differs_from_evidence_rejected(tmp_path):
    envelope = _envelope_sync(tmp_path)

    def mutate(artifact):
        # keep case-internal equality but diverge from the embedded Evidence
        digest = "2" * 64
        artifact["allow_case"]["executed_args_digest"] = digest
        artifact["allow_case"]["effective_args_digest"] = digest

    path = _forged(tmp_path, envelope, mutate)
    status, reason = verify_artifact_file(path)
    assert status == "REJECTED"
    assert "CASE_EVIDENCE_EXECUTED_DIGEST_MISMATCH" in reason or "CASE_EVIDENCE_EFFECTIVE_DIGEST_MISMATCH" in reason


def test_closure_block_executed_status_must_be_not_applicable(tmp_path):
    envelope = _envelope_sync(tmp_path)

    def mutate(artifact):
        # forged BLOCK case claiming executed args were observed
        artifact["block_case"]["executed_args_digest"] = "3" * 64

    path = _forged(tmp_path, envelope, mutate)
    status, reason = verify_artifact_file(path)
    assert status == "REJECTED"
    assert "BLOCK_CASE_EXECUTED_DIGEST_PRESENT" in reason


def test_closure_14_readme_states_allow_failure_is_not_complete():
    content = (KerniQ_root() / "docs" / "development" / "kerniq_maf_external_pilot_v0_1.md").read_text("utf-8")
    assert "INCOMPLETE" in content
    assert "does not count as a complete pilot" in content or "not count as a complete" in content
    assert "operator identity" in content or "authorship" in content


def KerniQ_root() -> Path:
    return Path(__file__).resolve().parents[3]


def test_closure_parity_expected_versions_mirror_qualification_pins():
    # The core pin is taken directly from qualification.MAF_VERSION (single
    # truth by import). The three mirrored literal pins must appear verbatim
    # in qualification.qualify_framework's source; this fails if either side
    # drifts.
    import inspect

    import kerniq_microsoft_agent_framework.qualification as qualification

    assert pilot_artifact.EXPECTED_PACKAGE_VERSIONS["agent-framework-core"] == qualification.MAF_VERSION
    source = inspect.getsource(qualification.qualify_framework)
    for package in ("agent-framework-openai", "openai", "pydantic"):
        expected = pilot_artifact.EXPECTED_PACKAGE_VERSIONS[package]
        assert '"' + expected + '"' in source, (package, expected)


def test_closure_verify_docstring_disclaims_authenticity():
    import inspect

    docstring = inspect.getdoc(pilot_artifact.verify_artifact_file)
    assert "does NOT cryptographically prove" in docstring
    assert "attest" in docstring
