"""A single-operation Python adapter, not a general MAF tool firewall.

Only the adapter-created async local FunctionTool(value: str), on the reviewed
Agent.run path, is admitted. The caller supplies trusted local handler code and
the canonical AgentFuse RuntimeGuard. Arbitrary in-process Python code is outside
the trust boundary. No run-level tools, middleware, approval replay or sessions
are accepted through this API.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
from contextvars import ContextVar
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable
from uuid import uuid4

from agent_framework import Agent, FunctionInvocationContext, FunctionMiddleware, FunctionTool, MiddlewareFailure
from agent_framework.openai import OpenAIChatCompletionClient

from .qualification import PROFILE, MAF_VERSION, load_agentfuse, qualify_framework

TOOL_NAME = "kerniq_record_marker"
_parent_call: ContextVar[str | None] = ContextVar("maf_parent_call", default=None)


def now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def argument_digest(arguments: dict[str, Any]) -> str:
    if set(arguments) != {"value"} or type(arguments["value"]) is not str:
        raise MiddlewareFailure("unsupported_effective_arguments")
    if len(arguments["value"].encode("utf-8")) > 1024:
        raise MiddlewareFailure("argument_limit")
    # Match canonical AgentFuse hashing for this deliberately flat string domain.
    raw = json.dumps(arguments, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(raw).hexdigest()


@dataclass
class Invocation:
    request_id: str
    call_id: str
    occurrence_id: str | None
    run_id: str
    effective_digest: str
    parent_call_id: str | None
    events: list[dict[str, Any]] = field(default_factory=list)
    decision: dict[str, Any] | None = None
    executed_digest: str | None = None
    outcome: str = "unknown"
    reason: str = "no_terminal_observation"

    def event(self, phase: str) -> None:
        self.events.append({"sequence": len(self.events), "phase": phase, "at": now()})


@dataclass
class Permit:
    context: FunctionInvocationContext
    record: Invocation
    owner_task: Any
    consumed: bool = False


class GovernedFunction(FunctionMiddleware):
    """Interception plus one-use entry binding; AgentFuse owns the decision."""

    def __init__(self, canonical: Any, guard: Any, handler: Callable[[str], Awaitable[str]],
                 run_id: str) -> None:
        self.canonical = canonical
        self.guard = guard
        self.handler = handler
        self.run_id = run_id
        self.records: list[Invocation] = []
        self.claimed = False
        self._permit: ContextVar[Permit | None] = ContextVar("maf_permit_" + run_id, default=None)

        async def bound_function(value: str, ctx: FunctionInvocationContext) -> str:
            permit = self._permit.get()
            if (permit is None or permit.consumed or permit.owner_task is not asyncio.current_task()
                    or permit.context is not ctx or ctx.function is not self.tool):
                raise MiddlewareFailure("missing_or_stale_entry_permit")
            self._check_identity(ctx)
            executed_digest = argument_digest({"value": value})
            if (executed_digest != permit.record.effective_digest
                    or argument_digest(dict(ctx.arguments)) != executed_digest):
                raise MiddlewareFailure("executed_argument_binding_mismatch")
            # Consume before any await. Nested calls/inherited child-task contexts
            # cannot reuse the release, even while the physical handler is running.
            permit.consumed = True
            record = permit.record
            record.executed_digest = executed_digest
            record.event("start")
            try:
                result = await self.handler(value)
            except BaseException as exc:
                record.outcome = "cancelled" if isinstance(exc, asyncio.CancelledError) else "failure"
                record.reason = "physical_handler_" + type(exc).__name__
                record.event("completion")
                raise
            record.outcome = "success"
            record.reason = ""
            record.event("completion")
            return result

        self.tool = FunctionTool(
            name=TOOL_NAME, description="Append one value to the local proof marker.",
            func=bound_function,
        )
        self._function = self.tool.func
        self._input_model = self.tool.input_model
        self._schema = json.dumps(self.tool.parameters(), sort_keys=True)
        self._invoke = self.tool.invoke.__func__

    def _check_identity(self, context: FunctionInvocationContext) -> None:
        if (type(context.function) is not FunctionTool or context.function is not self.tool
                or self.tool.func is not self._function or self.tool.name != TOOL_NAME
                or self.tool.input_model is not self._input_model
                or getattr(self.tool.invoke, "__func__", None) is not self._invoke
                or json.dumps(self.tool.parameters(), sort_keys=True) != self._schema
                or self.tool.declaration_only or self.tool.approval_mode != "never_require"):
            raise MiddlewareFailure("tool_identity_mismatch")

    async def process(self, context: FunctionInvocationContext, call_next: Callable[[], Awaitable[None]]) -> None:
        self._check_identity(context)
        call_id = context.metadata.get("call_id")
        if not isinstance(call_id, str) or not call_id:
            raise MiddlewareFailure("missing_framework_call_id")
        if self.claimed:
            raise MiddlewareFailure("operation_already_claimed")
        self.claimed = True  # operation scope, before decision awaits or concurrent calls
        args = dict(context.arguments)
        digest = argument_digest(args)
        record = Invocation("maf-request-" + uuid4().hex, call_id,
                            context.metadata.get("function_call_occurrence_id"),
                            self.run_id, digest, _parent_call.get())
        self.records.append(record)
        record.event("request")
        request = self.canonical.runtime_guard.ToolCallRequest(
            tool_call_id=record.request_id, tool_name=TOOL_NAME, arguments=args,
            safe_metadata={"runtime_ref": self.run_id, "provider_call_id": call_id},
        )
        try:
            resolved = await self.guard.aevaluate(request)
            if (not isinstance(resolved, self.canonical.runtime_guard.RuntimeGuardDecision)
                    or resolved.tool_call_id != record.request_id or resolved.tool_name != TOOL_NAME
                    or resolved.evidence.trace_metadata.args_hash != "sha256:" + digest
                    or resolved.evidence.trace_metadata.tool_name != TOOL_NAME
                    or resolved.evidence.trace_metadata.decision != resolved.action):
                raise MiddlewareFailure("decision_binding_mismatch")
            record.decision = resolved.to_safe_dict()
            record.event("decision")
            self._check_identity(context)
            if argument_digest(dict(context.arguments)) != digest:
                raise MiddlewareFailure("decision_argument_mutation")
            if resolved.action == "block":
                record.outcome = "not_executed"
                record.reason = "agentfuse_policy_block"
                record.event("blocked")
                context.result = "BLOCKED_BY_AGENTFUSE"
                return
            if resolved.action != "allow":
                raise MiddlewareFailure("unsupported_decision")
            record.event("release")
            permit = Permit(context, record, asyncio.current_task())
            token = self._permit.set(permit)
            try:
                record.event("dispatch")
                await call_next()
                if not permit.consumed:
                    raise MiddlewareFailure("downstream_did_not_enter_bound_function")
            finally:
                self._permit.reset(token)
        except BaseException as exc:
            if record.executed_digest is None:
                record.outcome = "not_executed"
                record.reason = "adapter_refused_" + type(exc).__name__
            # Do not mislabel a handler success/failure as a policy BLOCK.
            if isinstance(exc, (MiddlewareFailure, asyncio.CancelledError)):
                raise
            raise MiddlewareFailure("governance_or_handler_failure") from exc
        finally:
            record.event("closed")


class DelegationObserver(FunctionMiddleware):
    """Observes the official B.as_tool call; does not govern delegation itself."""
    def __init__(self, delegated_tool: FunctionTool) -> None:
        self.tool = delegated_tool
        self.events: list[dict[str, Any]] = []

    async def process(self, context: FunctionInvocationContext, call_next: Callable[[], Awaitable[None]]) -> None:
        if context.function is not self.tool:
            raise MiddlewareFailure("unexpected_delegation_tool")
        call_id = context.metadata.get("call_id")
        self.events.append({"phase": "delegation_start", "call_id": call_id, "at": now()})
        token = _parent_call.set(call_id)
        try:
            await call_next()
            parts = context.result
            text = parts if isinstance(parts, str) else "".join(
                (getattr(part, "text", None) or "") for part in (parts or []))
            self.events.append({
                "phase": "delegation_return", "call_id": call_id, "at": now(),
                "result_sha256": hashlib.sha256(text.encode()).hexdigest(),
                "blocked_token_observed": "BLOCKED_BY_AGENTFUSE" in text,
                "recorded_token_observed": "RECORDED:kerniq-v0-8" in text,
            })
        finally:
            _parent_call.reset(token)


@dataclass
class RunResult:
    run_id: str
    records: list[Invocation]
    response: Any
    delegation_events: list[dict[str, Any]]


class MicrosoftAgentFrameworkGovernedBackend:
    """Opt-in Python lane with a sealed construction surface, one tool per run.

    This is not registered as a desktop provider. Capability uses KerniQ's existing
    vocabulary and refers exclusively to this adapter's bounded start_task path.
    """
    id = "microsoft-agent-framework-local"
    kind = "microsoft-agent-framework"

    def __init__(self, agentfuse_source: Path) -> None:
        qualify_framework()
        self.canonical = load_agentfuse(agentfuse_source)

    def probe_capabilities(self) -> dict[str, Any]:
        qualify_framework()
        return {"version": MAF_VERSION, "profile": PROFILE, "capabilities": {
            "supportsStreaming": False, "supportsCancel": False,
            "supportsToolEvents": True, "supportsResume": False,
            "governanceTier": "GOVERNED", "governanceMode": "external_decision",
        }}

    def guard(self, *, block: bool) -> Any:
        # Trusted host policy fixtures, not model arguments or middleware policy.
        guard_type = self.canonical.runtime_guard.RuntimeGuard
        return guard_type(deny_tools={TOOL_NAME}) if block else guard_type(allow_tools={TOOL_NAME})

    async def start_task(self, client: OpenAIChatCompletionClient, handler: Callable[[str], Awaitable[str]],
                         *, block: bool, delegated: bool = False) -> RunResult:
        qualify_framework()
        if type(client) is not OpenAIChatCompletionClient or client.function_middleware or client.chat_middleware:
            raise ValueError("unqualified_client_or_middleware")
        run_id = "maf-run-" + uuid4().hex
        gate = GovernedFunction(self.canonical, self.guard(block=block), handler, run_id)
        child = Agent(
            client=client, name="kerniq-maf-child", tools=[gate.tool], middleware=[gate],
            instructions="Call kerniq_record_marker exactly once with value kerniq-v0-8. "
                         "After its result, do not retry. Return its exact result text.",
        )
        observer = None
        runner = child
        if delegated:
            delegated_tool = child.as_tool(name="delegate_to_marker_agent", description="Run the local marker test.")
            observer = DelegationObserver(delegated_tool)
            runner = Agent(
                client=client, name="kerniq-maf-parent", tools=[delegated_tool], middleware=[observer],
                instructions="Delegate the marker test exactly once to delegate_to_marker_agent. "
                             "After the child returns, do not retry. Return its exact result text.",
            )
        response = await runner.run("Perform the local marker test using your tool.")
        return RunResult(run_id, gate.records, response, observer.events if observer else [])
