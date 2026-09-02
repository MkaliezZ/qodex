"""Sidecar decision semantics (real AgentFuse guard) and the end-to-end
governed run against the real audited Cheshire Cat runtime, including the
real subprocess sidecar IPC."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest

from kerniq_cheshire_preview import attach_governed_runtime
from kerniq_cheshire_preview.sidecar_main import _build_guard, decide

from .conftest import make_fake_tool, FakeToolCall, requires_real_cheshire, run


class TestSidecarDecisions:
    """The sidecar maps the real dhms-agentfuse RuntimeGuard to canonical
    allow/block; these tests need only dhms-agentfuse."""

    def test_denylist_blocks(self):
        guard = _build_guard({"denyTools": ["protected_action"], "defaultAction": "allow"})
        action, reason = decide(guard, "r1", "protected_action", {})
        assert (action, reason) == ("block", "explicit_denylist")

    def test_allowlist_allows(self):
        guard = _build_guard({"allowTools": ["safe_tool"], "defaultAction": "block"})
        action, _ = decide(guard, "r2", "safe_tool", {})
        assert action == "allow"

    def test_not_in_allowlist_blocks_under_default_block(self):
        guard = _build_guard({"allowTools": ["safe_tool"], "defaultAction": "block"})
        action, reason = decide(guard, "r3", "other_tool", {})
        assert action == "block"

    def test_default_action_fall_through(self):
        guard = _build_guard({"defaultAction": "allow"})
        action, _ = decide(guard, "r4", "anything", {})
        assert action == "allow"

    def test_unknown_guard_output_fails_closed(self):
        class BrokenGuard:
            def evaluate(self, request):
                return type("D", (), {"action": "shrug"})()

        action, reason = decide(BrokenGuard(), "r5", "x", {})
        assert action == "block"
        assert "unknown_decision" in reason


@requires_real_cheshire
class TestRealSidecarIpc:
    """Full path: interceptor → real subprocess sidecar (dhms-agentfuse) →
    real Agent seam → Tool.execute."""

    def _attach(self, agent, evidence_path):
        return attach_governed_runtime(
            evidence_path,
            policy={"denyTools": ["protected_action"], "defaultAction": "allow"},
            agent_class=type(agent),
        )

    def test_block_via_real_sidecar(self, agent, protected_tool, evidence_path):
        attach = self._attach(agent, evidence_path)
        try:
            result = run(
                agent.call_tool(
                    FakeToolCall(id="call_r1", name="protected_action", args={"x": 1})
                )
            )
        finally:
            attach.detach()
        assert protected_tool.execution_count == 0
        assert "blocked by governance" in str(result)
        statuses = [
            json.loads(line)["status"]
            for line in evidence_path.read_text(encoding="utf-8").splitlines()
        ]
        assert statuses == ["REQUESTED", "BLOCKED"]

    def test_allow_via_real_sidecar(self, agent, allowed_tool, evidence_path):
        attach = self._attach(agent, evidence_path)
        try:
            result = run(
                agent.call_tool(
                    FakeToolCall(id="call_r2", name="allowed_action", args={"y": 2})
                )
            )
        finally:
            attach.detach()
        assert allowed_tool.execution_count == 1
        assert "ran" in str(result)
        statuses = [
            json.loads(line)["status"]
            for line in evidence_path.read_text(encoding="utf-8").splitlines()
        ]
        assert statuses == ["REQUESTED", "AUTHORIZED", "DISPATCH_STARTED", "EXECUTED"]

    def test_real_cheshire_tool_and_message_shapes(self):
        """The host-native blocked result is a real cheshire Message and the
        seam accepts a real ToolCall instance."""
        from cat.protocols.model_context.type_wrappers import ToolCall
        from cat.types import Message
        from .conftest import FakeAgent

        tool = make_fake_tool("real_named_tool", lambda **kwargs: "ran")
        agent_instance = FakeAgent(tools=[tool])
        evidence = Path(self._tmp()) / "evidence.jsonl"
        attach = attach_governed_runtime(
            evidence,
            policy={"denyTools": [tool.name], "defaultAction": "allow"},
            agent_class=FakeAgent,
        )
        try:
            call = ToolCall(id="call_real_1", name=tool.name, args={})
            result = run(agent_instance.call_tool(call))
        finally:
            attach.detach()
        assert isinstance(result, Message)
        assert result.role == "tool"
        assert "blocked by governance" in result.content[0].text
        assert tool.execution_count == 0

    @staticmethod
    def _tmp() -> str:
        import tempfile

        return tempfile.mkdtemp(prefix="kerniq-real-sidecar-")
