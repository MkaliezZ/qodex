"""Shared fixtures for the Cheshire Cat governed preview tests.

The deterministic interceptor tests still run against the *real* audited
runtime (admission is the point of the prototype): the fake agent subclasses
the real ``Agent`` so admission passes, while tools and the sidecar are
seam-shaped doubles for deterministic control. Everything is skipped on
machines without ``cheshire-cat-ai==2.0.23``.
"""

from __future__ import annotations

import asyncio
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Dict, List, Optional

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from kerniq_cheshire_preview.admission import GovernanceAttachError  # noqa: E402


def cheshire_available() -> bool:
    try:
        import importlib.metadata as im

        return im.version("cheshire-cat-ai") == "2.0.23"
    except Exception:
        return False


requires_real_cheshire = pytest.mark.skipif(
    not cheshire_available(), reason="audited cheshire-cat-ai==2.0.23 runtime not installed"
)


class FakeToolCall(SimpleNamespace):
    """Seam-shaped stand-in for cat ToolCall(id, name, args)."""


class FakeTool:
    def __init__(self, name: str, func) -> None:
        self.name = name
        self.func = func
        self.execution_count = 0

    async def execute(self, agent, tool_call):
        self.execution_count += 1
        result = self.func(**getattr(tool_call, "args", {}))
        if cheshire_available():
            from cat.types import Message, TextContent

            return Message(
                role="tool",
                content=[TextContent(text=f"tool_output:{result}")],
                tool_call_id=getattr(tool_call, "id", None),
            )
        return f"tool_output:{result}"


if cheshire_available():
    from cat.services.agents.base import Agent as _RealAgent

    class FakeAgent(_RealAgent):
        """Real audited Agent subclass: admission-eligible, with controllable
        tools and no framework startup."""

        def __init__(self, tools: List[FakeTool]) -> None:
            self.tools = tools
else:  # pragma: no cover - only on machines without the audited runtime

    class FakeAgent:  # type: ignore[no-redef]
        pass


@dataclass
class FakeDecision:
    """Scriptable sidecar double used by the deterministic tests."""

    responses: List[Optional[Dict[str, Any]]] = field(default_factory=list)
    calls: List[Dict[str, Any]] = field(default_factory=list)

    def request(self, request: Dict[str, Any], timeout: float) -> Optional[Dict[str, Any]]:
        self.calls.append(request)
        if not self.responses:
            return None
        head, self.responses = self.responses[0], self.responses[1:]
        if head is None:
            return None  # simulates timeout / dead sidecar
        # Protocol-faithful double: echoes request identity unless the
        # scripted response deliberately breaks it.
        response = dict(head)
        response.setdefault("request_id", request.get("request_id"))
        response.setdefault("tool_call_id", request.get("tool_call_id"))
        return response

    def close(self) -> None:
        pass


def allow_response(reason: str = "allowed") -> Dict[str, Any]:
    return {"type": "decision", "decision": "allow", "reason": reason}


def block_response(reason: str = "explicit_denylist") -> Dict[str, Any]:
    return {"type": "decision", "decision": "block", "reason": reason}


def run(coro):
    return asyncio.run(coro)


def read_evidence(path: Path) -> List[Dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


@pytest.fixture(autouse=True)
def _clean_patch_registry():
    """Guarantee no governed patch survives a failed test."""
    from kerniq_cheshire_preview import interceptor as _interceptor

    yield
    with _interceptor._PATCH_LOCK:
        stale = dict(_interceptor._PATCH_REGISTRY)
        _interceptor._PATCH_REGISTRY.clear()
    for entry in stale.values():
        try:
            setattr(entry.agent_class, "call_tool", entry.original_call_tool)
        except Exception:
            pass


@pytest.fixture
def protected_tool():
    return FakeTool("protected_action", lambda **kwargs: "should never run")


@pytest.fixture
def allowed_tool():
    return FakeTool("allowed_action", lambda **kwargs: "ran")


@pytest.fixture
def agent(protected_tool, allowed_tool):
    return FakeAgent(tools=[protected_tool, allowed_tool])


@pytest.fixture
def evidence_path(tmp_path):
    return tmp_path / "governed-evidence.jsonl"


__all__ = [
    "FakeAgent",
    "FakeDecision",
    "FakeTool",
    "FakeToolCall",
    "GovernanceAttachError",
    "allow_response",
    "block_response",
    "cheshire_available",
    "read_evidence",
    "requires_real_cheshire",
    "run",
]
