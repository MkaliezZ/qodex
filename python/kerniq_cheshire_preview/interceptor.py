"""Runtime interceptor for the Cheshire Cat governed preview (proof closure).

Attaches to the validated seam (``Agent.call_tool`` → ``Tool.execute``) by
patching ``call_tool`` at runtime. No user code is modified, nothing is
imported by user code, and the original dispatcher keeps ownership of tool
execution:

- ``block`` — the original ``call_tool`` is never invoked, so ``Tool.execute``
  cannot run; a host-native blocked ``Message`` correlated with the original
  ``tool_call_id`` is returned instead.
- ``allow`` — the original ``call_tool`` runs exactly once; concurrent or
  replayed ``tool_call_id`` requests cannot reach physical execution twice.

Proof-closure hardening on top of the hardened prototype:

H-01  MRO ownership domain — attaches whose classes overlap in the method
      resolution path (base/subclass in either direction) are one governance
      domain; overlapping active attaches are refused, install publication is
      atomic (registry entry + wrapper under one lock, with rollback), and
      detach verifies owner identity + generation + the currently installed
      wrapper object before restoring anything.

H-02  Atomic reservation lifecycle — every tool_call_id moves
      UNKNOWN → RESERVED → DISPATCHING → EXECUTED/FAILED under a lock; only
      the request that wins the UNKNOWN→RESERVED transition may reach
      physical execution, concurrent duplicates are deterministically
      rejected.

H-03  Full identity binding — the sidecar response must echo all six
      identity fields (request_id, tool_call_id, runtime_id, session_id,
      turn_id, protocol_version); any missing/mismatched/stale or
      unsupported-version response fails closed.

H-04  Physical execution evidence boundary — EXECUTED evidence (and its
      executed_arguments) is emitted only from inside the real
      ``Tool.execute`` invocation, observed through a temporary per-request
      instance wrapper. This is an observation boundary, not a second
      execution path: if the dispatcher returns without invoking
      ``Tool.execute``, no EXECUTED evidence is produced.

H-05  Runtime health fail-closed — when terminal (outcome) evidence cannot
      be persisted, the attach degrades to EVIDENCE_DEGRADED and every
      subsequent governed request is blocked; no silent continuation.
"""

from __future__ import annotations

import asyncio
import contextvars
import json
import os
import subprocess
import sys
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Optional

from .admission import AdmittedRuntime, admit_governed_runtime
from .evidence import (
    EvidenceFailure,
    record_authorized,
    record_blocked,
    record_dispatch_started,
    record_executed,
    record_failure,
    record_requested,
)
from .sidecar_main import PROTOCOL_VERSION

DEFAULT_SIDECAR_TIMEOUT_SECONDS = 2.0

_PATCH_LOCK = threading.RLock()

HEALTHY = "HEALTHY"
EVIDENCE_DEGRADED = "EVIDENCE_DEGRADED"

# tool_call_id lifecycle states (H-02)
_CALL_UNKNOWN = "UNKNOWN"
_CALL_RESERVED = "RESERVED"
_CALL_DISPATCHING = "DISPATCHING"
_CALL_EXECUTED = "EXECUTED"
_CALL_FAILED = "FAILED"


@dataclass
class _PatchOwnership:
    owner_id: str
    generation: int
    agent_class: type
    original_call_tool: Any
    original_identity: str
    installed_wrapper: Any = None
    active: bool = True
    had_own_call_tool: bool = False
    installed_execute_guard: Any = None


_PATCH_REGISTRY: Dict[type, _PatchOwnership] = {}

# Per-attach dispatch authorization token: set only inside a governed
# dispatch (the observed execute wrapper), checked by the Tool.execute
# guard. A direct execute call that bypasses the governed call_tool carries
# no token and fails closed before any physical execution.
_dispatch_token: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "kerniq_governed_dispatch_token", default=None
)


class GovernancePatchError(RuntimeError):
    """Patch ownership violation (overlapping/nested attach, out-of-order or
    stale detach, wrapper tampering)."""


def _classes_overlap(first: type, second: type) -> bool:
    """True when the two classes share a method-resolution path — i.e. an
    attach on either could intercept calls dispatched through the other
    (base/subclass in either direction)."""
    return first is not second and (
        issubclass(first, second) or issubclass(second, first)
    )


def _assert_no_overlapping_active_attach(agent_class: type) -> None:
    for registered, entry in _PATCH_REGISTRY.items():
        if not entry.active:
            continue
        if registered is agent_class or _classes_overlap(registered, agent_class):
            raise GovernancePatchError(
                "overlapping governed attach refused: "
                f"{agent_class!r} shares a resolution path with active attach "
                f"on {registered!r} (owner={entry.owner_id})"
            )


class _SidecarClient:
    """Minimal JSON-lines IPC client to the governance sidecar process."""

    def __init__(self, policy: Dict[str, Any]) -> None:
        package_parent = str(Path(__file__).resolve().parents[1])
        env = dict(os.environ)
        existing = env.get("PYTHONPATH", "")
        env["PYTHONPATH"] = (
            package_parent + (os.pathsep + existing if existing else "")
        )
        self._process = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "kerniq_cheshire_preview.sidecar_main",
                json.dumps(policy),
            ],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            encoding="utf-8",
            bufsize=1,
            env=env,
        )
        self._pool = ThreadPoolExecutor(max_workers=1)

    def request(self, request: Dict[str, Any], timeout: float) -> Optional[Dict[str, Any]]:
        future = self._pool.submit(self._roundtrip, request)
        try:
            return future.result(timeout=timeout)
        except Exception:
            return None

    def _roundtrip(self, request: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        assert self._process.stdin is not None and self._process.stdout is not None
        try:
            self._process.stdin.write(json.dumps(request) + "\n")
            self._process.stdin.flush()
            line = self._process.stdout.readline()
        except (OSError, ValueError):
            return None
        if not line:
            return None
        try:
            return json.loads(line)
        except ValueError:
            return None

    def close(self) -> None:
        try:
            if self._process.stdin:
                self._process.stdin.close()
            self._process.wait(timeout=5)
        except Exception:
            self._process.kill()
        self._pool.shutdown(wait=False)


@dataclass
class _CallRecord:
    state: str = _CALL_UNKNOWN
    executed_arguments: Any = None
    tool_result: Any = None


@dataclass
class _AttachState:
    """Per-attach mutable governance state."""

    calls: Dict[str, _CallRecord] = field(default_factory=dict)
    calls_lock: threading.Lock = field(default_factory=threading.Lock)
    health: str = HEALTHY
    health_lock: threading.Lock = field(default_factory=threading.Lock)

    def degrade(self) -> None:
        with self.health_lock:
            self.health = EVIDENCE_DEGRADED

    @property
    def degraded(self) -> bool:
        with self.health_lock:
            return self.health != HEALTHY

    def reserve(self, tool_call_id: str) -> bool:
        """Atomic UNKNOWN→RESERVED transition: exactly one concurrent caller
        wins; everyone else (reserved/dispatching/executed/failed) is a
        deterministic duplicate."""
        with self.calls_lock:
            record = self.calls.get(tool_call_id)
            if record is None:
                self.calls[tool_call_id] = _CallRecord(state=_CALL_RESERVED)
                return True
            return False

    def transition(self, tool_call_id: str, expected_from: str, to: str) -> bool:
        with self.calls_lock:
            record = self.calls.get(tool_call_id)
            if record is None or record.state != expected_from:
                return False
            record.state = to
            return True

    def finish(
        self,
        tool_call_id: str,
        to: str,
        executed_arguments: Any = None,
        tool_result: Any = None,
    ) -> None:
        with self.calls_lock:
            record = self.calls.get(tool_call_id)
            if record is not None:
                record.state = to
                record.executed_arguments = executed_arguments
                record.tool_result = tool_result


@dataclass
class GovernedAttach:
    """Handle over one governed runtime attach."""

    runtime: AdmittedRuntime
    evidence_path: Path
    sidecar: Any
    timeout_seconds: float
    owner_id: str
    generation: int
    runtime_id: str
    session_id: str
    turn_id: str
    state: _AttachState
    _agent_class: type
    _detached: bool = False
    _sidecar_closed: bool = False

    @property
    def health(self) -> str:
        return self.state.health

    def detach(self) -> None:
        """Restore the original seam if — and only if — this handle still
        owns the active patch, the generation matches, and the wrapper
        currently installed on the class is the one this attach published.
        Idempotent; stale, out-of-order, or tampered handles are refused."""
        with _PATCH_LOCK:
            entry = _PATCH_REGISTRY.get(self._agent_class)
            if entry is not None and entry.active and entry.owner_id != self.owner_id:
                raise GovernancePatchError(
                    "detach refused: handle does not own the active governed attach "
                    f"(owner={self.owner_id}, current={entry.owner_id})"
                )
            if self._detached:
                return  # idempotent
            if entry is None or not entry.active:
                self._detached = True
                self._close_sidecar()
                return
            if entry.generation != self.generation:
                raise GovernancePatchError(
                    "detach refused: generation changed "
                    f"(handle={self.generation}, registry={entry.generation})"
                )
            installed = getattr(self._agent_class, "call_tool", None)
            if installed is not entry.installed_wrapper:
                raise GovernancePatchError(
                    "detach refused: the installed wrapper is not the one this "
                    "attach published (wrapper tampering or foreign patch)"
                )
            if entry.installed_execute_guard is not None:
                setattr(
                    self.runtime.tool_class,
                    "execute",
                    self.runtime.audited_execute,
                )
            if entry.had_own_call_tool:
                setattr(self._agent_class, "call_tool", entry.original_call_tool)
            elif "call_tool" in self._agent_class.__dict__:
                # The pristine state inherited the audited base
                # implementation; leaving our own entry behind would turn
                # the class into an override every later admission refuses.
                delattr(self._agent_class, "call_tool")
            # Keep the retired entry so the next attach generation increments
            # from it (active=False makes it inert for ownership checks).
            entry.active = False
            self._detached = True
        self._close_sidecar()

    def _close_sidecar(self) -> None:
        if not self._sidecar_closed:
            self._sidecar_closed = True
            self.sidecar.close()


def _tool_call_fields(tool_call: Any) -> tuple[str, Any, str]:
    name = getattr(tool_call, "name", None)
    arguments = getattr(tool_call, "args", None)
    call_id = getattr(tool_call, "id", None) or f"preview_{uuid.uuid4().hex[:12]}"
    return (str(name) if name is not None else ""), arguments, call_id


_IDENTITY_FIELDS = (
    "request_id",
    "tool_call_id",
    "runtime_id",
    "session_id",
    "turn_id",
)


def _decision_from_response(
    response: Optional[Dict[str, Any]],
    request_identity: Dict[str, Any],
) -> tuple[str, str]:
    """Validate the full six-field identity binding (H-03), then map to a
    canonical action. Missing, mismatched (stale or replayed), unsupported
    protocol, or unknown actions all fail closed."""
    if response is None:
        return "block", "sidecar_unavailable"
    if response.get("type") != "decision":
        return "block", "identity_mismatch:bad_response_type"
    for field_name in _IDENTITY_FIELDS:
        if response.get(field_name) != request_identity[field_name]:
            return "block", f"identity_mismatch:{field_name}"
    if response.get("protocol_version") != PROTOCOL_VERSION:
        return "block", "identity_mismatch:protocol_version"
    candidate = response.get("decision")
    if candidate == "allow":
        return "allow", str(response.get("reason", "allowed"))
    if candidate == "block":
        return "block", str(response.get("reason", "blocked"))
    return "block", f"unknown_decision:{candidate!r}"


def _resolve_tool(self: Any, tool_name: str) -> Optional[Any]:
    for tool in getattr(self, "tools", []) or []:
        if getattr(tool, "name", None) == tool_name:
            return tool
    return None


def attach_governed_runtime(
    evidence_path: Path,
    *,
    policy: Optional[Dict[str, Any]] = None,
    agent_class: Optional[type] = None,
    sidecar_timeout_seconds: float = DEFAULT_SIDECAR_TIMEOUT_SECONDS,
    runtime_id: Optional[str] = None,
    session_id: Optional[str] = None,
    turn_id: Optional[str] = None,
    _sidecar: Optional[Any] = None,
) -> GovernedAttach:
    """Admit the runtime and install the governed ``call_tool`` interceptor.

    Fails closed: admission failure raises ``GovernanceAttachError`` and
    nothing is patched; an overlapping active attach (same class or any
    class sharing its resolution path) raises ``GovernancePatchError``.
    """
    # Governed wrappers we ourselves installed are not dispatch overrides;
    # everything else on the resolution path still must be the audited base.
    exempt = tuple(
        entry.installed_wrapper
        for entry in _PATCH_REGISTRY.values()
        if entry.installed_wrapper is not None
    )
    runtime = admit_governed_runtime(agent_class, exempt_call_tools=exempt)
    resolved_policy = policy if policy is not None else {"defaultAction": "block"}
    sidecar = _sidecar if _sidecar is not None else _SidecarClient(resolved_policy)
    evidence_path = Path(evidence_path)
    runtime_identity = runtime_id or f"preview_runtime_{uuid.uuid4().hex[:12]}"
    session_identity = session_id or f"preview_session_{uuid.uuid4().hex[:12]}"
    turn_identity = turn_id or f"preview_turn_{uuid.uuid4().hex[:12]}"
    state = _AttachState()

    # Serialized publication of registry entry + class wrapper (H-01): both
    # happen under the patch lock or neither does.
    with _PATCH_LOCK:
        _assert_no_overlapping_active_attach(runtime.agent_class)
        existing_retired = _PATCH_REGISTRY.get(runtime.agent_class)
        original_call_tool = runtime.agent_class.call_tool
        generation = (
            (existing_retired.generation + 1) if existing_retired is not None else 1
        )
        owner_id = f"owner_{uuid.uuid4().hex[:16]}"
        original_identity = getattr(
            original_call_tool, "__qualname__", str(original_call_tool)
        )

        async def governed_call_tool(self, tool_call, *args, **kwargs):
            tool_name, requested_arguments, tool_call_id = _tool_call_fields(tool_call)
            request_id = f"req_{uuid.uuid4().hex[:16]}"

            def blocked(text: str) -> Any:
                return runtime.blocked_message(
                    f"[kerniq] tool '{tool_name}' blocked by governance "
                    f"{text}; decision=block, dispatch=false",
                    tool_call,
                )

            if state.degraded:
                # H-05: terminal evidence could not be persisted earlier;
                # this runtime no longer executes anything.
                return blocked("(runtime_evidence_degraded)")

            # F-01: re-verify wrapper integrity before any governed
            # dispatch. If anything replaced, removed, or shadowed the
            # wrapper this attach published, fail closed and degrade — a
            # foreign patch must not execute while the registry is active.
            resolved_call_tool = getattr(type(self), "call_tool", None)
            if resolved_call_tool is not ownership.installed_wrapper:
                state.degrade()
                return blocked("(governed_wrapper_replaced)")

            try:
                record_requested(
                    evidence_path,
                    request_id=request_id,
                    tool_call_id=tool_call_id,
                    tool_name=tool_name,
                    requested_arguments=requested_arguments,
                )
            except EvidenceFailure:
                return blocked("(evidence_unavailable)")

            if not state.reserve(tool_call_id):
                # H-02: concurrent or replayed tool_call_id — deterministic
                # duplicate rejection, never a second physical execution.
                try:
                    record_blocked(
                        evidence_path,
                        request_id=request_id,
                        tool_call_id=tool_call_id,
                        tool_name=tool_name,
                        requested_arguments=requested_arguments,
                        policy_decision="block",
                        reason="duplicate_tool_call_replayed",
                    )
                except EvidenceFailure:
                    pass
                return blocked("(duplicate_tool_call_replayed)")

            identity = {
                "request_id": request_id,
                "tool_call_id": tool_call_id,
                "runtime_id": runtime_identity,
                "session_id": session_identity,
                "turn_id": turn_identity,
                "protocol_version": PROTOCOL_VERSION,
            }
            response = sidecar.request(
                {
                    "type": "governance",
                    "tool": tool_name,
                    "arguments": requested_arguments
                    if isinstance(requested_arguments, dict)
                    else {},
                    **identity,
                },
                timeout=sidecar_timeout_seconds,
            )
            decision, reason = _decision_from_response(response, identity)

            if decision != "allow":
                state.finish(tool_call_id, to=_CALL_FAILED)
                try:
                    record_blocked(
                        evidence_path,
                        request_id=request_id,
                        tool_call_id=tool_call_id,
                        tool_name=tool_name,
                        requested_arguments=requested_arguments,
                        policy_decision="block",
                        reason=reason,
                    )
                except EvidenceFailure:
                    pass  # already blocked; evidence failure cannot change that
                return blocked(f"({reason})")

            # Authorized: record the policy snapshot (no execution claims).
            try:
                record_authorized(
                    evidence_path,
                    request_id=request_id,
                    tool_call_id=tool_call_id,
                    tool_name=tool_name,
                    policy_decision="allow",
                    effective_arguments=requested_arguments,
                    reason=reason,
                )
            except EvidenceFailure:
                state.finish(tool_call_id, to=_CALL_FAILED)
                return blocked("(evidence_unavailable)")

            state.transition(tool_call_id, _CALL_RESERVED, _CALL_DISPATCHING)

            tool = _resolve_tool(self, tool_name)
            try:
                record_dispatch_started(
                    evidence_path,
                    request_id=request_id,
                    tool_call_id=tool_call_id,
                    tool_name=tool_name,
                )
            except EvidenceFailure:
                state.finish(tool_call_id, to=_CALL_FAILED)
                return blocked("(evidence_unavailable)")

            executed: Dict[str, Any] = {}

            def observe_execution(arguments_at_boundary: Any, result: Any) -> None:
                # H-04: this fires only inside the real Tool.execute - the
                # single legitimate source of EXECUTED evidence.
                executed["arguments"] = arguments_at_boundary
                executed["result"] = result

            # F-03: the physical execution boundary must be the audited
            # Tool.execute. A pre-existing instance-level override, a class
            # override between the tool's class and the audited Tool base, or
            # a non-audited execute identity is unsupported and fails closed
            # (no EXECUTED evidence may ever be produced from it).
            if tool is not None:
                if "execute" in getattr(tool, "__dict__", {}):
                    state.finish(tool_call_id, to=_CALL_FAILED)
                    try:
                        record_blocked(
                            evidence_path,
                            request_id=request_id,
                            tool_call_id=tool_call_id,
                            tool_name=tool_name,
                            requested_arguments=requested_arguments,
                            policy_decision="block",
                            reason="execute_profile_mismatch:instance_override",
                        )
                    except EvidenceFailure:
                        pass
                    return blocked("(execute_profile_mismatch:instance_override)")
                resolved_execute = getattr(type(tool), "execute", None)
                if resolved_execute is not runtime.audited_execute and (
                    not ownership.active
                    or resolved_execute is not ownership.installed_execute_guard
                ):
                    state.finish(tool_call_id, to=_CALL_FAILED)
                    try:
                        record_blocked(
                            evidence_path,
                            request_id=request_id,
                            tool_call_id=tool_call_id,
                            tool_name=tool_name,
                            requested_arguments=requested_arguments,
                            policy_decision="block",
                            reason="execute_profile_mismatch:class_override",
                        )
                    except EvidenceFailure:
                        pass
                    return blocked("(execute_profile_mismatch:class_override)")

            try:
                record_executed_result = None
                if tool is not None:
                    # Observation boundary (not a second execution path): the
                    # dispatcher still owns execution; we only wrap the bound
                    # execute of the resolved tool for exactly one dispatch.
                    # F-04: per-tool asyncio.Lock - observation install ->
                    # physical execute -> exact restore is serialized per
                    # tool instance across concurrent tasks on the same loop
                    # (threading locks cannot do this across await points).
                    lock = tool.__dict__.get("_kerniq_observation_async_lock")
                    if lock is None:
                        lock = asyncio.Lock()
                        try:
                            tool.__dict__["_kerniq_observation_async_lock"] = lock
                        except Exception:
                            lock = None

                    original_execute = tool.execute

                    async def observed_execute(agent, tc, *a, **kw):
                        token = _dispatch_token.set(owner_id)
                        try:
                            result = await original_execute(agent, tc, *a, **kw)
                        finally:
                            _dispatch_token.reset(token)
                        observe_execution(getattr(tc, "args", None), result)
                        return result


                    async def observed_dispatch() -> Any:
                        tool.__dict__["execute"] = observed_execute
                        try:
                            return await original_call_tool(
                                self, tool_call, *args, **kwargs
                            )
                        finally:
                            # Exact restore: the instance had no execute
                            # before (F-03 check guaranteed it), so removing
                            # our own key returns precisely the prior state.
                            if tool.__dict__.get("execute") is observed_execute:
                                del tool.__dict__["execute"]
                            else:
                                # Stale wrapper residue: cannot restore
                                # truthfully - degrade the whole runtime.
                                state.degrade()

                    if lock is not None:
                        async with lock:
                            record_executed_result = await observed_dispatch()
                    else:
                        record_executed_result = await observed_dispatch()
                else:
                    # No registered tool with this name: the dispatcher will
                    # raise before any execution could happen.
                    record_executed_result = await original_call_tool(
                        self, tool_call, *args, **kwargs
                    )
            except BaseException as error:
                # Includes CancelledError: the ledger must reach a terminal
                # state and terminal evidence must be attempted; no EXECUTED
                # is ever fabricated for an unfinished dispatch.
                state.finish(tool_call_id, to=_CALL_FAILED)
                try:
                    record_failure(
                        evidence_path,
                        request_id=request_id,
                        tool_call_id=tool_call_id,
                        tool_name=tool_name,
                        before_execution=tool is None,
                        error=error,
                    )
                except EvidenceFailure:
                    # Terminal evidence could not be persisted (H-05).
                    state.degrade()
                raise

            if "arguments" in executed:
                # The physical execution boundary fired: EXECUTED evidence
                # with executed_arguments taken from the real boundary.
                try:
                    record_executed(
                        evidence_path,
                        request_id=request_id,
                        tool_call_id=tool_call_id,
                        tool_name=tool_name,
                        executed_arguments=executed["arguments"],
                        tool_result=getattr(executed["result"], "text", None)
                        or str(executed["result"]),
                    )
                except EvidenceFailure:
                    # Terminal outcome evidence failed: degrade the runtime
                    # so no further tool executes silently (H-05).
                    state.degrade()
                state.finish(tool_call_id, to=_CALL_EXECUTED)
            else:
                # The dispatcher returned without invoking Tool.execute —
                # no EXECUTED evidence may be fabricated (H-04). Record the
                # fact that the dispatch completed unobserved.
                state.finish(tool_call_id, to=_CALL_FAILED)
                try:
                    record_failure(
                        evidence_path,
                        request_id=request_id,
                        tool_call_id=tool_call_id,
                        tool_name=tool_name,
                        before_execution=True,
                        error="dispatcher returned without invoking Tool.execute",
                    )
                except EvidenceFailure:
                    state.degrade()
            return record_executed_result

        ownership = _PatchOwnership(
            owner_id=owner_id,
            generation=generation,
            agent_class=runtime.agent_class,
            original_call_tool=original_call_tool,
            original_identity=original_identity,
            installed_wrapper=governed_call_tool,
            had_own_call_tool="call_tool" in runtime.agent_class.__dict__,
        )
        original_execute = runtime.audited_execute

        async def guarded_execute(self, tool_call, *args, **kwargs):
            if not ownership.active:
                return await original_execute(self, tool_call, *args, **kwargs)
            token = _dispatch_token.get()
            if token is None:
                # Execute reached without a governed dispatch: a replaced
                # or bypassed Agent.call_tool tried to run the physical tool
                # behind the governance boundary. Fail closed: no execution.
                state.degrade()
                raise RuntimeError(
                    "[kerniq] Tool.execute refused: no governed dispatch token "
                    "(Agent.call_tool bypassed or replaced)"
                )
            return await original_execute(self, tool_call, *args, **kwargs)

        _PATCH_REGISTRY[runtime.agent_class] = ownership
        try:
            setattr(runtime.agent_class, "call_tool", governed_call_tool)
            ownership.installed_execute_guard = guarded_execute
            setattr(runtime.tool_class, "execute", guarded_execute)
        except Exception:
            # Atomic publication: registry entry never outlives a failed
            # wrapper install (H-01 rollback).
            _PATCH_REGISTRY[runtime.agent_class] = existing_retired
            if existing_retired is None:
                del _PATCH_REGISTRY[runtime.agent_class]
            try:
                setattr(runtime.tool_class, "execute", original_execute)
            except Exception:
                pass
            raise

    return GovernedAttach(
        runtime=runtime,
        evidence_path=evidence_path,
        sidecar=sidecar,
        timeout_seconds=sidecar_timeout_seconds,
        owner_id=owner_id,
        generation=generation,
        runtime_id=runtime_identity,
        session_id=session_identity,
        turn_id=turn_identity,
        state=state,
        _agent_class=runtime.agent_class,
    )


__all__ = [
    "EVIDENCE_DEGRADED",
    "GovernedAttach",
    "GovernancePatchError",
    "HEALTHY",
    "attach_governed_runtime",
    "DEFAULT_SIDECAR_TIMEOUT_SECONDS",
]
