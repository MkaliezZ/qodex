"""AgentFuse governance sidecar entrypoint (local IPC prototype).

The sidecar is a separate process speaking one JSON object per line on
stdin/stdout. It only answers governance requests; it never executes tools
and owns no agent loop. Decision semantics come from the frozen DHMS
AgentFuse runtime guard (``dhms-agentfuse``): denylist wins, then the
allowlist, then the configured fall-through action. Any unresolved state
maps to ``block`` (fail closed).

Line protocol:

    request  {"type": "governance", "request_id": ..., "tool": ..., "arguments": {...}}
    response {"type": "decision", "request_id": ..., "decision": "allow"|"block", "reason": ...}
"""

from __future__ import annotations

import json
import sys
from typing import Any, Dict, Tuple

from dhms_agentfuse.runtime_guard import RuntimeGuard, ToolCallRequest

# Preview policy config mirrors the audited DSH adapter schema: denyTools
# always wins, allowTools (non-empty) restricts, defaultAction falls through.
def _build_guard(policy: Dict[str, Any]) -> RuntimeGuard:
    return RuntimeGuard(
        deny_tools=policy.get("denyTools", []),
        allow_tools=policy.get("allowTools", None),
        default_action=policy.get("defaultAction", "block"),
    )


def decide(guard: RuntimeGuard, request_id: str, tool: str, arguments: Dict[str, Any]) -> Tuple[str, str]:
    """Map an AgentFuse decision to the canonical preview action."""
    decision = guard.evaluate(
        ToolCallRequest(tool_call_id=request_id, tool_name=tool, arguments=arguments or {})
    )
    action = getattr(decision, "action", None)
    reason = getattr(decision, "reason_code", "") or "policy"
    if action == "allow":
        return "allow", reason
    if action == "block":
        return "block", reason
    # Unknown decision kinds (e.g. future deferrals) fail closed.
    return "block", f"unknown_decision:{action!r}"


def main() -> int:
    policy = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {"defaultAction": "block"}
    guard = _build_guard(policy)
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except ValueError:
            continue
        if request.get("type") != "governance":
            continue
        try:
            action, reason = decide(
                guard,
                str(request.get("request_id", "")),
                str(request.get("tool", "")),
                request.get("arguments") or {},
            )
        except Exception as error:  # the sidecar never crashes the host
            action, reason = "block", f"sidecar_error:{error}"
        sys.stdout.write(
            json.dumps(
                {
                    "type": "decision",
                    "request_id": request.get("request_id"),
                    "decision": action,
                    "reason": reason,
                }
            )
            + "\n"
        )
        sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
