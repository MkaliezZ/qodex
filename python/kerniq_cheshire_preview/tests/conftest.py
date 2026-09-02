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


if cheshire_available():
    from cat.mad_hatter.decorators.tool import Tool as _RealTool

    def make_fake_tool(name: str, func) -> "FakeTool":
        """A real audited Tool instance whose function counts executions.

        ``execute`` is NOT overridden: the audited implementation runs, so
        the physical execution boundary is genuine in deterministic tests.
        """
        tool = _RealTool.__new__(_RealTool)
        tool.func = func
        tool.name = name
        tool.description = "deterministic governed test tool"
        tool.input_schema = {}
        tool.output_schema = {}
        tool.is_internal = True
        tool.meta = None
        tool.execution_count = 0
        original = tool.func

        def counting(**kwargs):
            tool.execution_count += 1
            return original(**kwargs)

        tool.func = counting
        return tool

    class FakeTool:
        # Kept as a name for imports; construction goes through
        # make_fake_tool so no instance ever overrides execute.
        def __new__(cls, *args, **kwargs):  # pragma: no cover
            raise TypeError("use make_fake_tool()")
else:  # pragma: no cover - machines without the audited runtime

    class FakeTool:  # type: ignore[no-redef]
        pass


if cheshire_available():
    from cat.services.agents.base import Agent as _RealAgent

    class FakeAgent(_RealAgent):
        """Real audited Agent subclass with controllable tools and no
        framework startup. ``call_tool`` is deliberately NOT overridden:
        deterministic tests dispatch through the audited base
        implementation, exactly like the admitted governed profile."""

        def __init__(self, tools: List[Any]) -> None:
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
        # Protocol-faithful double: echoes the full six-field identity
        # unless the scripted response deliberately breaks one of them.
        response = dict(head)
        for name in (
            "request_id",
            "tool_call_id",
            "runtime_id",
            "session_id",
            "turn_id",
            "protocol_version",
        ):
            response.setdefault(name, request.get(name))
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
def _ambient_request_context():
    """The real Tool.execute emits an AGUI event that reads the per-request
    ambient context; provide one for every deterministic test."""
    from cat.ambient.context_vars import Ctx, reset_ctx, set_ctx
    from cat.auth.user import User

    token = set_ctx(Ctx(user=User(id=str(__import__("uuid").uuid4()), name="kerniq-test")))
    try:
        yield
    finally:
        reset_ctx(token)


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
            klass = entry.agent_class
            if "call_tool" in klass.__dict__:
                # Remove residue so the class returns to inheriting the
                # audited base implementation (the admitted profile).
                delattr(klass, "call_tool")
        except Exception:
            pass


@pytest.fixture
def protected_tool():
    return make_fake_tool("protected_action", lambda **kwargs: "should never run")


@pytest.fixture
def allowed_tool():
    return make_fake_tool("allowed_action", lambda **kwargs: "ran")


@pytest.fixture
def agent(protected_tool, allowed_tool):
    return FakeAgent(tools=[protected_tool, allowed_tool])


@pytest.fixture
def evidence_path(tmp_path):
    return tmp_path / "governed-evidence.jsonl"


__all__ = [
    "FakeAgent",
    "make_fake_tool",
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
