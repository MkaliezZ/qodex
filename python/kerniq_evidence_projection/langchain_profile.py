"""langchain-create-agent-native-stream-v0.1-limited: pinned limited profile.

The ONLY admitted source is the fixed engineering capture bundle at
commit 7ba1f9c (experiments/langchain-proof-v0-5-1/engineering-source-bundle),
whose manifest and raw digests are pinned below. This profile exists
because the full-capture qualification was REJECTED and F-01 remains
UNRESOLVED: only the strictly-audited structured subset below may be
projected, and the four opaque `langgraph.types.Command`
(``type=not_implemented`` + repr) carrier events are HARD-EXCLUDED — their
repr is never parsed, and no known Evidence may derive from them.

Historical status (must not be rewritten):
    FULL_CAPTURE_QUALIFICATION=REJECTED
    F01_FULL_CAPTURE_STATUS=UNRESOLVED
    LIMITED_PROFILE_FEASIBLE=true
    FRESH_RECAPTURE_REQUIRED=false
"""

from __future__ import annotations

PROFILE_ID = "langchain-create-agent-native-stream-v0.1-limited"
PRODUCER_REF = "kerniq:offline-projector/langchain-limited-v0.5.2"
PROFILE_REF = "kerniq:source-profile/langchain-create-agent-native-stream-v0.1-limited"

SOURCE_COMMIT = "7ba1f9cfce6959d2c929339028b2a1b8800a56b9"
BUNDLE_DIR = "experiments/langchain-proof-v0-5-1/engineering-source-bundle"
MANIFEST_SHA256 = "8e763aab1108e1d8ecadde86cb7ad41b6f350ed6f21e145513dff4aac7ed6f4e"
RAW_SHA256 = "4ec86fd2a3ba09f98f4b456defd660d86d1bde64019b058e15080dea59c6b0fc"

# Pinned invocation identity (from the audited capture session):
ROOT_RUN_ID = "01a07bef-a4e2-7700-ab47-725ea424edd2"
TOOL_RUN_ID = "01a07bef-aceb-7831-8bc8-ee0b6d04e216"
TOOL_CALL_ID = "call_00_EMjZPaEGySyDBpxQD2St6577"
TOOL_NAME = "add"
RUNTIME_REF = "langchain:1.4.0/langgraph:1.2.11"

# The audited structured source lines (1-based in raw/native-events.jsonl):
L_MODEL_TOOL_REQUEST = 21   # on_chat_model_end: AIMessage kwargs.tool_calls[0]
L_TOOL_START = 26           # on_tool_start: data.input = {"a":17,"b":25}
L_TOOL_END = 27             # on_tool_end: ToolMessage kwargs (content/status/tool_call_id)
L_TOOLS_NODE_START = 25     # on_chain_start name=tools (corroborating context)
L_TOOLS_NODE_END = 29       # on_chain_end name=tools (corroborating context only)

# Opaque Command carrier events — HARD EXCLUSION. These lines contain
# langgraph.types.Command serialized as {"lc":1,"type":"not_implemented",
# "repr": "..."}; the repr is structured-opaque: never parsed, never loaded,
# never reflected, and no known Evidence may reference them.
OPAQUE_EXCLUDED_LINES = (22, 23, 50, 51)
OPAQUE_TYPE = "not_implemented"
OPAQUE_COMMAND_ID = ["langgraph", "types", "Command"]

# Argument digest representation (frozen Evidence v0.2 practice):
# SHA-256 over the exact UTF-8 bytes of the canonical compact JSON dump
# (sorted keys) of the structured argument object as captured.
ARGS_REPRESENTATION = "json-canonical-sorted-v1"

IDENTITY_UNKNOWN_REASON = "langchain_native_stream_records_no_requester_identity"
NO_AUTHORIZATION_REASON = "no_authorization_record_available"
NO_DECISION_REASON = "no_policy_decision_event_in_limited_profile"
