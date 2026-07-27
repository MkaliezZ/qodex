from __future__ import annotations

import io
import json
import os
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

from python.kerniq_agentfuse_bridge.service import (
    BRIDGE_PROTOCOL_VERSION,
    BridgeService,
    CanonicalAgentFuse,
    run_loop,
)


COMMIT = "ec4b5842339dccfba0db62df7541920759203bc9"
NOW = "2026-07-24T00:00:00.000Z"
PROJECT_PROFILE = "kerniq-project-command-v1"
PROJECT_POLICY_DIGEST = (
    "sha256:9c01df377b0cfd8db8392dc8966a2f12"
    "b38ad1b2ab9c89780ac049ac0eed38ad"
)
SHA_A = f"sha256:{'a' * 64}"
SHA_B = f"sha256:{'b' * 64}"
SHA_C = f"sha256:{'c' * 64}"


class FakeDecision:
    def __init__(self, action: str) -> None:
        self.action = action
        self.reason_code = "allowed" if action == "allow" else "explicit_denylist"
        self.evidence = FakeEvidence(action)


class FakeEvidence:
    def __init__(self, decision: str) -> None:
        self.decision = decision

    def to_dict(self) -> dict[str, object]:
        return {
            "record_id": f"evidence-{self.decision}",
            "schema_version": "agentfuse-evidence-schema-v0.1",
            "boundary_decision": {"decision": self.decision},
        }


class FakeToolCall:
    def __init__(self, **values: object) -> None:
        self.values = values


class FakeGuard:
    evaluate_calls = 0
    invoke_calls = 0
    last_tool_call: FakeToolCall | None = None

    def __init__(
        self,
        allow_tools=None,
        deny_tools=None,
        default_action="block",
        policy=None,
    ) -> None:
        self.allowed = bool(allow_tools) and not bool(deny_tools)
        self.default_action = default_action
        self.policy = policy

    def evaluate(self, tool_call: FakeToolCall) -> FakeDecision:
        type(self).evaluate_calls += 1
        type(self).last_tool_call = tool_call
        if self.policy is not None:
            return FakeDecision(self.policy(SimpleNamespace(**tool_call.values)))
        return FakeDecision("allow" if self.allowed else "block")

    async def aevaluate(self, tool_call: FakeToolCall) -> FakeDecision:
        return self.evaluate(tool_call)

    def invoke(self, **_values: object) -> None:
        type(self).invoke_calls += 1
        raise AssertionError("The decision bridge must not invoke a handler.")


def canonical() -> CanonicalAgentFuse:
    FakeGuard.evaluate_calls = 0
    FakeGuard.invoke_calls = 0
    FakeGuard.last_tool_call = None
    return CanonicalAgentFuse(
        runtime_guard=SimpleNamespace(
            RuntimeGuard=FakeGuard,
            RuntimeGuardDecision=FakeDecision,
            ToolCallRequest=FakeToolCall,
        ),
        evidence_schema=SimpleNamespace(
            SCHEMA_VERSION="agentfuse-evidence-schema-v0.1",
        ),
        package_version="3.6.0",
        source_commit=COMMIT,
    )


def message(message_id: str, message_type: str, payload: dict[str, object]) -> str:
    return json.dumps({
        "protocolVersion": BRIDGE_PROTOCOL_VERSION,
        "messageId": message_id,
        "messageType": message_type,
        "payload": payload,
    })


def decision_payload(fixture: str) -> dict[str, object]:
    return {
        "proposal": {
            "schemaVersion": "kerniq.action.v1",
            "actionId": "action-1",
            "taskId": "task-1",
            "sessionId": "session-1",
            "actionType": "kerniq.proof.increment-counter",
            "title": "Proof",
            "summary": "Proof",
            "risk": "write",
            "parameters": {
                "sandboxId": "sandbox-1",
                "markerName": "counter",
                "contentDigest": "sha256:fixture",
            },
            "requestedAt": NOW,
            "proposalDigest": "sha256:proposal",
        },
        "approval": {
            "approvalId": "approval-1",
            "actionId": "action-1",
            "taskId": "task-1",
            "proposalDigest": "sha256:proposal",
            "generation": 1,
            "approvedAt": NOW,
            "expiresAt": "2026-07-24T00:10:00.000Z",
        },
        "policyFixtureId": fixture,
        "requestedDecisionAt": NOW,
    }


def project_command_payload() -> dict[str, object]:
    return {
        "proposal": {
            "schemaVersion": "kerniq.action.v1",
            "actionId": "command-action-1",
            "taskId": "task-1",
            "sessionId": "session-1",
            "actionType": "kerniq.project-command.run",
            "title": "Run project tests",
            "summary": "Run trusted project command.",
            "risk": "process",
            "parameters": {
                "commandId": "package:test",
                "catalogDigest": SHA_A,
                "commandCategory": "test",
                "projectBindingId": "project-1",
                "projectFingerprint": SHA_B,
                "policyProfileId": PROJECT_PROFILE,
                "policyDigest": PROJECT_POLICY_DIGEST,
            },
            "requestedAt": NOW,
            "proposalDigest": SHA_C,
        },
        "approval": {
            "approvalId": "approval-1",
            "actionId": "command-action-1",
            "taskId": "task-1",
            "proposalDigest": SHA_C,
            "generation": 1,
            "approvedAt": NOW,
            "expiresAt": "2026-07-24T00:10:00.000Z",
        },
        "policyProfileId": PROJECT_PROFILE,
        "expectedPolicyDigest": PROJECT_POLICY_DIGEST,
    }


def test_handshake_reports_version_revision_schema_and_pid() -> None:
    response, stop = BridgeService(canonical()).handle(message("hello-1", "hello", {}))
    assert stop is False
    assert response["messageType"] == "hello_ack"
    assert response["payload"]["bridgeProtocolVersion"] == BRIDGE_PROTOCOL_VERSION
    assert response["payload"]["agentFuseSourceCommit"] == COMMIT
    assert response["payload"]["agentFusePackageVersion"] == "3.6.0"
    assert response["payload"]["supportedDecisionSchema"] == "agentfuse-evidence-schema-v0.1"
    assert isinstance(response["payload"]["processId"], int)


@pytest.mark.parametrize(
    ("fixture", "expected"),
    [
        ("kerniq-proof-allow-v1", "allow"),
        ("kerniq-proof-deny-v1", "deny"),
    ],
)
def test_canonical_decision_shape_is_protocol_only(fixture: str, expected: str) -> None:
    response, stop = BridgeService(canonical()).handle(
        message("decision-1", "decision_request", decision_payload(fixture))
    )
    assert stop is False
    assert response["messageType"] == "decision_result"
    assert response["payload"]["decision"] == expected
    assert response["payload"]["actionId"] == "action-1"
    assert response["payload"]["agentFuseCommit"] == COMMIT
    assert response["payload"]["evidence"]["schema_version"] == (
        "agentfuse-evidence-schema-v0.1"
    )


def test_project_command_uses_public_evaluate_and_returns_canonical_allow() -> None:
    service = BridgeService(canonical())
    response, stop = service.handle(
        message("project-1", "decision_request", project_command_payload())
    )
    assert stop is False
    assert response["messageType"] == "decision_result"
    assert response["payload"]["decision"] == "allow"
    assert response["payload"]["policyProfileId"] == PROJECT_PROFILE
    assert response["payload"]["policyDigest"] == PROJECT_POLICY_DIGEST
    assert response["payload"]["evidence"]["boundary_decision"]["decision"] == "allow"
    assert FakeGuard.evaluate_calls == 1
    assert FakeGuard.invoke_calls == 0
    assert FakeGuard.last_tool_call is not None
    assert FakeGuard.last_tool_call.values["tool_name"] == "kerniq.project-command.run"
    assert set(FakeGuard.last_tool_call.values["safe_metadata"]) == {
        "task_id",
        "session_id",
        "approval_id",
        "approval_generation",
        "proposal_digest",
        "risk",
        "policy_profile_id",
        "policy_digest",
    }
    encoded = json.dumps(FakeGuard.last_tool_call.values)
    assert all(
        forbidden not in encoded
        for forbidden in ["projectRoot", "executable", "rawCommand", "environment", "stdout"]
    )


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("commandCategory", "deploy"),
        ("commandId", "x" * 161),
    ],
)
def test_project_command_policy_noncompliance_returns_canonical_block(
    field: str,
    value: str,
) -> None:
    payload = project_command_payload()
    payload["proposal"]["parameters"][field] = value
    response, _ = BridgeService(canonical()).handle(
        message(f"project-block-{field}", "decision_request", payload)
    )
    assert response["messageType"] == "decision_result"
    assert response["payload"]["decision"] == "block"
    assert response["payload"]["evidence"]["boundary_decision"]["decision"] == "block"
    assert FakeGuard.evaluate_calls == 1
    assert FakeGuard.invoke_calls == 0


@pytest.mark.parametrize(
    ("mutation", "reason"),
    [
        (lambda payload: payload["proposal"].update(actionType="other"), "unsupported_action_type"),
        (
            lambda payload: payload.update(policyFixtureId="kerniq-proof-allow-v1"),
            "policy_selection_invalid",
        ),
        (lambda payload: payload.update(policyProfileId="model-selected"), "unsupported_policy_profile"),
        (lambda payload: payload.update(expectedPolicyDigest=SHA_A), "policy_digest_mismatch"),
        (
            lambda payload: payload["proposal"]["parameters"].update(policyDigest=SHA_A),
            "proposal_policy_digest_mismatch",
        ),
        (
            lambda payload: payload["approval"].update(actionId="other"),
            "approval_identity_mismatch",
        ),
    ],
)
def test_project_command_identity_failures_are_protocol_errors(mutation, reason: str) -> None:
    payload = project_command_payload()
    mutation(payload)
    response, _ = BridgeService(canonical()).handle(
        message(f"project-error-{reason}", "decision_request", payload)
    )
    assert response["messageType"] == "protocol_error"
    assert response["payload"]["reasonCode"] == reason
    assert FakeGuard.evaluate_calls == 0
    assert FakeGuard.invoke_calls == 0


def test_unknown_fixture_and_identity_mismatch_fail_closed() -> None:
    service = BridgeService(canonical())
    unknown, _ = service.handle(
        message("decision-1", "decision_request", decision_payload("model-chosen"))
    )
    mismatched = decision_payload("kerniq-proof-allow-v1")
    mismatched["approval"]["actionId"] = "other"
    identity, _ = service.handle(message("decision-2", "decision_request", mismatched))
    assert unknown["messageType"] == "protocol_error"
    assert identity["messageType"] == "protocol_error"


def test_malformed_json_protocol_mismatch_duplicate_and_oversize_fail_closed() -> None:
    service = BridgeService(canonical())
    malformed, _ = service.handle("{")
    wrong_protocol = json.loads(message("message-1", "health_check", {}))
    wrong_protocol["protocolVersion"] = "future"
    mismatch, _ = service.handle(json.dumps(wrong_protocol))
    duplicate, _ = service.handle(message("message-1", "health_check", {}))
    oversized, _ = service.handle("x" * (64 * 1024 + 1))
    assert {item["messageType"] for item in [malformed, mismatch, duplicate, oversized]} == {
        "protocol_error"
    }


def test_stdout_is_ndjson_only_and_shutdown_is_bounded() -> None:
    stdin = io.StringIO(
        message("hello-1", "hello", {}) + "\n"
        + message("shutdown-1", "shutdown", {}) + "\n"
    )
    stdout = io.StringIO()
    assert run_loop(BridgeService(canonical()), stdin, stdout) == 0
    lines = stdout.getvalue().splitlines()
    assert [json.loads(line)["messageType"] for line in lines] == [
        "hello_ack",
        "shutdown_ack",
    ]


def test_actual_pinned_canonical_source_when_explicitly_provided() -> None:
    source = os.environ.get("KERNIQ_AGENTFUSE_SOURCE")
    if not source:
        pytest.skip("canonical source integration requires KERNIQ_AGENTFUSE_SOURCE")
    loaded = CanonicalAgentFuse.load(Path(source), COMMIT)
    allow = loaded.decide(decision_payload("kerniq-proof-allow-v1"))
    deny = loaded.decide(decision_payload("kerniq-proof-deny-v1"))
    assert allow["decision"] == "allow"
    assert deny["decision"] == "deny"
    assert allow["evidence"]["schema_version"] == "agentfuse-evidence-schema-v0.1"


def test_subprocess_bridge_stderr_is_separate_from_protocol_stdout() -> None:
    source = os.environ.get("KERNIQ_AGENTFUSE_SOURCE")
    if not source:
        pytest.skip("canonical source integration requires KERNIQ_AGENTFUSE_SOURCE")
    process = subprocess.run(
        [
            sys.executable,
            "-m",
            "python.kerniq_agentfuse_bridge",
            "--agentfuse-source",
            source,
            "--expected-commit",
            COMMIT,
        ],
        input=(
            message("hello-1", "hello", {}) + "\n"
            + message("shutdown-1", "shutdown", {}) + "\n"
        ),
        text=True,
        capture_output=True,
        check=False,
        cwd=Path(__file__).resolve().parents[3],
        timeout=5,
    )
    assert process.returncode == 0
    assert process.stderr == ""
    assert [json.loads(line)["messageType"] for line in process.stdout.splitlines()] == [
        "hello_ack",
        "shutdown_ack",
    ]
