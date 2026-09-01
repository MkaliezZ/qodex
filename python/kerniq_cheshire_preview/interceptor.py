"""Runtime interceptor for the Cheshire Cat governed preview.

Attaches to the validated seam (``Agent.call_tool`` → ``Tool.execute``) by
patching ``call_tool`` at runtime. No user code is modified, nothing is
imported by user code, and the original dispatcher keeps ownership of tool
execution:

- ``block`` — the original ``call_tool`` is never invoked, so
  ``Tool.execute()`` cannot run; a host-native blocked ``Message`` is
  returned instead.
- ``allow`` — the original ``call_tool`` runs exactly once; duplicate or
  replayed decisions never dispatch twice.
- sidecar timeout, unknown decision, sidecar death, or evidence failure —
  fail closed as ``block``.
"""

from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional

from .admission import AdmittedRuntime, admit_governed_runtime
from .evidence import EvidenceFailure, record_request, record_result

DEFAULT_SIDECAR_TIMEOUT_SECONDS = 2.0


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
    original_call_tool: Any
    sidecar: _SidecarClient
    timeout_seconds: float

    def detach(self) -> None:
        """Restore the original seam (prototype hygiene; not a downgrade
        path for governance-required runs)."""
        setattr(self.runtime.agent_class, "call_tool", self.original_call_tool)
        self.sidecar.close()


def _tool_call_fields(tool_call: Any) -> tuple[str, Any, str]:
    name = getattr(tool_call, "name", None)
    arguments = getattr(tool_call, "args", None)
    call_id = getattr(tool_call, "id", None) or f"preview_{uuid.uuid4().hex[:12]}"
    return (str(name) if name is not None else ""), arguments, call_id


def attach_governed_runtime(
    evidence_path: Path,
    *,
    policy: Optional[Dict[str, Any]] = None,
    agent_class: Optional[type] = None,
    sidecar_timeout_seconds: float = DEFAULT_SIDECAR_TIMEOUT_SECONDS,
    _sidecar: Optional[Any] = None,
) -> GovernedAttach:
    """Admit the runtime and install the governed ``call_tool`` interceptor.

    Fails closed: admission failure raises ``GovernanceAttachError`` and
    nothing is patched.
    """
    runtime = admit_governed_runtime(agent_class)
    resolved_policy = policy if policy is not None else {"defaultAction": "block"}
    sidecar = _sidecar if _sidecar is not None else _SidecarClient(resolved_policy)
    original_call_tool = runtime.agent_class.call_tool
    evidence_path = Path(evidence_path)
    # Exactly-once dispatch ledger: a replayed tool_call_id (model retry or
    # duplicate decision delivery) never dispatches Tool.execute twice.
    dispatched_tool_call_ids: set[str] = set()

    async def governed_call_tool(self, tool_call, *args, **kwargs):
        tool_name, requested_arguments, tool_call_id = _tool_call_fields(tool_call)
        request_id = f"req_{uuid.uuid4().hex[:16]}"

        response = sidecar.request(
            {
                "type": "governance",
                "request_id": request_id,
                "tool": tool_name,
                "arguments": requested_arguments
                if isinstance(requested_arguments, dict)
                else {},
            },
            timeout=sidecar_timeout_seconds,
        )
        decision = "block"
        reason = "sidecar_unavailable"
        if response is not None and response.get("type") == "decision":
            candidate = response.get("decision")
            if candidate == "allow":
                decision, reason = "allow", str(response.get("reason", "allowed"))
            elif candidate == "block":
                decision, reason = "block", str(response.get("reason", "blocked"))
            else:
                decision, reason = "block", f"unknown_decision:{candidate!r}"

        if decision == "allow" and tool_call_id in dispatched_tool_call_ids:
            decision = "block"
            reason = "duplicate_tool_call_replayed"
        dispatch = decision == "allow"
        if dispatch:
            dispatched_tool_call_ids.add(tool_call_id)
        try:
            record_request(
                evidence_path,
                request_id=request_id,
                tool_call_id=tool_call_id,
                tool_name=tool_name,
                requested_arguments=requested_arguments,
                policy_decision=decision,
                effective_arguments=requested_arguments if dispatch else None,
                dispatch=dispatch,
                outcome="governed_allow" if dispatch else "governed_block",
                reason=reason,
            )
        except EvidenceFailure:
            # Evidence failure must never degrade into an ungoverned allow.
            dispatch = False
            decision = "block"

        if not dispatch:
            return runtime.blocked_message(
                f"[kerniq] tool '{tool_name}' blocked by governance "
                f"({reason}); decision={decision}, dispatch=false",
                tool_call,
            )

        # Exactly-once dispatch: the original call_tool (and only it) reaches
        # Tool.execute; duplicate decisions cannot re-enter because there is
        # exactly one dispatch per request and no decision replay surface.
        try:
            result = await original_call_tool(self, tool_call, *args, **kwargs)
        except Exception as error:
            try:
                record_result(
                    evidence_path,
                    request_id=request_id,
                    tool_call_id=tool_call_id,
                    executed_arguments=requested_arguments,
                    tool_result=f"Error: {error}",
                    outcome="tool_error",
                )
            except EvidenceFailure:
                pass
            raise

        try:
            record_result(
                evidence_path,
                request_id=request_id,
                tool_call_id=tool_call_id,
                executed_arguments=requested_arguments,
                tool_result=getattr(result, "text", None) or str(result),
                outcome="executed",
            )
        except EvidenceFailure:
            # The dispatch already happened; the fact is preserved as best as
            # the prototype can (no silent second execution either way).
            pass
        return result

    setattr(runtime.agent_class, "call_tool", governed_call_tool)
    return GovernedAttach(
        runtime=runtime,
        evidence_path=evidence_path,
        original_call_tool=original_call_tool,
        sidecar=sidecar,
        timeout_seconds=sidecar_timeout_seconds,
    )


__all__ = ["GovernedAttach", "attach_governed_runtime", "DEFAULT_SIDECAR_TIMEOUT_SECONDS"]
