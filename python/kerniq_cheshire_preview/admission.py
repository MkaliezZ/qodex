"""Governed runtime admission for the Cheshire Cat preview.

Before any governed interception is installed, the host runtime must prove
its identity against the Phase 0 validated facts:

- ``cheshire-cat-ai==2.0.23``
- ``Agent`` lives in ``cat.services.agents.base`` and exposes the
  ``call_tool`` seam
- ``Tool`` lives in ``cat.mad_hatter.decorators`` and exposes
  ``execute``
- both signatures are compatible with the frozen seam shape

Any failure raises :class:`GovernanceAttachError`. There is no
observation-only fallback: a runtime that cannot be admitted is never
intercepted.
"""

from __future__ import annotations

import inspect
from dataclasses import dataclass
from importlib import import_module
from importlib.metadata import PackageNotFoundError, version
from typing import Any, Awaitable, Callable, Optional

AUDITED_PACKAGE = "cheshire-cat-ai"
AUDITED_VERSION = "2.0.23"
AGENT_MODULE = "cat.services.agents.base"
AGENT_CLASS_NAME = "Agent"
TOOL_MODULE = "cat.mad_hatter.decorators"
TOOL_CLASS_NAME = "Tool"
EXPECTED_CALL_TOOL_PARAMS = ("self", "tool_call")
EXPECTED_EXECUTE_PARAMS = ("self", "agent", "tool_call")


class GovernanceAttachError(RuntimeError):
    """Runtime admission failed; governed mode must not start."""


@dataclass(frozen=True)
class AdmittedRuntime:
    """The admitted runtime plus host-native helpers for the interceptor."""

    agent_class: type
    tool_class: type
    runtime_version: str

    def blocked_message(self, text: str, tool_call: Any) -> Any:
        """Build the host-native blocked tool result (a ``Message`` with
        ``role="tool"`` in the audited runtime), correlated with the
        original ``tool_call_id`` so the runtime continuation can attribute
        the blocked result exactly like a real tool result."""
        from cat.types import Message, TextContent

        return Message(
            role="tool",
            content=[TextContent(text=text)],
            tool_call_id=getattr(tool_call, "id", None),
        )


def _parameter_names(function: Callable[..., Any]) -> tuple[str, ...]:
    return tuple(inspect.signature(function).parameters)


def admit_governed_runtime(agent_class: Optional[type] = None) -> AdmittedRuntime:
    """Admit the runtime for governed mode or raise.

    ``agent_class`` may be omitted (uses the audited ``Agent`` class) or a
    subclass of it; anything else fails admission.
    """
    try:
        installed = version(AUDITED_PACKAGE)
    except PackageNotFoundError as error:  # pragma: no cover - env specific
        raise GovernanceAttachError(f"runtime missing: {AUDITED_PACKAGE}") from error
    if installed != AUDITED_VERSION:
        raise GovernanceAttachError(
            f"runtime mismatch: {AUDITED_PACKAGE}=={installed}, expected =={AUDITED_VERSION}"
        )

    try:
        agent_module = import_module(AGENT_MODULE)
        tool_module = import_module(TOOL_MODULE)
    except ImportError as error:
        raise GovernanceAttachError(f"runtime symbol import failed: {error}") from error

    audited_agent = getattr(agent_module, AGENT_CLASS_NAME, None)
    audited_tool = getattr(tool_module, TOOL_CLASS_NAME, None)
    if audited_agent is None or audited_tool is None:
        raise GovernanceAttachError("runtime symbol identity mismatch: Agent/Tool missing")

    target = agent_class if agent_class is not None else audited_agent
    if not (inspect.isclass(target) and issubclass(target, audited_agent)):
        raise GovernanceAttachError("target agent class is not the audited Agent hierarchy")

    call_tool = getattr(target, "call_tool", None)
    execute = getattr(audited_tool, "execute", None)
    if not asyncio_callable(call_tool) or not asyncio_callable(execute):
        raise GovernanceAttachError("seam symbols are not awaitable callables")

    call_tool_params = _parameter_names(call_tool)
    execute_params = _parameter_names(execute)
    if tuple(call_tool_params[: len(EXPECTED_CALL_TOOL_PARAMS)]) != EXPECTED_CALL_TOOL_PARAMS:
        raise GovernanceAttachError(
            f"call_tool signature incompatible: {call_tool_params}"
        )
    if tuple(execute_params[: len(EXPECTED_EXECUTE_PARAMS)]) != EXPECTED_EXECUTE_PARAMS:
        raise GovernanceAdmissionSignatureError(execute_params)

    return AdmittedRuntime(
        agent_class=target,
        tool_class=audited_tool,
        runtime_version=installed,
    )


class GovernanceAdmissionSignatureError(GovernanceAttachError):
    def __init__(self, params: tuple[str, ...]) -> None:
        super().__init__(f"Tool.execute signature incompatible: {params}")


def asyncio_callable(function: Any) -> bool:
    return inspect.iscoroutinefunction(function)


__all__ = [
    "AUDITED_PACKAGE",
    "AUDITED_VERSION",
    "AdmittedRuntime",
    "GovernanceAttachError",
    "admit_governed_runtime",
]
