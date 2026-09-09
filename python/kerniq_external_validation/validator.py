"""Strict source qualification, lifecycle correlation and refusal checks.

Implements the frozen matching pipeline (v0.6.2 freeze sections 5-8):
envelope validation -> root validation -> tool lifecycle matching ->
refusal/exclusion checks. Correlation is ONLY ever
(source_digest, root_run_id, tool_run_id) with ordered parent chains and
start-before-terminal ordering; pairing by timestamps, neighboring lines,
tool names, argument or output equality is structurally impossible here.

Fail-closed: applicable diagnostics are collected deterministically per
stage; any refusal diagnostic prevents Evidence mapping. Nothing is
repaired, skipped, normalized or guessed.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from . import langchain_profile as profile
from .diagnostics import (
    CORRELATION_CONFLICT,
    INCOMPLETE_SOURCE,
    INVALID_SOURCE,
    OPAQUE_SOURCE_EXCLUDED,
    RESULT_VALIDATION_ERROR,
    UNSUPPORTED_SCOPE,
    UNSUPPORTED_SERIALIZATION,
    SEVERITY_ERROR,
    SEVERITY_INFO,
    Diagnostic,
    select_result,
)
from .source_loader import LoadedSource, reverify_source_digest

ENVELOPE_FIELDS = ("event", "name", "run_id", "parent_ids", "data")


class UnsupportedValue(ValueError):
    """A required record contains values outside the frozen supported subset."""


# --- Structural scans -----------------------------------------------------------


def contains_opaque_command_marker(node: Any) -> bool:
    """Structural scan for the audited opaque Command carrier marker: one dict
    node simultaneously carrying lc==1, type=="not_implemented" and the
    langgraph Command id. "repr" values are never read; tokens split across
    different nodes never match."""
    stack = [node]
    while stack:
        current = stack.pop()
        if isinstance(current, dict):
            if (
                current.get("lc") == 1
                and current.get("type") == profile.OPAQUE_TYPE
                and current.get("id") == profile.OPAQUE_COMMAND_ID
            ):
                return True
            for key, value in current.items():
                if key == "repr":
                    continue  # never semantically inspected
                stack.append(value)
        elif isinstance(current, list):
            stack.extend(current)
    return False


def check_plain_subset(node: Any, *, where: str) -> None:
    """Iterative check: node must be entirely within the frozen supported
    data subset (string-key objects/arrays, null, booleans, strings, finite
    numbers) and must contain NO lc/__lc_escaped__ serialization-ambiguity
    keys. Raises UnsupportedValue with a precise location hint."""
    stack: List[Tuple[str, Any]] = [(where, node)]
    while stack:
        path, current = stack.pop()
        if current is None or isinstance(current, (str, bool)):
            continue
        if isinstance(current, int):
            continue
        if isinstance(current, float):
            if current != current or current in (float("inf"), float("-inf")):
                raise UnsupportedValue(f"non-finite number at {path}")
            continue
        if isinstance(current, dict):
            for key in current:
                if key in profile.LC_SEMANTIC_KEYS:
                    raise UnsupportedValue(f"serialization-ambiguity key {key!r} at {path}")
            for key, value in current.items():
                stack.append((f"{path}/{key}", value))
            continue
        if isinstance(current, list):
            for index, item in enumerate(current):
                stack.append((f"{path}/{index}", item))
            continue
        raise UnsupportedValue(f"unsupported value type at {path}")


# --- Envelope validation ------------------------------------------------------------


def validate_envelopes(events: List[Dict[str, Any]]) -> List[Diagnostic]:
    diagnostics: List[Diagnostic] = []
    for index, event in enumerate(events, start=1):
        for key in ENVELOPE_FIELDS:
            if key not in event:
                diagnostics.append(
                    Diagnostic(INVALID_SOURCE, SEVERITY_ERROR, "envelope.required_fields", line=index, pointer=f"/{key}", detail=f"envelope field {key!r} missing")
                )
        value = event.get("event")
        if not isinstance(value, str):
            diagnostics.append(
                Diagnostic(INVALID_SOURCE, SEVERITY_ERROR, "envelope.event_string", line=index, pointer="/event", detail="event is not a string")
            )
        for key in ("name", "run_id"):
            value = event.get(key)
            if not isinstance(value, str) or value.strip() == "":
                diagnostics.append(
                    Diagnostic(INVALID_SOURCE, SEVERITY_ERROR, f"envelope.{key}_nonempty", line=index, pointer=f"/{key}", detail=f"{key} is not a non-empty string")
                )
        parent_ids = event.get("parent_ids")
        if not isinstance(parent_ids, list) or any(not isinstance(item, str) or item.strip() == "" for item in parent_ids):
            diagnostics.append(
                Diagnostic(INVALID_SOURCE, SEVERITY_ERROR, "envelope.parent_ids_strings", line=index, pointer="/parent_ids", detail="parent_ids is not an array of non-empty strings")
            )
        data = event.get("data")
        if not isinstance(data, dict):
            diagnostics.append(
                Diagnostic(INVALID_SOURCE, SEVERITY_ERROR, "envelope.data_object", line=index, pointer="/data", detail="data is not an object")
            )
    return diagnostics


def _parent_chain_conflicts(event: Dict[str, Any], index: int) -> Optional[Diagnostic]:
    parent_ids = event.get("parent_ids")
    if not isinstance(parent_ids, list):
        return None  # envelope stage already reported
    run_id = event.get("run_id")
    if isinstance(run_id, str) and run_id in parent_ids:
        return Diagnostic(
            CORRELATION_CONFLICT, SEVERITY_ERROR, "correlation.no_self_parent", line=index,
            pointer="/parent_ids", detail="parent chain contains the event's own run_id",
        )
    if len(set(parent_ids)) != len(parent_ids):
        return Diagnostic(
            CORRELATION_CONFLICT, SEVERITY_ERROR, "correlation.no_duplicate_ancestors", line=index,
            pointer="/parent_ids", detail="parent chain contains duplicate ancestors",
        )
    return None


# --- Matching ------------------------------------------------------------------------


@dataclass
class MatchedIdentity:
    root_run_id: str
    root_name: str
    root_start_line: int
    root_end_line: int
    tool_run_id: str
    tool_name: str
    tool_start_line: int
    tool_end_line: int
    tool_input: Dict[str, Any]
    terminal_input: Dict[str, Any]
    terminal_kwargs: Dict[str, Any]


@dataclass
class ValidationOutcome:
    result: str
    diagnostics: List[Diagnostic] = field(default_factory=list)
    matched: Optional[MatchedIdentity] = None
    evidence_document: Optional[Dict[str, Any]] = None
    evidence_valid: Optional[str] = None  # "pass" / "fail" / None (not run)
    lineage: Optional[Dict[str, Any]] = None
    opaque_exclusions: List[int] = field(default_factory=list)
    source_digest: str = ""
    source_byte_length: int = 0


def validate_source(loaded: LoadedSource, *, map_evidence: bool = True) -> ValidationOutcome:
    """Run the full frozen matching pipeline over a loaded source bundle."""
    diagnostics: List[Diagnostic] = list(loaded.diagnostics)
    codes = [d.code for d in diagnostics]

    matched: Optional[MatchedIdentity] = None
    exclusions: List[int] = []

    if not _has_refusal(codes):
        events = loaded.events
        envelope_diagnostics = validate_envelopes(events)
        diagnostics.extend(envelope_diagnostics)
        codes.extend(d.code for d in envelope_diagnostics)

        if not _has_refusal(codes):
            ancestry_diagnostics = _validate_ancestry(events)
            diagnostics.extend(ancestry_diagnostics)
            codes.extend(d.code for d in ancestry_diagnostics)

            if not _has_refusal(codes):
                matched, matching_diagnostics, exclusions = _match_lifecycle(events)
                diagnostics.extend(matching_diagnostics)
                codes.extend(d.code for d in matching_diagnostics)
                # F-01 bounded exclusion pass runs even when matching refused:
                # opaque carriers must always be reported, never silently kept.
                exclusion_diagnostics, exclusions = _enforce_opaque_exclusions(events, matched)
                diagnostics.extend(exclusion_diagnostics)
                codes.extend(d.code for d in exclusion_diagnostics)
        else:
            # Ancestry refused; still report opaque carriers deterministically.
            exclusion_diagnostics, exclusions = _enforce_opaque_exclusions(events, None)
            diagnostics.extend(exclusion_diagnostics)
            codes.extend(d.code for d in exclusion_diagnostics)

    evidence_document: Optional[Dict[str, Any]] = None
    evidence_valid: Optional[str] = None
    lineage: Optional[Dict[str, Any]] = None
    result_override: Optional[str] = None
    if matched is not None and not _has_refusal(codes):
        if map_evidence:
            from .evidence_mapping import build_evidence_document, build_lineage  # local import keeps module graph acyclic at import time

            try:
                evidence_document = build_evidence_document(loaded, matched)
                lineage = build_lineage(loaded, matched)
                evidence_valid = "pass"
            except Exception:  # conformance validator refusal: kit-level error
                result_override = RESULT_VALIDATION_ERROR
                evidence_document = None
                lineage = None
                evidence_valid = "fail"

    if result_override is None and not _has_refusal(codes):
        binding = reverify_source_digest(loaded)
        if binding is not None:
            diagnostics.append(binding)
            codes.append(binding.code)

    return ValidationOutcome(
        result=result_override if result_override is not None else select_result(codes),
        diagnostics=diagnostics,
        matched=matched,
        evidence_document=evidence_document,
        evidence_valid=evidence_valid,
        lineage=lineage,
        opaque_exclusions=exclusions,
        source_digest=loaded.raw_digest,
        source_byte_length=loaded.raw_length,
    )


def _has_refusal(codes: List[str]) -> bool:
    from .diagnostics import refusal as _refusal

    return _refusal(codes)


def _validate_ancestry(events: List[Dict[str, Any]]) -> List[Diagnostic]:
    """Root uniqueness, single-invocation scope, chain conflicts, and every
    child envelope belonging to the one root."""
    diagnostics: List[Diagnostic] = []

    top_level = [
        (index, event)
        for index, event in enumerate(events, start=1)
        if event.get("parent_ids") == []
    ]
    if not top_level:
        diagnostics.append(
            Diagnostic(INCOMPLETE_SOURCE, SEVERITY_ERROR, "root.first_event_root_start", line=1, detail="no root invocation (no event with empty parent_ids)")
        )
        return diagnostics

    first_index, first = top_level[0]
    if first_index != 1 or first.get("event") != profile.EVENT_ROOT_START:
        diagnostics.append(
            Diagnostic(INVALID_SOURCE, SEVERITY_ERROR, "root.first_event_root_start", line=first_index, detail="first event is not the root on_chain_start")
        )
        return diagnostics

    root_run_id = first.get("run_id")

    # Top-level (empty parent_ids) events: only the ONE root invocation's
    # start and end may appear. The root end also carries empty parents, so
    # classification is by run_id + event type, never by parent_ids alone.
    for index, event in top_level[1:]:
        event_type = event.get("event")
        if event.get("run_id") != root_run_id:
            diagnostics.append(
                Diagnostic(CORRELATION_CONFLICT, SEVERITY_ERROR, "root.single_invocation", line=index, detail="second root invocation (top-level event of another run) refused")
            )
        elif event_type == profile.EVENT_ROOT_START:
            diagnostics.append(
                Diagnostic(CORRELATION_CONFLICT, SEVERITY_ERROR, "root.single_start", line=index, detail="duplicate root on_chain_start refused")
            )
        elif event_type != profile.EVENT_ROOT_END:
            diagnostics.append(
                Diagnostic(CORRELATION_CONFLICT, SEVERITY_ERROR, "root.single_invocation", line=index, detail="top-level event is not a root endpoint; second root invocation refused")
            )
    # duplicate/matching root ends are classified in _match_lifecycle

    for index, event in enumerate(events, start=1):
        conflict = _parent_chain_conflicts(event, index)
        if conflict is not None:
            diagnostics.append(conflict)
        parent_ids = event.get("parent_ids")
        if isinstance(parent_ids, list) and parent_ids:
            if not isinstance(parent_ids[0], str) or parent_ids[0] != root_run_id:
                diagnostics.append(
                    Diagnostic(CORRELATION_CONFLICT, SEVERITY_ERROR, "root.child_belongs_to_root", line=index, pointer="/parent_ids/0", detail="child event chain does not begin at the single root")
                )

    # data.input presence on the root start (envelope-level requirement)
    data = first.get("data")
    if isinstance(data, dict) and "input" not in data:
        diagnostics.append(
            Diagnostic(INVALID_SOURCE, SEVERITY_ERROR, "root.data_input_present", line=first_index, pointer="/data/input", detail="root on_chain_start carries no data.input")
        )
    return diagnostics


def _match_lifecycle(events: List[Dict[str, Any]]) -> Tuple[Optional[MatchedIdentity], List[Diagnostic], List[int]]:
    diagnostics: List[Diagnostic] = []
    root_start_index = 1
    root = events[root_start_index - 1]
    root_run_id = root.get("run_id")
    root_name = root.get("name")

    # --- root endpoint ---
    root_ends = [
        (index, event)
        for index, event in enumerate(events, start=1)
        if event.get("event") == profile.EVENT_ROOT_END
        and event.get("run_id") == root_run_id
        and event.get("parent_ids") == []
    ]
    if not root_ends:
        diagnostics.append(
            Diagnostic(INCOMPLETE_SOURCE, SEVERITY_ERROR, "root.end_present", detail="no matching root on_chain_end")
        )
        return None, diagnostics, []
    if len(root_ends) > 1:
        for index, _ in root_ends[1:]:
            diagnostics.append(
                Diagnostic(CORRELATION_CONFLICT, SEVERITY_ERROR, "root.single_end", line=index, detail="duplicate root on_chain_end refused")
            )
        return None, diagnostics, []
    root_end_line = root_ends[0][0]
    if root_ends[0][1].get("name") != root_name:
        diagnostics.append(
            Diagnostic(CORRELATION_CONFLICT, SEVERITY_ERROR, "root.end_name_consistent", line=root_end_line, pointer="/name", detail="root end name differs from root start")
        )
        return None, diagnostics, []

    # --- tool error records disqualify the success-only profile ---
    for index, event in enumerate(events, start=1):
        if event.get("event") == profile.EVENT_TOOL_ERROR:
            diagnostics.append(
                Diagnostic(UNSUPPORTED_SCOPE, SEVERITY_ERROR, "scope.no_tool_error", line=index, detail="on_tool_error record present; success-only profile refused")
            )

    # --- tool starts ---
    tool_starts = [
        (index, event) for index, event in enumerate(events, start=1) if event.get("event") == profile.EVENT_TOOL_START
    ]
    if not tool_starts:
        diagnostics.append(
            Diagnostic(INCOMPLETE_SOURCE, SEVERITY_ERROR, "tool.start_present", detail="no on_tool_start observation in source")
        )
        return None, diagnostics, []
    if len(tool_starts) > 1:
        run_ids = {event.get("run_id") for _, event in tool_starts}
        if len(run_ids) == 1:
            for index, _ in tool_starts[1:]:
                diagnostics.append(
                    Diagnostic(CORRELATION_CONFLICT, SEVERITY_ERROR, "tool.single_start", line=index, detail="duplicate on_tool_start for the same tool run refused")
                )
        else:
            diagnostics.append(
                Diagnostic(UNSUPPORTED_SCOPE, SEVERITY_ERROR, "tool.single_run", line=tool_starts[1][0], detail="multiple tool runs present; success-only single-run profile refused")
            )
        return None, diagnostics, []

    start_line, start_event = tool_starts[0]
    tool_run_id = start_event.get("run_id")
    tool_name = start_event.get("name")

    # --- tool start structure ---
    if tool_run_id == root_run_id:
        diagnostics.append(
            Diagnostic(CORRELATION_CONFLICT, SEVERITY_ERROR, "tool.run_distinct_from_root", line=start_line, pointer="/run_id", detail="tool run_id equals root run_id")
        )
        return None, diagnostics, []
    parent_ids = start_event.get("parent_ids")
    if not isinstance(parent_ids, list) or not parent_ids:
        diagnostics.append(
            Diagnostic(CORRELATION_CONFLICT, SEVERITY_ERROR, "tool.nested_under_root", line=start_line, pointer="/parent_ids", detail="tool start parent chain is empty")
        )
        return None, diagnostics, []
    start_data = start_event.get("data")
    tool_input = start_data.get("input") if isinstance(start_data, dict) else None
    if not isinstance(tool_input, dict):
        diagnostics.append(
            Diagnostic(UNSUPPORTED_SERIALIZATION, SEVERITY_ERROR, "tool.input_structured_object", line=start_line, pointer="/data/input", detail="tool start data.input is not a JSON object in the supported subset")
        )
        return None, diagnostics, []
    try:
        check_plain_subset(tool_input, where="/data/input")
    except UnsupportedValue as exc:
        diagnostics.append(
            Diagnostic(UNSUPPORTED_SERIALIZATION, SEVERITY_ERROR, "tool.input_supported_subset", line=start_line, pointer="/data/input", detail=str(exc))
        )
        return None, diagnostics, []

    # --- tool terminals ---
    tool_ends = [
        (index, event) for index, event in enumerate(events, start=1) if event.get("event") == profile.EVENT_TOOL_END
    ]
    if not tool_ends:
        diagnostics.append(
            Diagnostic(INCOMPLETE_SOURCE, SEVERITY_ERROR, "tool.terminal_present", detail="no on_tool_end terminal in source")
        )
        return None, diagnostics, []
    if len(tool_ends) > 1:
        run_ids = {event.get("run_id") for _, event in tool_ends}
        if run_ids == {tool_run_id}:
            for index, _ in tool_ends[1:]:
                diagnostics.append(
                    Diagnostic(CORRELATION_CONFLICT, SEVERITY_ERROR, "tool.single_terminal", line=index, detail="duplicate on_tool_end terminal refused")
                )
        else:
            diagnostics.append(
                Diagnostic(UNSUPPORTED_SCOPE, SEVERITY_ERROR, "tool.single_run", line=tool_ends[1][0], detail="multiple tool terminals across runs; success-only single-run profile refused")
            )
        return None, diagnostics, []

    end_line, end_event = tool_ends[0]
    if end_event.get("run_id") != tool_run_id:
        diagnostics.append(
            Diagnostic(CORRELATION_CONFLICT, SEVERITY_ERROR, "tool.run_id_match", line=end_line, pointer="/run_id", detail="terminal run_id does not match the tool start run_id")
        )
        return None, diagnostics, []
    if end_event.get("parent_ids") != parent_ids:
        diagnostics.append(
            Diagnostic(CORRELATION_CONFLICT, SEVERITY_ERROR, "tool.parent_chain_match", line=end_line, pointer="/parent_ids", detail="terminal parent chain differs from the start chain")
        )
        return None, diagnostics, []
    if end_event.get("name") != tool_name:
        diagnostics.append(
            Diagnostic(CORRELATION_CONFLICT, SEVERITY_ERROR, "tool.name_consistency", line=end_line, pointer="/name", detail="terminal event name differs from tool start name")
        )
        return None, diagnostics, []
    if end_line <= start_line:
        diagnostics.append(
            Diagnostic(CORRELATION_CONFLICT, SEVERITY_ERROR, "tool.start_precedes_terminal", line=end_line, detail="terminal does not occur after the tool start")
        )
        return None, diagnostics, []

    # --- typed terminal shape (freeze section 5) ---
    end_data = end_event.get("data")
    output = end_data.get("output") if isinstance(end_data, dict) else None
    terminal_input = end_data.get("input") if isinstance(end_data, dict) else None
    if not isinstance(output, dict):
        diagnostics.append(
            Diagnostic(UNSUPPORTED_SCOPE, SEVERITY_ERROR, "terminal.typed_success_only", line=end_line, pointer="/data/output", detail="raw/list terminal output is not this success profile")
        )
        return None, diagnostics, []
    if contains_opaque_command_marker(output):
        diagnostics.append(
            Diagnostic(UNSUPPORTED_SCOPE, SEVERITY_ERROR, "terminal.command_terminal_refused", line=end_line, pointer="/data/output", detail="Command-carrying terminal is not this success profile")
        )
        return None, diagnostics, []
    if (
        output.get("lc") != 1
        or output.get("type") != "constructor"
        or output.get("id") != profile.TOOL_MESSAGE_ID
    ):
        diagnostics.append(
            Diagnostic(
                UNSUPPORTED_SERIALIZATION, SEVERITY_ERROR, "terminal.typed_toolmessage", line=end_line,
                pointer="/data/output",
                detail="terminal output is not the audited constructed ToolMessage",
            )
        )
        return None, diagnostics, []
    kwargs = output.get("kwargs")
    if not isinstance(kwargs, dict):
        diagnostics.append(
            Diagnostic(UNSUPPORTED_SERIALIZATION, SEVERITY_ERROR, "terminal.kwargs_object", line=end_line, pointer="/data/output/kwargs", detail="terminal ToolMessage kwargs missing or not an object")
        )
        return None, diagnostics, []
    try:
        check_plain_subset(kwargs, where="/data/output/kwargs")
    except UnsupportedValue as exc:
        diagnostics.append(
            Diagnostic(UNSUPPORTED_SERIALIZATION, SEVERITY_ERROR, "terminal.kwargs_supported_subset", line=end_line, pointer="/data/output/kwargs", detail=str(exc))
        )
        return None, diagnostics, []
    if kwargs.get("type") != profile.TERMINAL_KWARGS_TYPE:
        diagnostics.append(
            Diagnostic(UNSUPPORTED_SERIALIZATION, SEVERITY_ERROR, "terminal.kwargs_type_tool", line=end_line, pointer="/data/output/kwargs/type", detail="terminal kwargs.type is not 'tool'")
        )
        return None, diagnostics, []
    tool_call_id = kwargs.get("tool_call_id")
    if not isinstance(tool_call_id, str) or tool_call_id.strip() == "":
        diagnostics.append(
            Diagnostic(UNSUPPORTED_SERIALIZATION, SEVERITY_ERROR, "terminal.tool_call_id_present", line=end_line, pointer="/data/output/kwargs/tool_call_id", detail="terminal tool_call_id missing/empty; never reconstructed")
        )
        return None, diagnostics, []
    if "status" not in kwargs:
        diagnostics.append(
            Diagnostic(UNSUPPORTED_SERIALIZATION, SEVERITY_ERROR, "terminal.explicit_status", line=end_line, pointer="/data/output/kwargs/status", detail="terminal status missing; class default is never supplied")
        )
        return None, diagnostics, []
    if kwargs.get("status") != profile.TERMINAL_STATUS_SUCCESS:
        diagnostics.append(
            Diagnostic(UNSUPPORTED_SCOPE, SEVERITY_ERROR, "terminal.success_only", line=end_line, pointer="/data/output/kwargs/status", detail=f"terminal status {kwargs.get('status')!r} is not this success profile")
        )
        return None, diagnostics, []
    if kwargs.get("name") != tool_name:
        diagnostics.append(
            Diagnostic(CORRELATION_CONFLICT, SEVERITY_ERROR, "terminal.name_consistency", line=end_line, pointer="/data/output/kwargs/name", detail="terminal ToolMessage name differs from the tool event name")
        )
        return None, diagnostics, []
    content = kwargs.get("content")
    if not isinstance(content, (str, list)):
        diagnostics.append(
            Diagnostic(UNSUPPORTED_SERIALIZATION, SEVERITY_ERROR, "terminal.content_shape", line=end_line, pointer="/data/output/kwargs/content", detail="terminal content is neither string nor JSON list")
        )
        return None, diagnostics, []
    if not isinstance(terminal_input, dict):
        diagnostics.append(
            Diagnostic(UNSUPPORTED_SERIALIZATION, SEVERITY_ERROR, "terminal.cached_input", line=end_line, pointer="/data/input", detail="terminal cached data.input missing or not an object")
        )
        return None, diagnostics, []
    if json.dumps(terminal_input, sort_keys=True) != json.dumps(tool_input, sort_keys=True):
        diagnostics.append(
            Diagnostic(CORRELATION_CONFLICT, SEVERITY_ERROR, "terminal.input_conflict_check", line=end_line, pointer="/data/input", detail="cached terminal input conflicts with the start snapshot")
        )
        return None, diagnostics, []

    # --- terminal inside the root span ---
    if root_end_line <= end_line:
        diagnostics.append(
            Diagnostic(CORRELATION_CONFLICT, SEVERITY_ERROR, "root.end_after_tool_terminal", line=root_end_line, detail="root on_chain_end occurs before the tool terminal (terminal outside root span)")
        )
        return None, diagnostics, []

    matched = MatchedIdentity(
        root_run_id=str(root_run_id),
        root_name=str(root_name),
        root_start_line=root_start_index,
        root_end_line=root_end_line,
        tool_run_id=str(tool_run_id),
        tool_name=str(tool_name),
        tool_start_line=start_line,
        tool_end_line=end_line,
        tool_input=tool_input,
        terminal_input=terminal_input,
        terminal_kwargs=kwargs,
    )
    return matched, diagnostics, []


def _is_required_record(event: Dict[str, Any]) -> bool:
    """Type-based required-record classification, independent of matching
    success: tool lifecycle records and every top-level (root-span) event can
    never use the opaque exclusion — even when an earlier stage already
    refused the source, widening the exclusion set is not permitted."""
    if event.get("event") in (
        profile.EVENT_TOOL_START,
        profile.EVENT_TOOL_END,
        profile.EVENT_TOOL_ERROR,
    ):
        return True
    return event.get("parent_ids") == []


def _enforce_opaque_exclusions(
    events: List[Dict[str, Any]], matched: Optional[MatchedIdentity]
) -> Tuple[List[Diagnostic], List[int]]:
    """F-01 bounded exclusion (freeze section 7): only NONESSENTIAL events may
    be excluded as opaque Command carriers, reported by actual location. The
    four required records (root start/end, tool start/terminal) can never use
    the exclusion: an opaque marker inside them is UNSUPPORTED_SERIALIZATION
    and refuses the source."""
    diagnostics: List[Diagnostic] = []
    excluded: List[int] = []
    for index, event in enumerate(events, start=1):
        if not contains_opaque_command_marker(event):
            continue
        if _is_required_record(event):
            diagnostics.append(
                Diagnostic(
                    UNSUPPORTED_SERIALIZATION, SEVERITY_ERROR, "f01.required_record_opaque",
                    line=index, detail="opaque Command marker inside a required record; exclusion not permitted",
                )
            )
            continue
        diagnostics.append(
            Diagnostic(
                OPAQUE_SOURCE_EXCLUDED, SEVERITY_INFO, "f01.opaque_carrier_excluded",
                line=index, detail="nonessential opaque Command carrier excluded from known evidence; raw line retained untouched",
            )
        )
        excluded.append(index)
    return diagnostics, excluded
