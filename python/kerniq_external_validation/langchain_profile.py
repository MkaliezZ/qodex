"""Frozen external profile constants for the minimal validator.

Reference (normative, in priority order):
1. docs/development/kerniq_langchain_external_profile_v0_6_2_freeze.md
   (LANGCHAIN_EXTERNAL_PROFILE_V0_6_2_FROZEN, PROFILE_FROZEN=true)
2. docs/development/kerniq_langchain_public_spec_source_qualification_v0_6_1.md
3. docs/development/kerniq_external_validation_pilot_v0_6_design.md

This module only DECLARES the frozen rules. It contains no parsing logic and
no interpretation: every constant mirrors a freeze statement verbatim.
Reinterpreting any value here during implementation is forbidden; the freeze
document is the only authority.
"""

from __future__ import annotations

# --- Identity -----------------------------------------------------------

PROFILE_ID = "langchain-create-agent-tool-run-jsonl-v0.1"
PROFILE_VERSION = "0.1.0"
PROFILE_REF = "kerniq:profile:langchain-create-agent-tool-run-jsonl-v0.1:0.1.0"

# --- Validator / artifact identity ---------------------------------------

VALIDATOR_VERSION = "0.6.3"
PRODUCER_REF = "kerniq:external-validator:0.6.3"
PILOT_VERSION = "0.6"
ARTIFACT_VERSION = "1"

# --- Pinned producer environment (freeze section 3/4) --------------------
# Exact reviewed releases; anything else is UNSUPPORTED_PROFILE, never a
# best-effort acceptance.

PINNED_LANGCHAIN = "1.4.0"
PINNED_LANGCHAIN_CORE = "1.6.2"
PINNED_LANGGRAPH = "1.2.11"
PINNED_LANGGRAPH_PREBUILT = "1.1.0"
PINNED_PYTHON = "3.11.15"
PINNED_PYDANTIC = "2.13.5"
PINNED_SERIALIZER_IDENTITY = "langchain_core.load.dump.dumps"
PINNED_STREAM_METHOD = "astream_events"
PINNED_STREAM_VERSION = "v2"

SOURCE_REPRESENTATION = "lc-dumps-jsonl-v1"

# --- Source bundle layout --------------------------------------------------

RAW_FILENAME = "native-events.jsonl"
PROVENANCE_FILENAME = "provenance.json"
INVENTORY_FILENAME = "inventory.json"
INVENTORY_SCHEMA = "kerniq-source-inventory-v1"

# --- Digest representations -------------------------------------------------

SOURCE_DIGEST_REPRESENTATION = "utf8-jsonl-exact-v1"
# Artifact canonicalization frozen by THIS implementation proof (pilot design
# section 11 allowed a minimal, explicitly tested deterministic JSON
# representation when RFC 8785 is not a reasonable stdlib dependency).
# Rules: UTF-8; object keys sorted by Unicode code point; separators (",", ":")
# without whitespace; strings serialized as JSON with minimal escaping
# (json.dumps ensure_ascii=False); the only numeric values ever emitted in an
# artifact are integers, so no float normalization case exists.
ARTIFACT_CANONICALIZATION = "kerniq-json-canonical-v1"

# --- Typed terminal shape (freeze section 5) --------------------------------

TOOL_MESSAGE_ID = ["langchain", "schema", "messages", "ToolMessage"]
TERMINAL_KWARGS_TYPE = "tool"
TERMINAL_STATUS_SUCCESS = "success"

# --- Opaque Command marker (freeze section 7, F-01) -------------------------
# Structural identity only: a single dict node simultaneously carrying
# lc==1, type=="not_implemented" and the langgraph Command id. The "repr"
# value of such a node is NEVER read.

OPAQUE_TYPE = "not_implemented"
OPAQUE_COMMAND_ID = ["langgraph", "types", "Command"]

# Serialization-ambiguity keys: their presence inside REQUIRED record data is
# refused (UNSUPPORTED_SERIALIZATION), never interpreted.
LC_SEMANTIC_KEYS = frozenset({"lc", "__lc_escaped__"})

# --- Event classification ----------------------------------------------------

EVENT_ROOT_START = "on_chain_start"
EVENT_ROOT_END = "on_chain_end"
EVENT_TOOL_START = "on_tool_start"
EVENT_TOOL_END = "on_tool_end"
EVENT_TOOL_ERROR = "on_tool_error"

# --- Capture termination declarations ---------------------------------------
# Only a declared normal end admits the success profile; every explicit
# degraded termination is INCOMPLETE_SOURCE (freeze section 5/7).

TERMINATION_NORMAL = "normal_end"
TERMINATION_DEGRADED = frozenset({"truncated", "cancelled", "error"})

FILTER_DECLARED_NONE = "none"

# --- Fixed claim taxonomy (pilot design section 10) --------------------------

CLAIMS_PROVEN = (
    "TOOL_REQUEST_OBSERVED",            # start.data.input structured runtime observation
    "TOOL_CALL_ID_FROM_TERMINAL",       # native id from the typed terminal only
    "TOOL_ACTION_NAME",                 # tool display name
    "TOOL_SUCCESSFUL_RETURN_SOURCE_REPORTED",  # typed terminal, no side-effect claim
    "TOOL_RUN_LIFECYCLE_CORRELATION",   # Level A: (digest, root_run_id, tool_run_id)
    "RUNTIME_COMPLETION_OBSERVED",      # terminal settlement, at=null
)

CLAIMS_UNKNOWN = (
    "MODEL_REQUEST_ORIGIN",
    "CALLER_IDENTITY",
    "POLICY_DECISION",
    "AUTHORIZATION",
    "EFFECTIVE_ARGS",
    "EXECUTED_ARGS",
    "SCOPE",
    "AUTHORIZATION_MATCH",
    "RELEASE_RECEIPT",
    "DISPATCH_RECEIPT",
    "PHYSICAL_START",
    "EXECUTION_TIMESTAMP",
)

CLAIMS_REFUSED = (
    "GOVERNED_CAPABILITY",
    "AUTHORIZATION_PROOF",
    "PHYSICAL_EXECUTION",
    "PHYSICAL_SIDE_EFFECT",
    "EXACTLY_ONCE_EXECUTION",
    "MODEL_INTENT_PROVENANCE",
    "GENERAL_LANGCHAIN_SUPPORT",
    "ZERO_CHANGE_CAPTURE_FOR_ALL_USERS",
    "RUNTIME_TRUST",
)

CAPABILITY_ASSESSMENT = "OBSERVED"

# --- Truth boundary (freeze section 9; must never be weakened) ---------------

FULL_CAPTURE_QUALIFICATION = "REJECTED"
F01_FULL_CAPTURE_STATUS = "UNRESOLVED"

REQUEST_SEMANTICS = "RUNTIME_TOOL_REQUEST_OBSERVATION"
TOOL_RUN_LIFECYCLE_CORRELATION_PROVEN = True
MODEL_REQUEST_TO_TOOL_RUN_CORRELATION_PROVEN = False

# --- Known-field mapping reasons (Evidence v0.2 unknown records) --------------

REASON_NO_MODEL_REQUEST_ID = "no_native_request_id_in_event_stream"
REASON_IDENTITY_UNKNOWN = "metadata_tags_are_not_authentication"
REASON_NO_DECISION = "no_policy_decision_receipt_in_source"
REASON_NO_AUTHORIZATION = "no_authorization_receipt_in_source"
REASON_NO_EFFECTIVE_ARGS = "no_post_decision_snapshot_in_source"
REASON_NO_EXECUTED_ARGS = "no_physical_entry_observation_in_source"
REASON_NO_SCOPE = "no_scope_record_in_source"
REASON_NO_AUTHORIZATION_MATCH = "no_positive_authorization_to_compare"
REASON_NO_RELEASE = "no_release_receipt_in_source"
REASON_NO_DISPATCH = "no_dispatch_receipt_in_source"
REASON_NO_PHYSICAL_START = "on_tool_start_is_not_physical_entry"
REASON_NO_EXECUTION_TIMESTAMP = "native_event_stream_has_no_execution_timestamp"

# --- Claim -> source rule ids (artifact claim_checks) -------------------------

CLAIM_RULES = {
    "TOOL_REQUEST_OBSERVED": "start.data.input structured JSON object (supported subset)",
    "TOOL_CALL_ID_FROM_TERMINAL": "terminal kwargs.tool_call_id nonempty string; terminal origin recorded",
    "TOOL_ACTION_NAME": "tool event name (display name; no executable identity)",
    "TOOL_SUCCESSFUL_RETURN_SOURCE_REPORTED": (
        "typed ToolMessage terminal, explicit status=success; source-reported return only"
    ),
    "TOOL_RUN_LIFECYCLE_CORRELATION": (
        "(source_digest, root_run_id, tool_run_id); ordered parent chains agree; never name/time/args"
    ),
    "RUNTIME_COMPLETION_OBSERVED": "unique matching typed terminal; runtime settlement, at=null",
}
