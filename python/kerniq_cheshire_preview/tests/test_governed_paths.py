"""Deterministic interceptor tests: block / allow / duplicate / timeout /
evidence failure / runtime mismatch, all against the real audited runtime
admission path, with the hardened evidence lifecycle and identity-bound
sidecar protocol."""

from __future__ import annotations

import pytest

from kerniq_cheshire_preview import GovernanceAttachError, attach_governed_runtime

from .conftest import (
    FakeDecision,
    FakeToolCall,
    make_fake_tool,
    allow_response,
    block_response,
    read_evidence,
    requires_real_cheshire,
    run,
)


def statuses(evidence_path):
    return [event["status"] for event in read_evidence(evidence_path)]


@requires_real_cheshire
class TestBlockPath:
    def test_block_never_executes_tool(self, agent, protected_tool, evidence_path):
        sidecar = FakeDecision(responses=[block_response("explicit_denylist")])
        attach = attach_governed_runtime(
            evidence_path, agent_class=type(agent), _sidecar=sidecar
        )
        try:
            result = run(
                agent.call_tool(
                    FakeToolCall(id="call_b1", name="protected_action", args={"x": 1})
                )
            )
        finally:
            attach.detach()
        assert protected_tool.execution_count == 0
        text = getattr(getattr(result, "content", [None])[0], "text", "") or str(result)
        assert "blocked by governance" in text
        assert "dispatch=false" in text

    def test_block_evidence_records_request_and_block(
        self, agent, protected_tool, evidence_path
    ):
        sidecar = FakeDecision(responses=[block_response("explicit_denylist")])
        attach = attach_governed_runtime(
            evidence_path, agent_class=type(agent), _sidecar=sidecar
        )
        try:
            result = run(
                agent.call_tool(
                    FakeToolCall(id="call_b2", name="protected_action", args={"secret": "s"})
                )
            )
        finally:
            attach.detach()
        events = read_evidence(evidence_path)
        assert statuses(evidence_path) == ["REQUESTED", "BLOCKED"]
        requested, blocked = events
        assert requested["requested_arguments"] == {"secret": "s"}
        assert requested["tool_call_id"] == "call_b2"
        assert blocked["policy_decision"] == "block"
        assert blocked["dispatch"] is False
        assert blocked["reason"] == "explicit_denylist"
        # No execution claims exist anywhere in the blocked lifecycle.
        assert all("executed_arguments" not in e for e in events)
        assert all("effective_arguments" not in e for e in events)
        assert result.tool_call_id == "call_b2"


@requires_real_cheshire
class TestAllowPath:
    def test_allow_executes_exactly_once(self, agent, allowed_tool, evidence_path):
        sidecar = FakeDecision(responses=[allow_response()])
        attach = attach_governed_runtime(
            evidence_path, agent_class=type(agent), _sidecar=sidecar
        )
        try:
            result = run(
                agent.call_tool(
                    FakeToolCall(id="call_a1", name="allowed_action", args={"v": 2})
                )
            )
        finally:
            attach.detach()
        assert allowed_tool.execution_count == 1
        assert "ran" in str(result)
        assert result.tool_call_id == "call_a1"

    def test_allow_lifecycle_evidence_is_truthful(self, agent, allowed_tool, evidence_path):
        sidecar = FakeDecision(responses=[allow_response()])
        attach = attach_governed_runtime(
            evidence_path, agent_class=type(agent), _sidecar=sidecar
        )
        try:
            run(agent.call_tool(FakeToolCall(id="call_a2", name="allowed_action", args={"v": 3})))
        finally:
            attach.detach()
        assert statuses(evidence_path) == [
            "REQUESTED",
            "AUTHORIZED",
            "DISPATCH_STARTED",
            "EXECUTED",
        ]
        requested, authorized, dispatch_started, executed = read_evidence(evidence_path)
        assert requested["requested_arguments"] == {"v": 3}
        assert authorized["policy_decision"] == "allow"
        assert authorized["effective_arguments"] == {"v": 3}
        assert "executed_arguments" not in authorized  # no execution prediction
        assert "executed_arguments" not in dispatch_started
        assert executed["executed_arguments"] == {"v": 3}
        assert "ran" in executed["tool_result"]
        assert executed["status"] == "EXECUTED"


@requires_real_cheshire
class TestDuplicateDecision:
    def test_replayed_tool_call_id_never_dispatches_twice(
        self, agent, allowed_tool, evidence_path
    ):
        sidecar = FakeDecision(responses=[allow_response(), allow_response()])
        attach = attach_governed_runtime(
            evidence_path, agent_class=type(agent), _sidecar=sidecar
        )
        replayed = FakeToolCall(id="call_dup", name="allowed_action", args={"n": 1})
        try:
            run(agent.call_tool(replayed))
            second = run(agent.call_tool(replayed))
        finally:
            attach.detach()
        assert allowed_tool.execution_count == 1
        assert "blocked by governance" in str(second)
        assert "duplicate_tool_call_replayed" in str(second)
        blocked_events = [
            e for e in read_evidence(evidence_path) if e["status"] == "BLOCKED"
        ]
        assert blocked_events[-1]["reason"] == "duplicate_tool_call_replayed"


@requires_real_cheshire
class TestTimeoutAndUnknown:
    def test_sidecar_timeout_fails_closed(self, agent, allowed_tool, evidence_path):
        sidecar = FakeDecision(responses=[None])  # no decision arrives in time
        attach = attach_governed_runtime(
            evidence_path, agent_class=type(agent), _sidecar=sidecar
        )
        try:
            result = run(
                agent.call_tool(
                    FakeToolCall(id="call_t1", name="allowed_action", args={"q": 1})
                )
            )
        finally:
            attach.detach()
        assert allowed_tool.execution_count == 0
        assert "sidecar_unavailable" in str(result)
        blocked = [e for e in read_evidence(evidence_path) if e["status"] == "BLOCKED"][0]
        assert blocked["reason"] == "sidecar_unavailable"

    def test_unknown_decision_fails_closed(self, agent, allowed_tool, evidence_path):
        sidecar = FakeDecision(
            responses=[{"type": "decision", "decision": "maybe", "reason": "??"}]
        )
        attach = attach_governed_runtime(
            evidence_path, agent_class=type(agent), _sidecar=sidecar
        )
        try:
            run(agent.call_tool(FakeToolCall(id="call_t2", name="allowed_action", args={})))
        finally:
            attach.detach()
        assert allowed_tool.execution_count == 0
        blocked = [e for e in read_evidence(evidence_path) if e["status"] == "BLOCKED"][0]
        assert "unknown_decision" in blocked["reason"]


@requires_real_cheshire
class TestSidecarIdentityBinding:
    def _attach(self, agent, evidence_path, responses):
        sidecar = FakeDecision(responses=responses)
        return attach_governed_runtime(
            evidence_path, agent_class=type(agent), _sidecar=sidecar
        )

    def test_mismatched_request_id_rejected(self, agent, allowed_tool, evidence_path):
        attach = self._attach(
            agent,
            evidence_path,
            [{"type": "decision", "request_id": "req_someone_else", "decision": "allow"}],
        )
        try:
            result = run(
                agent.call_tool(
                    FakeToolCall(id="call_i1", name="allowed_action", args={})
                )
            )
        finally:
            attach.detach()
        assert allowed_tool.execution_count == 0
        assert "identity_mismatch:request_id" in str(result)
        blocked = [e for e in read_evidence(evidence_path) if e["status"] == "BLOCKED"][0]
        assert blocked["reason"] == "identity_mismatch:request_id"

    def test_mismatched_tool_call_id_rejected(self, agent, allowed_tool, evidence_path):
        attach = self._attach(
            agent,
            evidence_path,
            [
                {
                    "type": "decision",
                    "decision": "allow",
                    "tool_call_id": "call_someone_else",
                }
            ],
        )
        try:
            run(agent.call_tool(FakeToolCall(id="call_i2", name="allowed_action", args={})))
        finally:
            attach.detach()
        assert allowed_tool.execution_count == 0
        blocked = [e for e in read_evidence(evidence_path) if e["status"] == "BLOCKED"][0]
        assert blocked["reason"] == "identity_mismatch:tool_call_id"

    def test_stale_replayed_response_rejected(self, agent, allowed_tool, evidence_path):
        sidecar = FakeDecision(responses=[allow_response()])
        attach = attach_governed_runtime(
            evidence_path, agent_class=type(agent), _sidecar=sidecar
        )
        try:
            run(agent.call_tool(FakeToolCall(id="call_s1", name="allowed_action", args={})))
            # Force the next response to carry the stale first identity.
            sidecar.responses = [
                dict(allow_response(), request_id=sidecar.calls[0]["request_id"])
            ]
            run(agent.call_tool(FakeToolCall(id="call_s2", name="allowed_action", args={})))
        finally:
            attach.detach()
        assert allowed_tool.execution_count == 1  # only the first request ran
        blocked = [e for e in read_evidence(evidence_path) if e["status"] == "BLOCKED"]
        assert blocked[-1]["reason"] == "identity_mismatch:request_id"

    def test_duplicate_response_for_same_request_cannot_double_dispatch(
        self, agent, allowed_tool, evidence_path
    ):
        # Two identical allow responses delivered for two identical calls:
        # the second must be refused by the replay ledger, not dispatched.
        sidecar = FakeDecision(responses=[allow_response(), allow_response()])
        attach = attach_governed_runtime(
            evidence_path, agent_class=type(agent), _sidecar=sidecar
        )
        try:
            run(agent.call_tool(FakeToolCall(id="call_d1", name="allowed_action", args={})))
            run(agent.call_tool(FakeToolCall(id="call_d1", name="allowed_action", args={})))
        finally:
            attach.detach()
        assert allowed_tool.execution_count == 1


@requires_real_cheshire
class TestRuntimeMismatch:
    def test_non_agent_class_refused(self, evidence_path):
        class NotAnAgent:
            pass

        with pytest.raises(GovernanceAttachError):
            attach_governed_runtime(evidence_path, agent_class=NotAnAgent)

    def test_wrong_version_refused(self, agent, evidence_path, monkeypatch):
        import kerniq_cheshire_preview.admission as admission

        monkeypatch.setattr(admission, "version", lambda name: "9.9.9")
        with pytest.raises(GovernanceAttachError):
            attach_governed_runtime(evidence_path, agent_class=type(agent))

    def test_missing_package_refused(self, evidence_path, monkeypatch):
        import importlib.metadata as im
        import kerniq_cheshire_preview.admission as admission

        def missing(name):
            raise im.PackageNotFoundError(name)

        monkeypatch.setattr(admission, "version", missing)
        with pytest.raises(GovernanceAttachError):
            attach_governed_runtime(evidence_path)

    def test_signature_mismatch_refused(self, evidence_path):
        from cat.services.agents.base import Agent

        class TamperedAgent(Agent):
            async def call_tool(self):  # seam signature broken
                raise NotImplementedError

        with pytest.raises(GovernanceAttachError):
            attach_governed_runtime(evidence_path, agent_class=TamperedAgent)


@requires_real_cheshire
class TestEvidenceFailure:
    def test_unwritable_evidence_never_allows(self, agent, allowed_tool, tmp_path):
        broken = tmp_path / "missing-dir" / "evidence.jsonl"
        sidecar = FakeDecision(responses=[allow_response()])
        attach = attach_governed_runtime(
            broken, agent_class=type(agent), _sidecar=sidecar
        )
        try:
            result = run(
                agent.call_tool(
                    FakeToolCall(id="call_e1", name="allowed_action", args={"k": 1})
                )
            )
        finally:
            attach.detach()
        assert allowed_tool.execution_count == 0, "evidence failure must fail closed"
        assert "blocked by governance" in str(result)


@requires_real_cheshire
class TestDispatcherFailures:
    def test_unknown_tool_is_failed_before_execution(self, agent, evidence_path):
        sidecar = FakeDecision(responses=[allow_response()])
        attach = attach_governed_runtime(
            evidence_path, agent_class=type(agent), _sidecar=sidecar
        )
        try:
            with pytest.raises(Exception):
                run(
                    agent.call_tool(
                        FakeToolCall(id="call_f1", name="no_such_tool", args={})
                    )
                )
        finally:
            attach.detach()
        assert statuses(evidence_path) == [
            "REQUESTED",
            "AUTHORIZED",
            "DISPATCH_STARTED",
            "FAILED_BEFORE_EXECUTION",
        ]
        failure = read_evidence(evidence_path)[-1]
        assert "executed_arguments" not in failure

    def test_standardize_raise_after_dispatch_is_failed_after_dispatch(
        self, agent, evidence_path, monkeypatch
    ):
        def explode(**kwargs):
            return "never standardized"

        exploding = make_fake_tool("exploding_action", explode)
        agent.tools.append(exploding)

        def raising_standardize(tool_call, tool_result):
            raise RuntimeError("boom")

        monkeypatch.setattr(exploding, "standardize_output", raising_standardize)
        sidecar = FakeDecision(responses=[allow_response()])
        attach = attach_governed_runtime(
            evidence_path, agent_class=type(agent), _sidecar=sidecar
        )
        try:
            with pytest.raises(RuntimeError):
                run(
                    agent.call_tool(
                        FakeToolCall(id="call_f2", name="exploding_action", args={})
                    )
                )
        finally:
            attach.detach()
        failure = read_evidence(evidence_path)[-1]
        assert failure["status"] == "FAILED_AFTER_DISPATCH"
        assert "boom" in failure["error"]
