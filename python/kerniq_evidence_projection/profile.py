"""dsh-observer-v0.1: the pinned source profile for offline projection.

Source of truth for this profile:
- Boundary review §RP-07 (docs/development/
  kerniq_evidence_runtime_projection_boundary_review.md) — which DSH
  observer fields exist and what they can and cannot prove;
- the audited DSH production observer at
  packages/dsh-control-plane-observer/index.js (runtime
  deepseek-harness==0.1.2-alpha.1 @ cd5ef814): the ``dispatch`` event is
  recorded from a prepended ``tools/execute`` hook that itself chains
  ``next()`` — entering that hook IS the native execution-chain
  delegation, which is why the profile maps a ``dispatch`` line to
  ``execution.dispatch known/occurred=true`` and never to ``start``.

Event vocabulary actually emitted by the observer (verified against real
captures): model_request / pre_execute / dispatch / result. The profile
additionally accepts ``tool_call_approved`` lines so the projection rules
for authorization events (boundary review §RP-05) can be exercised by
clearly-labeled synthetic variants; the audited observer does not emit
them, and every such fixture is marked synthetic.

Everything the observer does not record stays unknown — no field is ever
invented, completed, or guessed (fail closed).
"""

from __future__ import annotations

PROFILE_ID = "dsh-observer-v0.1"
PRODUCER_REF = "kerniq:offline-projector/dsh-observer-v0.1"
PROFILE_REF = "kerniq:source-profile/dsh-observer-v0.1"

# The pinned runtime background of the audited captures. This is profile
# context, not an admission claim: a projected document asserts nothing
# about runtime integrity.
RUNTIME_REF = "deepseek-harness:0.1.2-alpha.1@cd5ef814"

PHASE_MODEL_REQUEST = "model_request"
PHASE_PRE_EXECUTE = "pre_execute"
PHASE_DISPATCH = "dispatch"
PHASE_RESULT = "result"
PHASE_TOOL_CALL_APPROVED = "tool_call_approved"  # synthetic-only (see docstring)

EMITTED_PHASES = frozenset(
    {PHASE_MODEL_REQUEST, PHASE_PRE_EXECUTE, PHASE_DISPATCH, PHASE_RESULT}
)
PROFILE_PHASES = EMITTED_PHASES | {PHASE_TOOL_CALL_APPROVED}

# Correlation key: the observer stamps its native tool call id on every
# line; there is no separate request/attempt/run identifier in the format.
CORRELATION_KEY = "toolCallId"

# Canonical decision mapping. The DSH AgentFuse adapter reports its DSH
# dialect kind on the pre_execute line; "deny" is the adapter's spelling of
# the AgentFuse canonical block action (normalized and regression-tested at
# the adapter boundary in v0.3.2). "error" maps evaluation=error with
# action=null — local errors never collapse into block.
DECISION_KIND_MAP = {
    "allow": ("decided", "allow"),
    "deny": ("decided", "block"),
    "error": ("error", None),
}

UNKNOWN_ARG_REASONS = {
    "requested": "dsh_observer_records_no_requested_arguments",
    "effective": "dsh_observer_records_no_effective_arguments",
    "executed": "dsh_observer_records_no_executed_arguments",
}

IDENTITY_UNKNOWN_REASON = "dsh_observer_records_no_requester_identity"
NO_AUTHORIZATION_REASON = "no_authorization_record_available"
MATCH_UNKNOWN_REASON = "no_positive_authorization_to_compare"
MATCH_UNKNOWN_NO_TARGET_REASON = "authorization_target_not_comparable"
