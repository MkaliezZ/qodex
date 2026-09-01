"""Deterministic interceptor tests: block / allow / duplicate / timeout /
evidence failure / runtime mismatch, all against the real audited runtime
admission path."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from kerniq_cheshire_preview import GovernanceAttachError, attach_governed_runtime

from .conftest import (
    FakeDecision,
    FakeTool,
    FakeToolCall,
    allow_response,
    block_response,
    read_evidence,
    requires_real_cheshire,
    run,
)


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

    def test_block_evidence_records_full_request(self, agent, protected_tool, evidence_path):
        sidecar = FakeDecision(responses=[block_response("explicit_denylist")])
        attach = attach_governed_runtime(
            evidence_path, agent_class=type(agent), _sidecar=sidecar
        )
        try:
            run(
                agent.call_tool(
                    FakeToolCall(id="call_b2", name="protected_action", args={"secret": "s"})
                )
            )
        finally:
            attach.detach()
        events = read_evidence(evidence_path)
        assert len(events) == 1
        event = events[0]
        assert event["schema"] == "kerniq.cheshire-preview-evidence.v1"
        assert event["tool_call_id"] == "call_b2"
        assert event["tool_name"] == "protected_action"
        assert event["requested_arguments"] == {"secret": "s"}
        assert event["policy_decision"] == "block"
        assert event["effective_arguments"] is None
        assert event["dispatch"] is False
        assert event["outcome"] == "governed_block"
        assert event["reason"] == "explicit_denylist"
        assert event["request_id"].startswith("req_")


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
        assert "tool_output:ran" in str(result)

    def test_allow_evidence_records_dispatch_and_result(self, agent, allowed_tool, evidence_path):
        sidecar = FakeDecision(responses=[allow_response()])
        attach = attach_governed_runtime(
            evidence_path, agent_class=type(agent), _sidecar=sidecar
        )
        try:
            run(
                agent.call_tool(
                    FakeToolCall(id="call_a2", name="allowed_action", args={"v": 3})
                )
            )
        finally:
            attach.detach()
        events = read_evidence(evidence_path)
        request, result = events
        assert request["policy_decision"] == "allow"
        assert request["dispatch"] is True
        assert request["effective_arguments"] == {"v": 3}
        assert result["phase"] == "result"
        assert result["tool_call_id"] == "call_a2"
        assert result["executed_arguments"] == {"v": 3}
        assert "tool_output:ran" in result["tool_result"]
        assert result["outcome"] == "executed"


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
        events = read_evidence(evidence_path)
        decisions = [e["policy_decision"] for e in events if e["phase"] == "request"]
        assert decisions == ["allow", "block"]


@requires_real_cheshire
class TestTimeout:
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
        events = read_evidence(evidence_path)
        assert events[0]["policy_decision"] == "block"
        assert events[0]["reason"] == "sidecar_unavailable"
        assert events[0]["dispatch"] is False

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
        events = read_evidence(evidence_path)
        assert events[0]["policy_decision"] == "block"
        assert "unknown_decision" in events[0]["reason"]


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
