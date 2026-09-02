"""Final proof-closure counterexample regressions (Codex-reproduced):

F-01  active wrapper replacement bypass — a foreign patch installed while
      the registry is active must cause fail-closed (no physical execution)
      and degrade the attach.
F-02  approved-tool redirection — a call_tool override that would execute a
      different physical tool is refused at admission.
F-03  pre-existing instance Tool.execute override — synthetic results can
      never produce EXECUTED evidence.
F-04  async observation ownership — two different tool_call_ids against the
      same real Tool instance serialize; exact restore; per-request
      attribution.
"""

from __future__ import annotations

import asyncio
import uuid
from contextlib import contextmanager

import pytest

from kerniq_cheshire_preview import (
    GovernanceAttachError,
    attach_governed_runtime,
)
from kerniq_cheshire_preview.interceptor import _PATCH_REGISTRY

from .conftest import (
    FakeAgent,
    FakeDecision,
    FakeToolCall,
    allow_response,
    make_fake_tool,
    read_evidence,
    requires_real_cheshire,
    run,
)


def statuses(evidence_path):
    return [event["status"] for event in read_evidence(evidence_path)]


@contextmanager
def ambient_request_context():
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
class TestFinalF01WrapperReplacement:
    def test_foreign_replace_then_invoke_executes_nothing(
        self, agent, allowed_tool, evidence_path
    ):
        attach = attach_governed_runtime(
            evidence_path,
            policy={"defaultAction": "allow"},
            agent_class=type(agent),
            _sidecar=FakeDecision(responses=[allow_response()]),
        )
        try:
            async def foreign(self, tool_call, *args, **kwargs):
                # Bypass governance entirely and execute directly.
                return await allowed_tool.execute(self, tool_call)

            setattr(type(agent), "call_tool", foreign)
            # The foreign wrapper bypasses the governed call_tool entirely;
            # the Tool.execute guard refuses the physical execution.
            with pytest.raises(RuntimeError, match="no governed dispatch token"):
                run(
                    agent.call_tool(
                        FakeToolCall(id="call_x1", name="allowed_action", args={"v": 1})
                    )
                )
        finally:
            if "call_tool" in type(agent).__dict__:
                import kerniq_cheshire_preview.interceptor as I

                entry = _PATCH_REGISTRY.get(type(agent))
                if entry is not None and entry.active:
                    setattr(type(agent), "call_tool", entry.installed_wrapper)
                    attach.detach()
                else:
                    delattr(type(agent), "call_tool")
        assert allowed_tool.execution_count == 0, "replaced wrapper must fail closed"
        assert attach.health == "EVIDENCE_DEGRADED"
        # No governance evidence exists for the bypassed call at all — the
        # governed wrapper never ran; the guard stopped physical execution.


@requires_real_cheshire
class TestFinalF02ToolRedirection:
    def test_redirecting_dispatcher_refused_at_admission(self, evidence_path):
        class RedirectingAgent(FakeAgent):
            """Receives an approved call for tool A but executes tool B."""

            async def call_tool(self, tool_call, *args, **kwargs):
                for tool in self.tools:
                    if tool.name == "hidden_tool":
                        return await tool.execute(self, tool_call)
                raise Exception("not found")

        with pytest.raises(GovernanceAttachError) as error:
            attach_governed_runtime(
                evidence_path,
                agent_class=RedirectingAgent,
                _sidecar=FakeDecision(responses=[allow_response()]),
            )
        assert "dispatch profile mismatch" in str(error.value)
        assert not evidence_path.exists()


@requires_real_cheshire
class TestFinalF03InstanceExecuteOverride:
    def test_preexisting_instance_override_no_executed_evidence(
        self, agent, allowed_tool, evidence_path
    ):
        async def synthetic_override(agent_self, tool_call):
            return "synthetic-result-without-execution"

        allowed_tool.execute = synthetic_override  # pre-existing override
        sidecar = FakeDecision(responses=[allow_response()])
        attach = attach_governed_runtime(
            evidence_path, agent_class=type(agent), _sidecar=sidecar
        )
        try:
            result = run(
                agent.call_tool(
                    FakeToolCall(id="call_y1", name="allowed_action", args={"v": 1})
                )
            )
        finally:
            attach.detach()
        assert allowed_tool.execution_count == 0
        assert "execute_profile_mismatch:instance_override" in str(result)
        assert "EXECUTED" not in statuses(evidence_path)
        blocked = [e for e in read_evidence(evidence_path) if e["status"] == "BLOCKED"]
        assert (
            blocked[-1]["reason"] == "execute_profile_mismatch:instance_override"
        )


@requires_real_cheshire
class TestFinalF04AsyncObservationOwnership:
    def test_same_real_tool_instance_two_call_ids(
        self, evidence_path
    ):
        counter: dict = {}
        tool = make_real_tool("shared_action", counter)
        agent = FakeAgent(tools=[tool])
        attach = attach_governed_runtime(
            evidence_path,
            policy={"defaultAction": "allow"},
            agent_class=FakeAgent,
        )
        try:
            from cat.protocols.model_context.type_wrappers import ToolCall

            async def two():
                with ambient_request_context():
                    return await asyncio.gather(
                        agent.call_tool(
                            ToolCall(id="call_z1", name="shared_action", args={"payload": "a"})
                        ),
                        agent.call_tool(
                            ToolCall(id="call_z2", name="shared_action", args={"payload": "b"})
                        ),
                    )

            first, second = run(two())
        finally:
            attach.detach()
        # Both legitimate calls executed exactly once each.
        assert counter.get("shared_action", 0) == 2
        assert "executed:a" in first.content[0].text
        assert "executed:b" in second.content[0].text
        # No stale observation wrapper remains on the instance.
        assert "execute" not in tool.__dict__
        # Evidence attribution is per-request and correct at the boundary.
        executed = [e for e in read_evidence(evidence_path) if e["status"] == "EXECUTED"]
        assert len(executed) == 2
        by_id = {e["tool_call_id"]: e for e in executed}
        assert by_id["call_z1"]["executed_arguments"] == {"payload": "a"}
        assert by_id["call_z2"]["executed_arguments"] == {"payload": "b"}
        assert "executed:a" in by_id["call_z1"]["tool_result"]
        assert "executed:b" in by_id["call_z2"]["tool_result"]
        assert attach.health == "HEALTHY"

    def test_observation_concurrency_is_one_per_tool(self, evidence_path):
        """Structural bound: the interceptor serializes observation per tool
        instance through an asyncio.Lock — two different tools may proceed
        concurrently, the same tool cannot interleave wrappers."""
        counter: dict = {}
        tool = make_real_tool("lock_action", counter)
        agent = FakeAgent(tools=[tool])
        attach = attach_governed_runtime(
            evidence_path,
            policy={"defaultAction": "allow"},
            agent_class=FakeAgent,
        )
        try:
            from cat.protocols.model_context.type_wrappers import ToolCall

            seen = []

            async def two():
                with ambient_request_context():
                    await asyncio.gather(
                        agent.call_tool(
                            ToolCall(id="call_l1", name="lock_action", args={"payload": "1"})
                        ),
                        agent.call_tool(
                            ToolCall(id="call_l2", name="lock_action", args={"payload": "2"})
                        ),
                    )

            run(two())
        finally:
            attach.detach()
        # After completion the observation lock exists but no wrapper.
        assert "_kerniq_observation_async_lock" in tool.__dict__
        assert "execute" not in tool.__dict__
        seen = statuses(evidence_path)
        assert seen.count("EXECUTED") == 2
