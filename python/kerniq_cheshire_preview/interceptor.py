"""Runtime interceptor for the Cheshire Cat governed preview.

Attaches to the validated seam (``Agent.call_tool`` → ``Tool.execute``) by
patching ``call_tool`` at runtime. No user code is modified, nothing is
imported by user code, and the original dispatcher keeps ownership of tool
execution:

- ``block`` — the original ``call_tool`` is never invoked, so
  ``Tool.execute()`` cannot run; a host-native blocked ``Message``
  correlated with the original ``tool_call_id`` is returned instead.
- ``allow`` — the original ``call_tool`` runs exactly once; duplicate or
  replayed decisions never dispatch twice.
- sidecar timeout, unknown decision, identity mismatch, sidecar death, or
  evidence failure — fail closed as ``block``.

Patch ownership (single-owner, generation controlled):

- a second active attach on the same class is refused;
- detach is owner-checked (stale or out-of-order handles never restore an
  ungoverned method over an active governed attach), idempotent, and safe.

Evidence follows the truthfulness lifecycle (REQUESTED → AUTHORIZED/BLOCKED
→ DISPATCH_STARTED → EXECUTED / FAILED_*): nothing about execution is
recorded before it actually happens.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
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

_PATCH_LOCK = threading.Lock()


@dataclass
class _PatchOwnership:
    owner_id: str
    generation: int
    agent_class: type
    original_call_tool: Any
    original_identity: str
    active: bool = True


_PATCH_REGISTRY: Dict[type, _PatchOwnership] = {}


class GovernancePatchError(RuntimeError):
    """Patch ownership violation (nested attach / out-of-order detach)."""


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
    _agent_class: type
    _detached: bool = False
    _sidecar_closed: bool = False

    def detach(self) -> None:
        """Restore the original seam if — and only if — this handle still
        owns the active patch. Idempotent; stale or out-of-order handles are
        refused so an active governed attach can never be silently unwound
        into an ungoverned method."""
        with _PATCH_LOCK:
            entry = _PATCH_REGISTRY.get(self._agent_class)
            if entry is not None and entry.active and entry.owner_id != self.owner_id:
                # Another owner governs this class now: refuse regardless of
                # this handle's own state, so a stale handle can never unwind
                # someone else's active governed patch.
                raise GovernancePatchError(
                    "detach refused: handle does not own the active governed attach "
                    f"(owner={self.owner_id}, current={entry.owner_id})"
                )
            if self._detached:
                return  # idempotent: nothing left to restore
            if entry is None or not entry.active:
                self._detached = True
                self._close_sidecar()
                return
            setattr(self._agent_class, "call_tool", entry.original_call_tool)
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


def _decision_from_response(
    response: Optional[Dict[str, Any]],
    request_id: str,
    tool_call_id: str,
) -> tuple[str, str]:
    """Validate the sidecar response identity, then map to a canonical
    action. Missing, mismatched (stale or replayed), or unknown identities
    and actions all fail closed."""
    if response is None:
        return "block", "sidecar_unavailable"
    if response.get("type") != "decision":
        return "block", "identity_mismatch:bad_response_type"
    if response.get("request_id") != request_id:
        return "block", "identity_mismatch:request_id"
    if response.get("tool_call_id") != tool_call_id:
        return "block", "identity_mismatch:tool_call_id"
    candidate = response.get("decision")
    if candidate == "allow":
        return "allow", str(response.get("reason", "allowed"))
    if candidate == "block":
        return "block", str(response.get("reason", "blocked"))
    return "block", f"unknown_decision:{candidate!r}"


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
    nothing is patched; a second active attach on the same class raises
    ``GovernancePatchError``.
    """
    runtime = admit_governed_runtime(agent_class)
    resolved_policy = policy if policy is not None else {"defaultAction": "block"}
    sidecar = _sidecar if _sidecar is not None else _SidecarClient(resolved_policy)
    evidence_path = Path(evidence_path)
    runtime_identity = runtime_id or f"preview_runtime_{uuid.uuid4().hex[:12]}"
    session_identity = session_id or f"preview_session_{uuid.uuid4().hex[:12]}"
    turn_identity = turn_id or f"preview_turn_{uuid.uuid4().hex[:12]}"

    with _PATCH_LOCK:
        existing = _PATCH_REGISTRY.get(runtime.agent_class)
        if existing is not None and existing.active:
            raise GovernancePatchError(
                "nested/second governed attach refused for "
                f"{runtime.agent_class!r} (active owner={existing.owner_id})"
            )
        original_call_tool = runtime.agent_class.call_tool
        generation = (existing.generation + 1) if existing is not None else 1
        owner_id = f"owner_{uuid.uuid4().hex[:16]}"
        original_identity = getattr(
            original_call_tool, "__qualname__", str(original_call_tool)
        )
        ownership = _PatchOwnership(
            owner_id=owner_id,
            generation=generation,
            agent_class=runtime.agent_class,
            original_call_tool=original_call_tool,
            original_identity=original_identity,
        )
        _PATCH_REGISTRY[runtime.agent_class] = ownership

    # Exactly-once dispatch ledger: a replayed tool_call_id (model retry or
    # duplicate decision delivery) never dispatches Tool.execute twice.
    dispatched_tool_call_ids: set[str] = set()

    async def governed_call_tool(self, tool_call, *args, **kwargs):
        tool_name, requested_arguments, tool_call_id = _tool_call_fields(tool_call)
        request_id = f"req_{uuid.uuid4().hex[:16]}"

        def blocked(text: str) -> Any:
            return runtime.blocked_message(
                f"[kerniq] tool '{tool_name}' blocked by governance "
                f"{text}; decision=block, dispatch=false",
                tool_call,
            )

        try:
            record_requested(
                evidence_path,
                request_id=request_id,
                tool_call_id=tool_call_id,
                tool_name=tool_name,
                requested_arguments=requested_arguments,
            )
        except EvidenceFailure:
            # Evidence failure must never degrade into an ungoverned allow.
            return blocked("(evidence_unavailable)")

        response = sidecar.request(
            {
                "type": "governance",
                "request_id": request_id,
                "tool_call_id": tool_call_id,
                "tool": tool_name,
                "arguments": requested_arguments
                if isinstance(requested_arguments, dict)
                else {},
                "runtime_id": runtime_identity,
                "session_id": session_identity,
                "turn_id": turn_identity,
                "protocol_version": PROTOCOL_VERSION,
            },
            timeout=sidecar_timeout_seconds,
        )
        decision, reason = _decision_from_response(response, request_id, tool_call_id)

        if decision == "allow" and tool_call_id in dispatched_tool_call_ids:
            decision = "block"
            reason = "duplicate_tool_call_replayed"

        if decision != "allow":
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

        # Authorized: record the policy snapshot (no execution claims yet).
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
            return blocked("(evidence_unavailable)")

        # Classify a later dispatcher raise honestly: if no tool with this
        # name is registered, nothing could have executed.
        known_tool = any(
            getattr(tool, "name", None) == tool_name
            for tool in getattr(self, "tools", []) or []
        )

        try:
            record_dispatch_started(
                evidence_path,
                request_id=request_id,
                tool_call_id=tool_call_id,
                tool_name=tool_name,
            )
        except EvidenceFailure:
            return blocked("(evidence_unavailable)")

        try:
            result = await original_call_tool(self, tool_call, *args, **kwargs)
        except Exception as error:
            try:
                record_failure(
                    evidence_path,
                    request_id=request_id,
                    tool_call_id=tool_call_id,
                    tool_name=tool_name,
                    before_execution=not known_tool,
                    error=error,
                )
            except EvidenceFailure:
                pass
            raise

        dispatched_tool_call_ids.add(tool_call_id)
        try:
            record_executed(
                evidence_path,
                request_id=request_id,
                tool_call_id=tool_call_id,
                tool_name=tool_name,
                executed_arguments=requested_arguments,
                tool_result=getattr(result, "text", None) or str(result),
            )
        except EvidenceFailure:
            # The execution already happened; the fact cannot be unwritten.
            pass
        return result

    setattr(runtime.agent_class, "call_tool", governed_call_tool)
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
        _agent_class=runtime.agent_class,
    )


__all__ = [
    "GovernedAttach",
    "GovernancePatchError",
    "attach_governed_runtime",
    "DEFAULT_SIDECAR_TIMEOUT_SECONDS",
]
