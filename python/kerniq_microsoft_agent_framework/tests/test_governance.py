"""Synthetic adversarial tests against installed MAF; not real-model proof."""
import asyncio
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace
import os

import pytest

pytest.importorskip("agent_framework", reason="optional MAF lane; install its pinned requirements")
from agent_framework import Content, FunctionInvocationContext, FunctionMiddleware, FunctionTool, MiddlewareFailure
from agent_framework._middleware import FunctionMiddlewarePipeline
from agent_framework._tools import _auto_invoke_function, normalize_function_invocation_configuration

from kerniq_microsoft_agent_framework.backend import GovernedFunction, TOOL_NAME
from kerniq_microsoft_agent_framework.evidence import project
from kerniq_microsoft_agent_framework.qualification import load_agentfuse, qualify_framework, verify_files


@pytest.fixture(scope="module")
def canonical():
    path = os.environ.get("KERNIQ_AGENTFUSE_SOURCE")
    if not path:
        pytest.skip("opt-in pinned AgentFuse source required; no mock fallback")
    qualify_framework()
    return load_agentfuse(Path(path))


def create_gate(canonical, tmp_path, *, block=False, fail=False, handler=None):
    state = {"count": 0}
    marker = tmp_path / "marker"
    async def physical(value):
        state["count"] += 1
        with marker.open("a") as f:
            f.write(value + "\n")
        if fail:
            raise ValueError("deliberate_test_failure")
        return "RECORDED:" + value
    guard = canonical.runtime_guard.RuntimeGuard(
        deny_tools={TOOL_NAME} if block else (), allow_tools={TOOL_NAME})
    gate = GovernedFunction(canonical, guard, handler or physical, str(tmp_path))
    return gate, state, marker


async def invoke(gate, *, value="kerniq-v0-8", call_id="synthetic-call", middleware=None):
    return await _auto_invoke_function(
        Content.from_function_call(call_id=call_id, name=TOOL_NAME, arguments={"value": value}),
        config=normalize_function_invocation_configuration(None),
        tool_map={TOOL_NAME: gate.tool},
        middleware_pipeline=FunctionMiddlewarePipeline(*(middleware or [gate])),
        live_tools=[gate.tool],
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("block", [True, False])
async def test_real_framework_invocation_and_physical_observations(canonical, tmp_path, block):
    gate, state, marker = create_gate(canonical, tmp_path, block=block)
    await invoke(gate)
    record = gate.records[0]
    assert state["count"] == (0 if block else 1)
    assert marker.exists() == (not block)
    if not block:
        assert marker.read_text().splitlines() == ["kerniq-v0-8"]
    document = project(record)
    assert document["decision"]["value"]["action"] == ("block" if block else "allow")
    assert document["outcome"]["value"]["status"] == ("not_executed" if block else "success")
    phases = [e["phase"] for e in record.events]
    assert phases[:2] == ["request", "decision"]
    assert ("start" in phases) == (not block)
    assert document["authorization"]["status"] == "unknown"
    assert document["argument_binding"]["requested"]["status"] == "unknown"
    assert document["argument_binding"]["authorization_match"]["status"] == "unknown"
    if not block:
        assert record.effective_digest == record.executed_digest
        assert phases == ["request", "decision", "release", "dispatch", "start", "completion", "closed"]
    else:
        assert all(not field["value"]["occurred"] for field in document["execution"].values())


@pytest.mark.asyncio
async def test_allow_is_not_handler_success(canonical, tmp_path):
    gate, state, marker = create_gate(canonical, tmp_path, fail=True)
    with pytest.raises(MiddlewareFailure):
        await invoke(gate)
    assert state["count"] == 1 and marker.exists()
    document = project(gate.records[0])
    assert document["decision"]["value"]["action"] == "allow"
    assert document["outcome"]["value"]["status"] == "failure"
    assert document["execution"]["completion"]["value"]["occurred"]


@pytest.mark.asyncio
async def test_policy_exception_fails_closed_in_canonical_path(canonical, tmp_path):
    gate, state, marker = create_gate(canonical, tmp_path)
    def broken_policy(request):
        assert state["count"] == 0 and not marker.exists()
        raise ValueError("synthetic_policy_error")
    gate.guard = canonical.runtime_guard.RuntimeGuard(policy=broken_policy)
    await invoke(gate)
    assert state["count"] == 0 and not marker.exists()
    assert gate.records[0].decision["action"] == "block"
    assert gate.records[0].outcome == "not_executed"


@pytest.mark.asyncio
async def test_decision_finishes_before_entry(canonical, tmp_path):
    gate, state, marker = create_gate(canonical, tmp_path)
    async def policy(request):
        assert state["count"] == 0 and not marker.exists()
        await asyncio.sleep(0)
        assert state["count"] == 0 and not marker.exists()
        return "allow"
    gate.guard = canonical.runtime_guard.RuntimeGuard(policy=policy)
    await invoke(gate)
    assert state["count"] == 1


@pytest.mark.asyncio
async def test_post_decision_argument_mutation_refused(canonical, tmp_path):
    gate, state, marker = create_gate(canonical, tmp_path)
    class Mutate(FunctionMiddleware):
        async def process(self, context, call_next):
            context.arguments = {"value": "changed"}
            await call_next()
    with pytest.raises(MiddlewareFailure, match="executed_argument"):
        await invoke(gate, middleware=[gate, Mutate()])
    assert state["count"] == 0 and not marker.exists()
    document = project(gate.records[0])
    assert document["decision"]["value"]["action"] == "allow"
    assert document["outcome"]["value"]["status"] == "not_executed"


@pytest.mark.asyncio
async def test_mutation_during_policy_await_refused(canonical, tmp_path):
    gate, state, marker = create_gate(canonical, tmp_path)
    context = FunctionInvocationContext(function=gate.tool, arguments={"value": "before"},
                                         metadata={"call_id": "synthetic"})
    async def policy(request):
        context.arguments = {"value": "after"}
        return "allow"
    gate.guard = canonical.runtime_guard.RuntimeGuard(policy=policy)
    async def downstream():
        pytest.fail("must not dispatch")
    with pytest.raises(MiddlewareFailure, match="decision_argument_mutation"):
        await gate.process(context, downstream)
    assert state["count"] == 0 and not marker.exists()


@pytest.mark.asyncio
@pytest.mark.parametrize("mode", ["invoke", "call"])
async def test_direct_invocation_without_release_refused(canonical, tmp_path, mode):
    gate, state, marker = create_gate(canonical, tmp_path)
    with pytest.raises(MiddlewareFailure, match="missing_or_stale"):
        if mode == "invoke":
            await gate.tool.invoke(arguments={"value": "direct"})
        else:
            context = FunctionInvocationContext(gate.tool, {"value": "direct"})
            await gate.tool(value="direct", ctx=context)
    assert state["count"] == 0 and not marker.exists()


@pytest.mark.asyncio
@pytest.mark.parametrize("change", ["name", "func", "model", "object"])
async def test_tool_identity_replacement_refused(canonical, tmp_path, change):
    gate, state, marker = create_gate(canonical, tmp_path)
    context = FunctionInvocationContext(gate.tool, {"value": "value"}, metadata={"call_id": "synthetic"})
    if change == "name":
        gate.tool.name = "replacement"
    elif change == "func":
        gate.tool.func = lambda value: "replacement"
    elif change == "model":
        gate.tool.input_model = None
    else:
        context.function = FunctionTool(name=TOOL_NAME, func=lambda value: "replacement")
    async def downstream():
        pytest.fail("unexpected dispatch")
    with pytest.raises(MiddlewareFailure, match="tool_identity"):
        await gate.process(context, downstream)
    assert state["count"] == 0 and not marker.exists()


@pytest.mark.asyncio
async def test_stale_decision_rejected_for_fresh_request(canonical, tmp_path):
    gate, _, _ = create_gate(canonical, tmp_path, block=True)
    saved = []
    original = gate.guard.aevaluate
    async def capture(request):
        result = await original(request)
        saved.append(result)
        return result
    gate.guard = SimpleNamespace(aevaluate=capture)
    await invoke(gate)
    other_dir = tmp_path / "other"
    other_dir.mkdir()
    other, state, marker = create_gate(canonical, other_dir)
    async def reuse(request):
        return saved[0]
    other.guard = SimpleNamespace(aevaluate=reuse)
    with pytest.raises(MiddlewareFailure, match="decision_binding"):
        await invoke(other)
    assert state["count"] == 0 and not marker.exists()


@pytest.mark.asyncio
async def test_stale_operation_and_new_call_id_both_rejected(canonical, tmp_path):
    gate, state, _ = create_gate(canonical, tmp_path)
    await invoke(gate)
    for call_id in ["synthetic-call", "new-model-retry-id"]:
        with pytest.raises(MiddlewareFailure, match="operation_already_claimed"):
            await invoke(gate, call_id=call_id)
    assert state["count"] == 1


@pytest.mark.asyncio
async def test_double_call_next_cannot_reenter_body(canonical, tmp_path):
    gate, state, _ = create_gate(canonical, tmp_path)
    class Twice(FunctionMiddleware):
        async def process(self, context, call_next):
            await call_next()
            await call_next()
    with pytest.raises(MiddlewareFailure, match="missing_or_stale"):
        await invoke(gate, middleware=[gate, Twice()])
    assert state["count"] == 1
    assert gate.records[0].outcome == "success"  # physical outcome remains separate


@pytest.mark.asyncio
async def test_downstream_cannot_swallow_execution(canonical, tmp_path):
    gate, state, marker = create_gate(canonical, tmp_path)
    class Skip(FunctionMiddleware):
        async def process(self, context, call_next):
            context.result = "pretend-success"
    with pytest.raises(MiddlewareFailure, match="did_not_enter"):
        await invoke(gate, middleware=[gate, Skip()])
    assert state["count"] == 0 and not marker.exists()


@pytest.mark.asyncio
async def test_concurrent_operations_are_isolated(canonical, tmp_path):
    dirs = [tmp_path / str(i) for i in range(6)]
    for directory in dirs:
        directory.mkdir()
    groups = [create_gate(canonical, directory, block=(i % 2 == 0)) for i, directory in enumerate(dirs)]
    await asyncio.gather(*(invoke(gate, call_id="same-provider-id") for gate, _, _ in groups))
    assert [state["count"] for _, state, _ in groups] == [0, 1, 0, 1, 0, 1]
    assert len({gate.records[0].request_id for gate, _, _ in groups}) == 6


@pytest.mark.asyncio
async def test_concurrent_calls_within_operation_do_not_duplicate(canonical, tmp_path):
    gate, state, _ = create_gate(canonical, tmp_path)
    results = await asyncio.gather(invoke(gate), invoke(gate, call_id="parallel"), return_exceptions=True)
    assert sum(isinstance(result, MiddlewareFailure) for result in results) == 1
    assert state["count"] == 1


@pytest.mark.asyncio
async def test_inherited_permit_in_child_task_rejected(canonical, tmp_path):
    gate, state, marker = create_gate(canonical, tmp_path)
    class ChildTask(FunctionMiddleware):
        async def process(self, context, call_next):
            await asyncio.create_task(call_next())
    with pytest.raises(MiddlewareFailure, match="missing_or_stale"):
        await invoke(gate, middleware=[gate, ChildTask()])
    assert state["count"] == 0 and not marker.exists()


@pytest.mark.asyncio
async def test_validation_precedes_gate(canonical, tmp_path):
    gate, state, marker = create_gate(canonical, tmp_path)
    await invoke(gate, value={"unexpected": "object"})
    assert not gate.records and state["count"] == 0 and not marker.exists()


@pytest.mark.asyncio
async def test_middleware_order(canonical, tmp_path):
    gate, state, _ = create_gate(canonical, tmp_path)
    steps = []
    class Outer(FunctionMiddleware):
        async def process(self, context, call_next):
            assert not gate.records
            steps.append("outer_before")
            await call_next()
            steps.append("outer_after")
    class Inner(FunctionMiddleware):
        async def process(self, context, call_next):
            assert gate.records[0].decision["action"] == "allow" and state["count"] == 0
            steps.append("inner_after_decision")
            await call_next()
    await invoke(gate, middleware=[Outer(), gate, Inner()])
    assert steps == ["outer_before", "inner_after_decision", "outer_after"]


def test_source_tamper_fails_admission(tmp_path):
    p = tmp_path / "source.py"
    p.write_text("changed")
    with pytest.raises(ValueError, match="unqualified_source"):
        verify_files(tmp_path, {"source.py": "0" * 64})


@pytest.mark.asyncio
@pytest.mark.parametrize("tamper", ["tool_identity", "argument_digest"])
async def test_canonical_decision_must_bind_tool_and_args(canonical, tmp_path, tamper):
    gate, state, marker = create_gate(canonical, tmp_path)
    original = gate.guard.aevaluate
    async def altered(request):
        result = await original(request)
        if tamper == "tool_identity":
            return replace(result, tool_name="different_tool")
        trace = replace(result.evidence.trace_metadata, args_hash="sha256:" + "0" * 64)
        return replace(result, evidence=replace(result.evidence, trace_metadata=trace))
    gate.guard = SimpleNamespace(aevaluate=altered)
    with pytest.raises(MiddlewareFailure, match="decision_binding"):
        await invoke(gate)
    assert state["count"] == 0 and not marker.exists()


@pytest.mark.asyncio
async def test_open_invocation_cannot_claim_final_absence(canonical, tmp_path):
    gate, _, _ = create_gate(canonical, tmp_path)
    async def policy(request):
        with pytest.raises(ValueError, match="open_invocation"):
            project(gate.records[0])
        return "allow"
    gate.guard = canonical.runtime_guard.RuntimeGuard(policy=policy)
    await invoke(gate)
    project(gate.records[0])


@pytest.mark.asyncio
async def test_cancellation_keeps_allow_and_entry_truth(canonical, tmp_path):
    entered = asyncio.Event()
    async def physical(value):
        entered.set()
        await asyncio.Event().wait()
    gate, _, _ = create_gate(canonical, tmp_path, handler=physical)
    task = asyncio.create_task(invoke(gate))
    await entered.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    evidence = project(gate.records[0])
    assert evidence["decision"]["value"]["action"] == "allow"
    assert evidence["execution"]["start"]["value"]["occurred"]
    assert evidence["outcome"]["value"]["status"] == "cancelled"


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["function", "chat"])
async def test_backend_refuses_unreviewed_client_middleware(canonical, tmp_path, kind):
    from agent_framework import ChatMiddleware
    from agent_framework.openai import OpenAIChatCompletionClient
    from openai import AsyncOpenAI
    from kerniq_microsoft_agent_framework.backend import MicrosoftAgentFrameworkGovernedBackend
    class ExtraFunction(FunctionMiddleware):
        async def process(self, context, call_next):
            await call_next()
    class ExtraChat(ChatMiddleware):
        async def process(self, context, call_next):
            await call_next()
    backend = MicrosoftAgentFrameworkGovernedBackend(Path(os.environ["KERNIQ_AGENTFUSE_SOURCE"]))
    async def physical(value):
        pytest.fail("body must not enter")
    async with AsyncOpenAI(api_key="synthetic-test-no-network") as api:
        client = OpenAIChatCompletionClient(model="synthetic-test", async_client=api,
                                           middleware=[ExtraFunction() if kind == "function" else ExtraChat()])
        with pytest.raises(ValueError, match="unqualified_client_or_middleware"):
            await backend.start_task(client, physical, block=False)


def test_backend_has_no_run_level_injection_surface():
    import inspect
    from kerniq_microsoft_agent_framework.backend import MicrosoftAgentFrameworkGovernedBackend
    parameters = inspect.signature(MicrosoftAgentFrameworkGovernedBackend.start_task).parameters
    assert set(parameters) == {"self", "client", "handler", "block", "delegated"}
    assert all(p.kind != inspect.Parameter.VAR_KEYWORD for p in parameters.values())


def test_retained_real_proof_receipt_conforms():
    import json
    from kerniq_evidence_conformance import validate_evidence_document
    report_dir = Path(__file__).resolve().parents[3] / "docs" / "development"
    receipt = json.loads((report_dir / "kerniq_microsoft_agent_framework_governance_v0_8.evidence.json").read_text())
    assert [case["case"] for case in receipt["cases"]] == [
        "single_block", "single_allow", "delegated_block", "delegated_allow"]
    for case in receipt["cases"]:
        validate_evidence_document(case["evidence_v0_2"])
        block = case["case"].endswith("_block")
        assert case["body_entry_count"] == (0 if block else 1)
        assert case["physical_marker_exists"] == (not block)
        assert case["physical_marker_line_count"] == case["body_entry_count"]
        assert case["record"]["decision"]["action"] == ("block" if block else "allow")
        assert case["evidence_v0_2"]["outcome"]["value"]["status"] == ("not_executed" if block else "success")
        assert case["record"]["events"][-1]["phase"] == "closed"
        assert case["result_returned_to_caller"]
        if case["case"].startswith("delegated"):
            assert case["record"]["parent_call_id"] == case["delegation_events"][0]["call_id"]
            assert case["delegation_events"][-1]["blocked_token_observed" if block else "recorded_token_observed"]
