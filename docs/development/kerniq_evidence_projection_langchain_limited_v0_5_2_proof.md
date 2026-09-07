# KerniQ v0.5.2 — LangChain Limited Offline Evidence Projection Proof

```text
BRANCH=feat/kerniq-langchain-limited-projection-v0-5-2 (from DSH projection 615680a)
SOURCE_COMMIT=7ba1f9cfce6959d2c929339028b2a1b8800a56b9 (frozen, imported read-only)
REVIEW_INPUTS=docs/development/kerniq_langchain_actual_source_qualification_v0_5_1.md (verbatim)
             docs/development/kerniq_langchain_f01_limited_profile_review_v0_5_1.md (verbatim)
```

## Status header

```text
PROFILE_ID=langchain-create-agent-native-stream-v0.1-limited
REAL_LANGCHAIN_SOURCE=true
REAL_MODEL_SOURCE=true
SOURCE_BUNDLE_IMMUTABLE=true   (manifest/raw digests pinned; real bundle untouched)
FULL_CAPTURE_QUALIFICATION=REJECTED
F01_FULL_CAPTURE_STATUS=UNRESOLVED
LIMITED_PROFILE_USED=true
```

This proves the frozen Evidence v0.2 contract can faithfully express the
strictly-audited structured subset of ONE fixed real LangChain capture.
It is NOT a LangChain adapter, governance integration, live attachment,
AgentFuse integration, or support claim; and it does not rewrite the
REJECTED full-capture history.

## Implementation

```text
python/kerniq_evidence_projection/langchain_profile.py    pinned profile
python/kerniq_evidence_projection/langchain_projector.py  fail-closed projector
python/kerniq_evidence_projection/tests/test_langchain_projection.py  16 tests
```

Profile pins: bundle path, manifest SHA-256
(`8e763aab…7ed6f4e`), raw SHA-256 (`4ec86fd2…c6b0fc`), source commit,
root/tool run ids, tool_call_id, runtime versions, admitted source lines
(L21 request / L26 tool-start / L27 tool-end; L25+L29 corroborating
context only), the four opaque-excluded lines (L22/L23/L50/L51), argument
digest representation (`json-canonical-sorted-v1`), and unknown rules.

Projector behavior (all fail-closed, stdlib-only):

- Both bundle digests verified before any event is read; any mismatch is a
  hard refusal.
- Exactly 53 raw lines expected; structural deviation refuses.
- The four opaque `langgraph.types.Command` (`type=not_implemented` + repr)
  carrier lines are HARD-EXCLUDED by structure marker; the repr payload is
  never accessed (a source-level regression asserts no `.repr`/`["repr"]`
  access pattern exists), never parsed, never loaded; they remain in the
  source, appear in diagnostics and lineage as exclusions, and no known
  Evidence references them.
- Correlation uses the native chain only — tool_call_id equality across
  L21/L27 plus the tool run under the pinned root-run parent chain — never
  name/timestamp/argument equality.
- A second conflicting terminal for the same call refuses (no
  last-write-wins).
- Output is re-validated by the frozen conformance validator inside the
  projector before return.

## Allowed claims actually proven

```text
REQUEST_PROJECTION_PROVEN=true
  request known from L21 AIMessage tool_calls[0] (structured, typed);
  original tool_call_id and tool name preserved.

REQUESTED_ARGUMENT_PROJECTION_PROVEN=true
  {"a":17,"b":25} from L21; digest sha256 over canonical sorted JSON
  (json-canonical-sorted-v1), representation recorded in the record.

CALL_CORRELATION_PROVEN=true (profile-derived)
  native tool_call_id + tool run_id + root-run parent chain;
  single unambiguous candidate call only.

SOURCE_CONFIRMED_COMPLETION_PROVEN=true
  typed on_tool_end (L27) with matching tool_call_id → observed terminal.
  No physical start inferred (execution.start stays unknown:
  on_tool_start is the agent-graph tool node, not the function entry).

SOURCE_CONFIRMED_OUTCOME_PROVEN=true
  ToolMessage status=success content="42" → source-confirmed successful
  return. success ≠ physical side effect; success ≠ external business
  success.

OPAQUE_EVENTS_EXCLUDED=true (4/4 detected by marker, repr untouched)

UNKNOWN_PRESERVATION_PROVEN=true
  decision / authorization / trusted identity / effective args / executed
  args / authorization_match / execution.release / dispatch / start all
  remain exactly unknown — never known, false, or not_applicable.

EVIDENCE_VALIDATOR_PASS=true (frozen v0.2 conformance validator,
  unchanged, no LangChain special-casing)
```

## Test results

```text
LangChain limited projection:  16 passed (8 required CASEs + refusal
                               variants + immutability guard)
DSH projection regression:     21 passed (unchanged)
Evidence conformance:          46 passed (validator unchanged)
Combined: 83 passed on Python 3.11 and Python 3.13.
```

CASE notes: real-bundle positive (CASE 1/2/7/8) runs read-only against the
pinned digests; CASE 3–6 tamper only tmp copies (digest re-pinned to the
copy so the identity gate passes and the specific guard under test fires);
CASE 6 replaces an in-context line (structure intact) so the
conflicting-terminal path itself refuses. The real bundle's digests are
re-asserted unchanged by a dedicated test after every tampering case.

## Proof closure (2026-09-08)

Independent review returned CONCLUSION=FIX_REQUIRED (thesis still valid,
bundle projection valid as bounded sample). Four findings closed:

```text
PROOF_CLOSURE_STATUS=CLOSED

RESULT_CORRELATION_CLOSED=true
  P1-1: the terminal result now carries its own identity checks — L27
  run_id must equal the pinned tool run, must equal L26's run_id, and the
  pinned root run must appear in BOTH parent chains, which must also be
  consistent with each other. tool_call_id alone never accepts a terminal.

UNEXPECTED_OUTCOME_FAIL_CLOSED=true
  P1-2: only the audited terminal shape (ToolMessage status="success"
  content="42") projects to outcome success. Missing/unknown/unexpected
  status, unexpected content, or a changed result shape refuses the whole
  projection — the limited profile has no failure mapping and invents
  none (no unknown→failure downgrade path exists).

OPAQUE_MARKER_FAIL_CLOSED=true
  P2-1: each pinned opaque line (L22/L23/L50/L51) must actually carry the
  audited not_implemented + langgraph.types.Command marker; a pinned line
  without the marker is a hard refusal. Conversely, a not_implemented
  Command appearing on any unapproved line also refuses — the exclusion
  set never widens by content. repr remains unread in every path.

STRUCTURAL_DETERMINISM_PROVEN=true
  P2-2: the replay test proves deterministic structurally-identical
  canonical projection results (document, lineage, exclusions). No
  byte-serialization claim is made or tested.
```

Test counts after closure: LangChain 24 (16 prior + 6 closure negatives +
renamed determinism case), DSH 21 (unchanged), conformance 46 (validator
unchanged). Real bundle digests re-asserted unchanged after every tamper
case. All suites green on Python 3.11 and 3.13.

Historical statuses unchanged: FULL_CAPTURE_QUALIFICATION=REJECTED,
F01_FULL_CAPTURE_STATUS=UNRESOLVED, LIMITED_PROFILE_USED=true,
FRESH_RECAPTURE_REQUIRED=false.

## Not claimed (per review boundary)

```text
LANGCHAIN_GOVERNANCE_PROVEN — no
LANGCHAIN_RUNTIME_CONTROL_PROVEN — no
LANGCHAIN_SUPPORTED — no
EXTERNAL_VALIDATION_PROVEN — no
ADOPTION_PROVEN — no
PHYSICAL_EXECUTION_PROVEN — no
```

FULL_CAPTURE_QUALIFICATION stays REJECTED, F-01 stays UNRESOLVED,
FRESH_RECAPTURE_REQUIRED stays false; this projection uses only the
human-reviewed limited-profile exception documented in
`kerniq_langchain_f01_limited_profile_review_v0_5_1.md`.

```text
CODE_CHANGED=true (offline profile/projector/tests only)
TEST_CHANGED=true
RUNTIME_CHANGED=false
SCHEMA_CHANGED=false
VALIDATOR_CHANGED=false
DEPENDENCY_CHANGED=none (stdlib-only; no LangChain import anywhere in the projector)
FINAL_STATUS=LANGCHAIN_LIMITED_OFFLINE_PROJECTION_PROOF_COMPLETE
```

Next phase returns to Codex + GPT-5.6 Astra for independent review of the
actual GitHub commit/diff/tests; merge and release decisions are not made
by this task.
