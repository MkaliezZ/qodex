"""Real-execution-path tests against the audited cheshire-cat-ai==2.0.23:

- real ``Tool.execute`` (via the real ``@tool`` decorator) under governance:
  block → execute count 0, allow → execute count 1;
- real ``ToolCall``/``Message`` types end to end;
- blocked ``Message`` keeps the original ``tool_call_id`` so the runtime
  continuation can correlate it (verified through the provider-side message
  conversion the agent loop uses for tool results).
"""

from __future__ import annotations

import asyncio
import uuid
from contextlib import contextmanager
from pathlib import Path

import pytest

from kerniq_cheshire_preview import attach_governed_runtime

from .conftest import read_evidence, requires_real_cheshire, run


@contextmanager
def ambient_request_context():
    """The real Tool.execute emits an AGUI event that reads the per-request
    ambient context; provide one like a real handler would."""
    from cat.ambient.context_vars import Ctx, reset_ctx, set_ctx
    from cat.auth.user import User

    token = set_ctx(Ctx(user=User(id=str(uuid.uuid4()), name="kerniq-test")))
    try:
        yield
    finally:
        reset_ctx(token)


def make_real_tool(name: str, counter: dict):
    from cat.mad_hatter.decorators import tool as tool_decorator

    @tool_decorator
    async def real_tool(payload: str) -> str:
        """A governed test tool.

        Args:
            payload: text payload
        """
        counter[name] = counter.get(name, 0) + 1
        return f"executed:{payload}"

    real_tool.name = name
    return real_tool


@requires_real_cheshire
class TestRealToolExecuteUnderGovernance:
    def _agent(self, tools):
        from .conftest import FakeAgent

        return FakeAgent(tools=tools)

    def test_block_real_tool_execute_count_zero(self, evidence_path):
        counter: dict = {}
        protected = make_real_tool("protected_action", counter)
        agent = self._agent([protected])
        attach = attach_governed_runtime(
            evidence_path,
            policy={"denyTools": ["protected_action"], "defaultAction": "allow"},
            agent_class=type(agent),
        )
        try:
            from cat.protocols.model_context.type_wrappers import ToolCall

            with ambient_request_context():
                result = run(
                    agent.call_tool(
                        ToolCall(id="call_rb1", name="protected_action", args={"payload": "x"})
                    )
                )
        finally:
            attach.detach()
        assert counter.get("protected_action", 0) == 0
        from cat.types import Message

        assert isinstance(result, Message)
        assert result.role == "tool"
        assert result.tool_call_id == "call_rb1"
        assert "blocked by governance" in result.content[0].text
        statuses = [e["status"] for e in read_evidence(evidence_path)]
        assert statuses == ["REQUESTED", "BLOCKED"]

    def test_allow_real_tool_execute_count_one(self, evidence_path):
        counter: dict = {}
        allowed = make_real_tool("allowed_action", counter)
        agent = self._agent([allowed])
        attach = attach_governed_runtime(
            evidence_path,
            policy={"defaultAction": "allow"},
            agent_class=type(agent),
        )
        try:
            from cat.protocols.model_context.type_wrappers import ToolCall

            with ambient_request_context():
                result = run(
                    agent.call_tool(
                        ToolCall(id="call_ra1", name="allowed_action", args={"payload": "y"})
                    )
                )
        finally:
            attach.detach()
        assert counter.get("allowed_action", 0) == 1
        assert result.tool_call_id == "call_ra1"
        assert "executed:y" in result.content[0].text
        statuses = [e["status"] for e in read_evidence(evidence_path)]
        assert statuses == ["REQUESTED", "AUTHORIZED", "DISPATCH_STARTED", "EXECUTED"]

    def test_blocked_message_continues_agent_flow(self, evidence_path):
        """The blocked result must be consumable by the runtime continuation
        exactly like a real tool result: provider-side message conversion
        keeps the tool_call_id correlation the loop relies on."""
        counter: dict = {}
        protected = make_real_tool("protected_action", counter)
        agent = self._agent([protected])
        attach = attach_governed_runtime(
            evidence_path,
            policy={"denyTools": ["protected_action"], "defaultAction": "allow"},
            agent_class=type(agent),
        )
        try:
            from cat.protocols.model_context.type_wrappers import ToolCall

            with ambient_request_context():
                blocked = run(
                    agent.call_tool(
                        ToolCall(id="call_rc1", name="protected_action", args={"payload": "z"})
                    )
                )
        finally:
            attach.detach()

        # The agent loop hands tool results to the provider adapter; verify
        # the blocked Message converts with its correlation intact.
        from cat.services.model_providers.openai_compatible import (
            OpenAICompatibleProvider,
        )

        provider = OpenAICompatibleProvider.__new__(OpenAICompatibleProvider)
        payload = asyncio.run(provider.convert_message(blocked))
        assert payload.get("role") == "tool"
        assert payload.get("tool_call_id") == "call_rc1"
        assert "blocked by governance" in str(payload.get("content"))
