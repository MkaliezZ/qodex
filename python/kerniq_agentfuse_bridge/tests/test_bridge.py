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


COMMIT = "8c6ae9875b3618a529d5150c96385da7461099c2"
NOW = "2026-07-24T00:00:00.000Z"


class FakeResolved:
    def __init__(self, action: str) -> None:
        self.action = action
        self.reason_code = "allowed" if action == "allow" else "explicit_denylist"


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
    def __init__(self, allow_tools=None, deny_tools=None) -> None:
        self.allowed = bool(allow_tools) and not bool(deny_tools)

    def _resolve_policy_sync(self, tool_call: FakeToolCall) -> FakeResolved:
        return FakeResolved("allow" if self.allowed else "block")

    def _evidence(self, tool_call: FakeToolCall, resolved: FakeResolved) -> FakeEvidence:
        return FakeEvidence(resolved.action)


def canonical() -> CanonicalAgentFuse:
    return CanonicalAgentFuse(
        runtime_guard=SimpleNamespace(
            RuntimeGuard=FakeGuard,
            ToolCallRequest=FakeToolCall,
        ),
        evidence_schema=SimpleNamespace(
            SCHEMA_VERSION="agentfuse-evidence-schema-v0.1",
        ),
        package_version="3.5.0",
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


def test_handshake_reports_version_revision_schema_and_pid() -> None:
    response, stop = BridgeService(canonical()).handle(message("hello-1", "hello", {}))
    assert stop is False
    assert response["messageType"] == "hello_ack"
    assert response["payload"]["bridgeProtocolVersion"] == BRIDGE_PROTOCOL_VERSION
    assert response["payload"]["agentFuseSourceCommit"] == COMMIT
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
