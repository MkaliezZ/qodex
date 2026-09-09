"""Test helpers: deterministic synthetic source bundles.

Every source built here is a SYNTHETIC_TEST_FIXTURE (declared in its
provenance). None of this is external validation, a real run, or a real
LangChain capture; the structure merely mirrors the audited public v2 event
contract (see kerniq_langchain_public_spec_source_qualification_v0_6_1.md
section 6).
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from kerniq_external_validation import langchain_profile as profile

ROOT_RUN_ID = "5f5c0a11-0000-4a1b-9c2d-root00000001"
TOOLS_RUN_ID = "5f5c0a11-0000-4a1b-9c2d-tools0000001"
TOOL_RUN_ID = "5f5c0a11-0000-4a1b-9c2d-tool0000001"
MODEL_RUN_ID = "5f5c0a11-0000-4a1b-9c2d-model0000001"
TOOL_NAME = "lookup_order"
TOOL_CALL_ID = "call_Zz9syntheticExample0"
TOOL_INPUT = {"order_id": "A-1234", "include_items": True}
TOOL_CONTENT = "order total: 210.50 (3 items)"


def valid_provenance(**overrides: Any) -> Dict[str, Any]:
    provenance: Dict[str, Any] = {
        "synthetic_test_fixture": True,
        "producer": {
            "langchain": profile.PINNED_LANGCHAIN,
            "langchain-core": profile.PINNED_LANGCHAIN_CORE,
            "langgraph": profile.PINNED_LANGGRAPH,
            "langgraph-prebuilt": profile.PINNED_LANGGRAPH_PREBUILT,
        },
        "environment": {
            "python": profile.PINNED_PYTHON,
            "pydantic": profile.PINNED_PYDANTIC,
        },
        "serializer": {
            "identity": profile.PINNED_SERIALIZER_IDENTITY,
            "langchain-core": profile.PINNED_LANGCHAIN_CORE,
        },
        "exporter": {
            "identity": "synthetic-test-exporter",
            "version": "1.0.0",
        },
        "capture": {
            "method": profile.PINNED_STREAM_METHOD,
            "version": profile.PINNED_STREAM_VERSION,
            "filters": profile.FILTER_DECLARED_NONE,
            "scope": "one create_agent invocation, one tool run (synthetic)",
            "termination": profile.TERMINATION_NORMAL,
        },
    }
    for key, value in overrides.items():
        if value is not None and isinstance(value, dict) and isinstance(provenance.get(key), dict):
            provenance[key].update(value)
        else:
            provenance[key] = value
    return provenance


def tool_message_output(
    *, name: str = TOOL_NAME, tool_call_id: str = TOOL_CALL_ID, content: Any = TOOL_CONTENT, status: Optional[str] = "success"
) -> Dict[str, Any]:
    kwargs: Dict[str, Any] = {
        "content": content,
        "type": "tool",
        "name": name,
        "tool_call_id": tool_call_id,
    }
    if status is not None:
        kwargs["status"] = status
    return {"lc": 1, "type": "constructor", "id": list(profile.TOOL_MESSAGE_ID), "kwargs": kwargs}


def opaque_command_value() -> Dict[str, Any]:
    """The audited opaque Command carrier marker (repr present but NEVER
    read by the validator)."""
    return {
        "lc": 1,
        "type": profile.OPAQUE_TYPE,
        "id": list(profile.OPAQUE_COMMAND_ID),
        "repr": "Command(resume=..., goto='tools')",
    }


def valid_events(
    *,
    root_run_id: str = ROOT_RUN_ID,
    tools_run_id: str = TOOLS_RUN_ID,
    tool_run_id: str = TOOL_RUN_ID,
    model_run_id: str = MODEL_RUN_ID,
    tool_name: str = TOOL_NAME,
    tool_input: Any = None,
    tool_output: Optional[Dict[str, Any]] = None,
    include_opaque_carrier: bool = True,
) -> List[Dict[str, Any]]:
    """A structurally valid single-root / single-tool-run event stream.
    Event order and shapes mirror the audited v2 contract; ids/values are
    arbitrary and deliberately NOT the historical internal bundle's."""
    tool_input = TOOL_INPUT if tool_input is None else tool_input
    tool_output = tool_message_output() if tool_output is None else tool_output
    events: List[Dict[str, Any]] = [
        # L1 root invocation start
        {
            "event": "on_chain_start",
            "data": {"input": {"messages": [["user", "Look up order A-1234 with items."]]}},
            "name": "LangGraph",
            "tags": [],
            "run_id": root_run_id,
            "metadata": {"ls_integration": "langchain_create_agent"},
            "parent_ids": [],
        },
        # L2 model start (nonessential carrier)
        {
            "event": "on_chat_model_start",
            "data": {"input": {}},
            "name": "ChatDeepSeek",
            "tags": ["seq:step:1"],
            "run_id": model_run_id,
            "metadata": {"ls_integration": "langchain_create_agent"},
            "parent_ids": [root_run_id],
        },
    ]
    if include_opaque_carrier:
        # L3 model stream carrying an opaque Command (nonessential -> excluded)
        events.append(
            {
                "event": "on_chain_stream",
                "data": {"chunk": opaque_command_value()},
                "name": "model",
                "tags": ["seq:step:1"],
                "run_id": model_run_id,
                "metadata": {"ls_integration": "langchain_create_agent"},
                "parent_ids": [root_run_id],
            }
        )
    # tools node start (nonessential)
    base = len(events) + 1
    events.append(
        {
            "event": "on_chain_start",
            "data": {"input": {}},
            "name": "tools",
            "tags": ["seq:step:2"],
            "run_id": tools_run_id,
            "metadata": {"ls_integration": "langchain_create_agent"},
            "parent_ids": [root_run_id],
        }
    )
    # tool start
    events.append(
        {
            "event": "on_tool_start",
            "data": {"input": tool_input},
            "name": tool_name,
            "tags": ["seq:step:2"],
            "run_id": tool_run_id,
            "metadata": {"ls_integration": "langchain_create_agent", "langgraph_node": "tools"},
            "parent_ids": [root_run_id, tools_run_id],
        }
    )
    # tool terminal (typed success ToolMessage + cached input)
    events.append(
        {
            "event": "on_tool_end",
            "data": {"output": tool_output, "input": tool_input},
            "name": tool_name,
            "tags": ["seq:step:2"],
            "run_id": tool_run_id,
            "metadata": {"ls_integration": "langchain_create_agent", "langgraph_node": "tools"},
            "parent_ids": [root_run_id, tools_run_id],
        }
    )
    # tools node end (nonessential)
    events.append(
        {
            "event": "on_chain_end",
            "data": {"output": {}},
            "name": "tools",
            "tags": ["seq:step:2"],
            "run_id": tools_run_id,
            "metadata": {"ls_integration": "langchain_create_agent"},
            "parent_ids": [root_run_id],
        }
    )
    # final: model end + root end; root end must come after the tool terminal
    events.append(
        {
            "event": "on_chat_model_end",
            "data": {"output": {}},
            "name": "ChatDeepSeek",
            "tags": ["seq:step:3"],
            "run_id": model_run_id,
            "metadata": {"ls_integration": "langchain_create_agent"},
            "parent_ids": [root_run_id],
        }
    )
    events.append(
        {
            "event": "on_chain_end",
            "data": {"output": {"messages": []}},
            "name": "LangGraph",
            "tags": [],
            "run_id": root_run_id,
            "metadata": {"ls_integration": "langchain_create_agent"},
            "parent_ids": [],
        }
    )
    assert base in (3, 4)  # tools-node start line: 4 with opaque carrier, 3 without
    return events


def line_of(events: List[Dict[str, Any]], event_type: str, *, run_id: Optional[str] = None, occurrence: int = 1) -> int:
    """One-based line number of the nth event of a type (optionally within a
    run); raises if absent so tests fail loudly on builder drift."""
    seen = 0
    for index, event in enumerate(events, start=1):
        if event.get("event") != event_type:
            continue
        if run_id is not None and event.get("run_id") != run_id:
            continue
        seen += 1
        if seen == occurrence:
            return index
    raise AssertionError(f"event {event_type!r} (run_id={run_id!r}, occurrence={occurrence}) not found")


def events_to_jsonl(events: List[Dict[str, Any]]) -> bytes:
    return b"".join(
        json.dumps(event, ensure_ascii=False, separators=(",", ":")).encode("utf-8") + b"\n"
        for event in events
    )


def write_source(
    directory: Path,
    *,
    events: Optional[List[Dict[str, Any]]] = None,
    raw_bytes: Optional[bytes] = None,
    provenance: Optional[Dict[str, Any]] = None,
    inventory_paths: Optional[List[str]] = None,
    tamper_inventory: bool = False,
) -> Path:
    """Materialize a synthetic source bundle (raw + provenance + inventory)."""
    directory.mkdir(parents=True, exist_ok=True)
    if raw_bytes is None:
        raw_bytes = events_to_jsonl(events if events is not None else valid_events())
    provenance_bytes = json.dumps(
        provenance if provenance is not None else valid_provenance(),
        ensure_ascii=False,
        separators=(",", ":"),
        indent=None,
    ).encode("utf-8") + b"\n"

    (directory / profile.RAW_FILENAME).write_bytes(raw_bytes)
    (directory / profile.PROVENANCE_FILENAME).write_bytes(provenance_bytes)

    if inventory_paths is None:
        inventory_paths = [profile.RAW_FILENAME, profile.PROVENANCE_FILENAME]
    files = []
    for rel in inventory_paths:
        data = (directory / rel).read_bytes()
        entry = {
            "path": rel,
            "byte_length": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
        }
        if tamper_inventory:
            entry["sha256"] = "0" * 64
        files.append(entry)
    (directory / profile.INVENTORY_FILENAME).write_bytes(
        json.dumps({"schema": profile.INVENTORY_SCHEMA, "files": files}, separators=(",", ":")).encode("utf-8")
        + b"\n"
    )
    return directory
