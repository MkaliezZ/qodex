"""Phase 1 proof-closure regressions: MRO ownership domain, concurrent
exactly-once dispatch, full six-field IPC identity binding, the physical
execution evidence boundary, and evidence-failure runtime shutdown."""

from __future__ import annotations

import asyncio
import threading
import uuid
from contextlib import contextmanager
from pathlib import Path

import pytest

from kerniq_cheshire_preview import GovernancePatchError, attach_governed_runtime
from kerniq_cheshire_preview.evidence import EvidenceFailure
from kerniq_cheshire_preview.interceptor import _PATCH_REGISTRY

from .conftest import (
    FakeAgent,
    FakeDecision,
    FakeTool,
    FakeToolCall,
    allow_response,
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
class TestMroOwnershipDomain:
    def test_base_attach_then_subclass_attach_refused(self, evidence_path, tmp_path):
        class ChildAgent(FakeAgent):
            pass

        base = attach_governed_runtime(
            evidence_path, agent_class=FakeAgent, _sidecar=FakeDecision()
        )
        try:
            with pytest.raises(GovernancePatchError):
                attach_governed_runtime(
                    tmp_path / "child.jsonl",
                    agent_class=ChildAgent,
                    _sidecar=FakeDecision(),
                )
        finally:
            base.detach()

    def test_subclass_attach_then_base_attach_refused(self, evidence_path, tmp_path):
        class ChildAgent(FakeAgent):
            pass

        child = attach_governed_runtime(
            evidence_path, agent_class=ChildAgent, _sidecar=FakeDecision()
        )
        try:
            with pytest.raises(GovernancePatchError):
                attach_governed_runtime(
                    tmp_path / "base.jsonl",
                    agent_class=FakeAgent,
                    _sidecar=FakeDecision(),
                )
        finally:
            child.detach()

    def test_detach_refused_when_wrapper_replaced(self, agent, evidence_path):
        attach = attach_governed_runtime(
            evidence_path, agent_class=type(agent), _sidecar=FakeDecision()
        )
        try:
            entry = _PATCH_REGISTRY[type(agent)]
            original_wrapper = entry.installed_wrapper
            # A foreign patch is installed over the governed wrapper.
            async def foreign(self, tool_call, *args, **kwargs):
                raise NotImplementedError

            setattr(type(agent), "call_tool", foreign)
            with pytest.raises(GovernancePatchError):
                attach.detach()
        finally:
            setattr(type(agent), "call_tool", original_wrapper)
            entry.installed_wrapper = original_wrapper
            attach.detach()

    def test_failed_install_rolls_back_registry(self, evidence_path):
        class BlockingMeta(type(FakeAgent)):
            installed = False

            def __setattr__(cls, name, value):
                if name == "call_tool" and not BlockingMeta.installed:
                    raise RuntimeError("simulated install failure")
                return super().__setattr__(name, value)

        class LockedAgent(FakeAgent, metaclass=BlockingMeta):
            pass

        with pytest.raises(RuntimeError):
            attach_governed_runtime(
                evidence_path, agent_class=LockedAgent, _sidecar=FakeDecision()
            )
        entry = _PATCH_REGISTRY.get(LockedAgent)
        assert entry is None or not entry.active

    def test_concurrent_attach_only_one_wins(self, agent, evidence_path, tmp_path):
        results = []
        barrier = threading.Barrier(2)

        def try_attach(index):
            barrier.wait()
            try:
                attach = attach_governed_runtime(
                    tmp_path / f"e{index}.jsonl",
                    agent_class=type(agent),
                    _sidecar=FakeDecision(),
                )
            except GovernancePatchError:
                results.append("refused")
                return
            results.append("won")
            # keep it attached briefly so the other thread must lose
            import time

            time.sleep(0.2)
            attach.detach()

        threads = [
            threading.Thread(target=try_attach, args=(i,)) for i in range(2)
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        assert sorted(results) == ["refused", "won"]


@requires_real_cheshire
class TestConcurrentExactlyOnce:
    def test_same_tool_call_id_concurrent_fake(self, agent, allowed_tool, evidence_path):
        sidecar = FakeDecision(responses=[allow_response(), allow_response()])
        attach = attach_governed_runtime(
            evidence_path, agent_class=type(agent), _sidecar=sidecar
        )
        call = FakeToolCall(id="call_cc1", name="allowed_action", args={"v": 1})
        try:

            async def two():
                return await asyncio.gather(
                    agent.call_tool(call), agent.call_tool(call)
                )

            first, second = run(two())
        finally:
            attach.detach()
        assert allowed_tool.execution_count == 1
        assert "blocked by governance" in str(second)
        assert "duplicate_tool_call_replayed" in str(second)

    def test_same_tool_call_id_concurrent_real_execute(self, evidence_path):
        counter: dict = {}
        allowed = make_real_tool("allowed_action", counter)
        agent = FakeAgent(tools=[allowed])
        attach = attach_governed_runtime(
            evidence_path,
            policy={"defaultAction": "allow"},
            agent_class=FakeAgent,
        )
        try:
            from cat.protocols.model_context.type_wrappers import ToolCall

            call = ToolCall(id="call_cc2", name="allowed_action", args={"payload": "p"})

            async def two():
                with ambient_request_context():
                    return await asyncio.gather(
                        agent.call_tool(call), agent.call_tool(call)
                    )

            first, second = run(two())
        finally:
            attach.detach()
        assert counter.get("allowed_action", 0) == 1
        assert "duplicate_tool_call_replayed" in str(second)


@requires_real_cheshire
class TestFullIdentityBinding:
    def _mismatch_case(self, agent, allowed_tool, evidence_path, field, bad_value):
        sidecar = FakeDecision(
            responses=[dict(allow_response(), **{field: bad_value})]
        )
        attach = attach_governed_runtime(
            evidence_path, agent_class=type(agent), _sidecar=sidecar
        )
        try:
            run(agent.call_tool(FakeToolCall(id="call_m1", name="allowed_action", args={})))
        finally:
            attach.detach()
        assert allowed_tool.execution_count == 0
        blocked = [e for e in read_evidence(evidence_path) if e["status"] == "BLOCKED"][0]
        assert blocked["reason"] == f"identity_mismatch:{field}"

    def test_runtime_id_mismatch(self, agent, allowed_tool, evidence_path):
        self._mismatch_case(agent, allowed_tool, evidence_path, "runtime_id", "other-runtime")

    def test_session_id_mismatch(self, agent, allowed_tool, evidence_path):
        self._mismatch_case(agent, allowed_tool, evidence_path, "session_id", "other-session")

    def test_turn_id_mismatch(self, agent, allowed_tool, evidence_path):
        self._mismatch_case(agent, allowed_tool, evidence_path, "turn_id", "other-turn")

    def test_protocol_version_mismatch(self, agent, allowed_tool, evidence_path):
        self._mismatch_case(agent, allowed_tool, evidence_path, "protocol_version", 99)


@requires_real_cheshire
class TestPhysicalExecutionEvidenceBoundary:
    def test_fake_result_without_execute_produces_no_executed(self, evidence_path):
        from cat.services.agents.base import Agent as RealAgent

        class LyingAgent(FakeAgent):
            """Dispatcher that fabricates a result without invoking
            Tool.execute — exactly the H-04 adversarial case."""

            async def call_tool(self, tool_call, *args, **kwargs):
                return "fabricated-tool-output"

        agent = LyingAgent(tools=[])
        sidecar = FakeDecision(responses=[allow_response()])
        attach = attach_governed_runtime(
            evidence_path, agent_class=LyingAgent, _sidecar=sidecar
        )
        try:
            result = run(
                agent.call_tool(
                    FakeToolCall(id="call_h4a", name="allowed_action", args={"v": 1})
                )
            )
        finally:
            attach.detach()
        assert "fabricated" in str(result)
        assert "EXECUTED" not in statuses(evidence_path)
        assert "EXECUTED" not in [s for s in statuses(evidence_path)]

    def test_real_execute_executed_arguments_come_from_boundary(
        self, evidence_path
    ):
        counter: dict = {}
        allowed = make_real_tool("allowed_action", counter)
        agent = FakeAgent(tools=[allowed])
        attach = attach_governed_runtime(
            evidence_path,
            policy={"defaultAction": "allow"},
            agent_class=FakeAgent,
        )
        try:
            from cat.protocols.model_context.type_wrappers import ToolCall

            with ambient_request_context():
                run(
                    agent.call_tool(
                        ToolCall(
                            id="call_h4b",
                            name="allowed_action",
                            args={"payload": "boundary"},
                        )
                    )
                )
        finally:
            attach.detach()
        executed = [e for e in read_evidence(evidence_path) if e["status"] == "EXECUTED"]
        assert len(executed) == 1
        assert executed[0]["executed_arguments"] == {"payload": "boundary"}
        assert "executed:boundary" in executed[0]["tool_result"]


@requires_real_cheshire
class TestEvidenceFailureShutdown:
    def test_outcome_evidence_failure_blocks_subsequent_calls(
        self, agent, allowed_tool, evidence_path, monkeypatch
    ):
        import kerniq_cheshire_preview.interceptor as interceptor_module

        sidecar = FakeDecision(responses=[allow_response(), allow_response()])
        attach = attach_governed_runtime(
            evidence_path, agent_class=type(agent), _sidecar=sidecar
        )
        try:
            # First call executes; its EXECUTED (terminal outcome) evidence
            # write fails → the runtime must degrade.
            def failing_record(*args, **kwargs):
                raise EvidenceFailure("terminal outcome write failed")

            monkeypatch.setattr(
                interceptor_module, "record_executed", failing_record
            )
            run(agent.call_tool(FakeToolCall(id="call_h5a", name="allowed_action", args={})))
            assert allowed_tool.execution_count == 1
            assert attach.health == "EVIDENCE_DEGRADED"

            monkeypatch.undo()
            second = run(
                agent.call_tool(FakeToolCall(id="call_h5b", name="allowed_action", args={}))
            )
        finally:
            attach.detach()
        assert allowed_tool.execution_count == 1, "degraded runtime must not execute"
        assert "runtime_evidence_degraded" in str(second)
