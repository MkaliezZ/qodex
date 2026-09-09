"""Validator matching tests: envelope/root/lifecycle/correlation/F-01 rules,
covering frozen refusal matrix cases 1-3, 12-24, 31-33."""

from __future__ import annotations

import copy
from pathlib import Path

import pytest

from kerniq_external_validation import langchain_profile as profile
from kerniq_external_validation.diagnostics import (
    CORRELATION_CONFLICT,
    INCOMPLETE_SOURCE,
    INVALID_SOURCE,
    OPAQUE_SOURCE_EXCLUDED,
    UNSUPPORTED_SCOPE,
    UNSUPPORTED_SERIALIZATION,
)
from kerniq_external_validation.source_loader import load_source
from kerniq_external_validation.tests.helpers import (
    ROOT_RUN_ID,
    TOOL_CALL_ID,
    TOOL_INPUT,
    TOOL_NAME,
    TOOL_RUN_ID,
    line_of,
    opaque_command_value,
    tool_message_output,
    valid_events,
    write_source,
)
from kerniq_external_validation.validator import validate_source


def _validate(tmp_path, events=None, provenance=None, raw_bytes=None, name="src"):
    src = write_source(
        tmp_path / name,
        events=events,
        provenance=provenance,
        raw_bytes=raw_bytes,
    )
    return validate_source(load_source(src))


def _codes(outcome):
    return [d.code for d in outcome.diagnostics]


# --- Positive (cases 1-3) ----------------------------------------------------------


def test_case1_valid_frozen_profile_source_passes(tmp_path):
    outcome = _validate(tmp_path)
    assert outcome.result == "PASS"
    assert outcome.evidence_document is not None
    assert OPAQUE_SOURCE_EXCLUDED in _codes(outcome)  # nonessential carrier excluded


def test_case1b_clean_stream_without_opaque_also_passes(tmp_path):
    outcome = _validate(tmp_path, events=valid_events(include_opaque_carrier=False))
    assert outcome.result == "PASS"
    assert _codes(outcome) == []


def test_case2_unknown_preservation(tmp_path):
    outcome = _validate(tmp_path)
    doc = outcome.evidence_document
    assert doc["decision"]["status"] == "unknown" and doc["decision"]["reason"]
    assert doc["authorization"]["status"] == "unknown" and doc["authorization"]["reason"]
    binding = doc["argument_binding"]
    assert binding["effective"]["status"] == "unknown"
    assert binding["executed"]["status"] == "unknown"
    assert binding["scope"]["status"] == "unknown"
    assert binding["authorization_match"]["status"] == "unknown"
    execution = doc["execution"]
    assert execution["release"]["status"] == "unknown"
    assert execution["dispatch"]["status"] == "unknown"
    assert execution["start"]["status"] == "unknown"
    # unknown never collapses to false or not_applicable
    for obs in (
        doc["decision"],
        doc["authorization"],
        binding["effective"],
        binding["executed"],
        execution["release"],
        execution["dispatch"],
        execution["start"],
    ):
        assert obs["status"] == "unknown"
        assert obs["value"] is None


def test_case3_stable_correlation_with_dynamic_ids_and_values(tmp_path):
    events = valid_events(
        root_run_id="aaaaaaaa-1111-2222-3333-dynamic-root1",
        tools_run_id="aaaaaaaa-1111-2222-3333-dynamic-tool",
        tool_run_id="aaaaaaaa-1111-2222-3333-dyn-toolrun",
        model_run_id="aaaaaaaa-1111-2222-3333-dyn-model1",
        tool_name="fetch_weather",
        tool_input={"city": "朱诺", "units": "celsius", "days": 3},
        tool_output=tool_message_output(
            name="fetch_weather",
            tool_call_id="call_DynamicWeatherCallID0001",
            content=[{"type": "text", "text": "temp_c: -4, note: snow"}],
        ),
    )
    outcome = _validate(tmp_path, events=events, name="dynamic")
    assert outcome.result == "PASS"
    request = outcome.evidence_document["request"]["value"]
    assert request["action_name"] == "fetch_weather"
    assert request["tool_call_id"] == "call_DynamicWeatherCallID0001"
    assert outcome.matched.root_run_id == "aaaaaaaa-1111-2222-3333-dynamic-root1"


# --- Root lifecycle (cases 16, 17 + root shape) -------------------------------------


def test_case17_missing_root_end_is_incomplete(tmp_path):
    events = valid_events(include_opaque_carrier=False)
    root_end_line = line_of(events, "on_chain_end", run_id=ROOT_RUN_ID)
    events = events[: root_end_line - 1] + events[root_end_line:]
    outcome = _validate(tmp_path, events=events)
    assert INCOMPLETE_SOURCE in _codes(outcome)
    assert outcome.result != "PASS"


def test_second_root_invocation_refused(tmp_path):
    events = valid_events(include_opaque_carrier=False)
    events.append(
        {
            "event": "on_chain_start",
            "data": {"input": {}},
            "name": "LangGraph",
            "run_id": "second-root-0000",
            "parent_ids": [],
            "tags": [],
            "metadata": {},
        }
    )
    outcome = _validate(tmp_path, events=events)
    assert CORRELATION_CONFLICT in _codes(outcome)


def test_case16_cross_root_child_refused(tmp_path):
    events = valid_events(include_opaque_carrier=False)
    events.insert(
        3,
        {
            "event": "on_chain_stream",
            "data": {"chunk": {}},
            "name": "elsewhere",
            "run_id": "orphan-run-000001",
            "parent_ids": ["some-other-root-00"],
            "tags": [],
            "metadata": {},
        },
    )
    outcome = _validate(tmp_path, events=events)
    assert CORRELATION_CONFLICT in _codes(outcome)


def test_duplicate_root_end_refused(tmp_path):
    events = valid_events(include_opaque_carrier=False)
    events.append(copy.deepcopy(events[-1]))  # second root end, same run
    outcome = _validate(tmp_path, events=events)
    assert CORRELATION_CONFLICT in _codes(outcome)


def test_root_end_before_tool_terminal_refused(tmp_path):
    events = valid_events(include_opaque_carrier=False)
    root_end = events.pop()
    events.insert(3, root_end)  # now before the tool terminal
    outcome = _validate(tmp_path, events=events)
    assert CORRELATION_CONFLICT in _codes(outcome)


def test_first_event_not_root_start_refused(tmp_path):
    events = valid_events(include_opaque_carrier=False)
    events.insert(0, events[1])  # model start first
    outcome = _validate(tmp_path, events=events)
    assert INVALID_SOURCE in _codes(outcome)


def test_root_start_without_data_input_refused(tmp_path):
    events = valid_events(include_opaque_carrier=False)
    events[0]["data"].pop("input")
    outcome = _validate(tmp_path, events=events)
    assert INVALID_SOURCE in _codes(outcome)


# --- Tool lifecycle (cases 12-15, 18, 31-33) -----------------------------------------


def _tool_start_index(events):
    return line_of(events, "on_tool_start") - 1


def _tool_end_index(events):
    return line_of(events, "on_tool_end") - 1


def test_case12_duplicate_tool_start_refused(tmp_path):
    events = valid_events(include_opaque_carrier=False)
    events.insert(_tool_start_index(events) + 1, copy.deepcopy(events[_tool_start_index(events)]))
    outcome = _validate(tmp_path, events=events)
    assert CORRELATION_CONFLICT in _codes(outcome)


def test_case13_duplicate_tool_end_refused(tmp_path):
    events = valid_events(include_opaque_carrier=False)
    events.insert(_tool_end_index(events) + 1, copy.deepcopy(events[_tool_end_index(events)]))
    outcome = _validate(tmp_path, events=events)
    assert CORRELATION_CONFLICT in _codes(outcome)


def test_case14_multiple_tool_runs_refused(tmp_path):
    events = valid_events(include_opaque_carrier=False)
    second = copy.deepcopy(events[_tool_start_index(events)])
    second["run_id"] = "second-tool-run-0001"
    second["data"]["input"] = {"other": True}
    events.insert(_tool_start_index(events) + 1, second)
    outcome = _validate(tmp_path, events=events)
    assert UNSUPPORTED_SCOPE in _codes(outcome)


def test_case15_parent_chain_mismatch_refused(tmp_path):
    events = valid_events(include_opaque_carrier=False)
    events[_tool_end_index(events)]["parent_ids"] = [ROOT_RUN_ID]  # drops the tools node
    outcome = _validate(tmp_path, events=events)
    assert CORRELATION_CONFLICT in _codes(outcome)


def test_case18_missing_tool_terminal_is_incomplete(tmp_path):
    events = valid_events(include_opaque_carrier=False)
    events.pop(_tool_end_index(events))
    outcome = _validate(tmp_path, events=events)
    assert INCOMPLETE_SOURCE in _codes(outcome)


def test_missing_tool_start_is_incomplete(tmp_path):
    events = valid_events(include_opaque_carrier=False)
    events.pop(_tool_start_index(events))
    outcome = _validate(tmp_path, events=events)
    assert INCOMPLETE_SOURCE in _codes(outcome)


def test_case31_tool_name_mismatch_refused(tmp_path):
    events = valid_events(include_opaque_carrier=False)
    events[_tool_end_index(events)]["data"]["output"]["kwargs"]["name"] = "different_tool"
    outcome = _validate(tmp_path, events=events)
    assert CORRELATION_CONFLICT in _codes(outcome)


def test_case32_start_end_input_conflict_refused(tmp_path):
    events = valid_events(include_opaque_carrier=False)
    events[_tool_end_index(events)]["data"]["input"] = {"order_id": "A-9999", "include_items": True}
    outcome = _validate(tmp_path, events=events)
    assert CORRELATION_CONFLICT in _codes(outcome)


def test_case33_tool_call_id_missing_refused(tmp_path):
    events = valid_events(include_opaque_carrier=False)
    del events[_tool_end_index(events)]["data"]["output"]["kwargs"]["tool_call_id"]
    outcome = _validate(tmp_path, events=events)
    assert UNSUPPORTED_SERIALIZATION in _codes(outcome)


def test_terminal_before_start_refused(tmp_path):
    events = valid_events(include_opaque_carrier=False)
    start = events.pop(_tool_start_index(events))
    events.insert(_tool_end_index(events) + 1, start)  # start now after terminal
    outcome = _validate(tmp_path, events=events)
    assert CORRELATION_CONFLICT in _codes(outcome)


def test_tool_error_event_refused(tmp_path):
    events = valid_events(include_opaque_carrier=False)
    events.append(
        {
            "event": "on_tool_error",
            "data": {"error": "synthetic"},
            "name": TOOL_NAME,
            "run_id": TOOL_RUN_ID,
            "parent_ids": [ROOT_RUN_ID],
            "tags": [],
            "metadata": {},
        }
    )
    outcome = _validate(tmp_path, events=events)
    assert UNSUPPORTED_SCOPE in _codes(outcome)


# --- Terminal shape (cases 19-23) ------------------------------------------------------


def _terminal_kwargs(events):
    return events[_tool_end_index(events)]["data"]["output"]["kwargs"]


def test_case19_status_error_is_not_success_profile(tmp_path):
    events = valid_events(include_opaque_carrier=False)
    _terminal_kwargs(events)["status"] = "error"
    _terminal_kwargs(events)["content"] = "boom"
    outcome = _validate(tmp_path, events=events)
    assert UNSUPPORTED_SCOPE in _codes(outcome)


def test_case20_missing_status_never_repaired_from_default(tmp_path):
    events = valid_events(include_opaque_carrier=False)
    del _terminal_kwargs(events)["status"]
    outcome = _validate(tmp_path, events=events)
    assert UNSUPPORTED_SERIALIZATION in _codes(outcome)


def test_case21_command_terminal_refused(tmp_path):
    events = valid_events(include_opaque_carrier=False)
    events[_tool_end_index(events)]["data"]["output"] = opaque_command_value()
    outcome = _validate(tmp_path, events=events)
    assert UNSUPPORTED_SCOPE in _codes(outcome)


def test_case22_unsupported_constructor_refused(tmp_path):
    events = valid_events(include_opaque_carrier=False)
    output = events[_tool_end_index(events)]["data"]["output"]
    output["id"] = ["mycompany", "widgets", "CustomResult"]
    outcome = _validate(tmp_path, events=events)
    assert UNSUPPORTED_SERIALIZATION in _codes(outcome)


def test_raw_string_terminal_refused(tmp_path):
    events = valid_events(include_opaque_carrier=False)
    events[_tool_end_index(events)]["data"]["output"] = "42"
    outcome = _validate(tmp_path, events=events)
    assert UNSUPPORTED_SCOPE in _codes(outcome)


def test_list_terminal_refused(tmp_path):
    events = valid_events(include_opaque_carrier=False)
    events[_tool_end_index(events)]["data"]["output"] = [{"lc": 1, "type": "constructor", "id": profile.TOOL_MESSAGE_ID, "kwargs": {}}]
    outcome = _validate(tmp_path, events=events)
    assert UNSUPPORTED_SCOPE in _codes(outcome)


# --- Serialization ambiguity (case 23) ---------------------------------------------------


def test_case23_required_repr_not_implemented_refused(tmp_path):
    events = valid_events(include_opaque_carrier=False)
    # a not_implemented marker inside REQUIRED terminal kwargs content
    _terminal_kwargs(events)["content"] = opaque_command_value()
    outcome = _validate(tmp_path, events=events)
    assert UNSUPPORTED_SERIALIZATION in _codes(outcome)
    # the required terminal line itself is never silently excluded
    assert line_of(events, "on_tool_end") not in outcome.opaque_exclusions


def test_required_tool_input_with_lc_key_refused(tmp_path):
    events = valid_events(include_opaque_carrier=False, tool_input={"lc": 1})
    outcome = _validate(tmp_path, events=events)
    assert UNSUPPORTED_SERIALIZATION in _codes(outcome)


def test_required_tool_input_with_escaped_marker_refused(tmp_path):
    events = valid_events(include_opaque_carrier=False)
    events[_tool_start_index(events)]["data"]["input"] = {"payload": {"__lc_escaped__": True}}
    outcome = _validate(tmp_path, events=events)
    assert UNSUPPORTED_SERIALIZATION in _codes(outcome)


def test_required_root_start_with_opaque_marker_refused(tmp_path):
    events = valid_events(include_opaque_carrier=False)
    events[0]["data"]["input"] = {"messages": opaque_command_value()}
    outcome = _validate(tmp_path, events=events)
    assert UNSUPPORTED_SERIALIZATION in _codes(outcome)


# --- F-01 exclusion (case 24) --------------------------------------------------------------


def test_case24_opaque_nonessential_event_excluded_but_retained(tmp_path):
    events = valid_events()  # includes the opaque model-stream carrier at line 3
    src = write_source(tmp_path / "src", events=events)
    loaded = load_source(src)
    raw_lines = (src / profile.RAW_FILENAME).read_bytes().splitlines()
    outcome = validate_source(loaded)
    assert outcome.result == "PASS"
    assert outcome.opaque_exclusions == [3]
    # raw line retained untouched: exclusion never deletes bytes
    assert b"Command" in raw_lines[2]


def test_opaque_marker_on_second_nonessential_line_also_excluded(tmp_path):
    events = valid_events(include_opaque_carrier=False)
    events.insert(
        2,
        {
            "event": "on_chain_stream",
            "data": {"chunk": opaque_command_value()},
            "name": "model",
            "run_id": events[1]["run_id"],
            "parent_ids": [ROOT_RUN_ID],
            "tags": [],
            "metadata": {},
        },
    )
    outcome = _validate(tmp_path, events=events)
    assert outcome.result == "PASS"
    assert OPAQUE_SOURCE_EXCLUDED in _codes(outcome)


def test_repr_text_never_matches_as_opaque_marker(tmp_path):
    from kerniq_external_validation.validator import contains_opaque_command_marker

    fake = {"lc": 1, "type": "constructor", "id": ["x"], "kwargs": {"content": "not_implemented Command repr"}}
    assert contains_opaque_command_marker(fake) is False
    # marker tokens split across different nodes never match
    split = {"a": {"lc": 1, "type": "not_implemented"}, "b": {"id": ["langgraph", "types", "Command"]}}
    assert contains_opaque_command_marker(split) is False
