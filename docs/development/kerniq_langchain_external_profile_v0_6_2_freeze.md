# KerniQ LangChain External Profile Freeze v0.6.2

## 1. Decision and Authority

**GO_TO_MINIMAL_VALIDATOR_IMPLEMENTATION.** Freeze ONE public-source-backed, OBSERVED profile: `langchain-create-agent-tool-run-jsonl-v0.1`, version `0.1.0`. The intended entry point is **bring your existing compatible archive**. Missing external samples, a general capture path, and a measured ten-minute experience are not blockers to implementing this deliberately narrow validator.

This document authorizes the next stage's minimal implementation, not implementation during this task. It does not authorize outreach, merge, release, runtime changes, or new governance semantics. Profile freeze is a normative design decision; it is not a claim that the CLI exists or has passed implementation tests.

This decision advances the candidate state of [v0.6.1 qualification](kerniq_langchain_public_spec_source_qualification_v0_6_1.md), rather than editing its historical `PROFILE_FROZEN=false` and implementation-not-authorized conclusions. It preserves the existing [v0.6 pilot design](kerniq_external_validation_pilot_v0_6_design.md), [Evidence v0.2 MVP](kerniq_evidence_schema_v0_2_mvp_spec.md), [projection boundary](kerniq_evidence_runtime_projection_boundary_review.md), and [v0.5.2 freeze](kerniq_evidence_projection_v0_5_2_freeze.md). The public-contract-first route does not mark external sample gates complete.

## 2. Verified Repository Baseline

Review date: 2026-09-09. An explicit fetch of main and the qualification branch confirmed:

| Item | Verified value |
| --- | --- |
| origin/main | `1c1e23720faa48133d177917ef2911316444b433` |
| Qualification HEAD and remote branch | `c47822cdbd0626f0c463313188372eb5df22eec6` |
| Working branch | `docs/kerniq-langchain-public-spec-qualification-v0-6-1` |
| Starting worktree | Clean |
| Main drift from supplied baseline | None |

Only this freeze document is added by this task. The eventual PR contains two documents because qualification is not yet on main. Neither runtime integrity v0.3.3.3 nor the immutable engineering capture is changed.

## 3. Independent Pinned-Source Verification

These are exact reviewed releases, not a rolling compatibility promise. No SDK was installed, no external runtime was executed, and no new capture was generated. Official pinned source was freshly retrieved read-only; the qualification document was not treated as sufficient evidence by itself.

| Package | Frozen version | Exact Git source |
| --- | --- | --- |
| langchain | 1.4.0 | [factory.py, 79cab2d](https://github.com/langchain-ai/langchain/blob/79cab2dc7f58be720cac43db3677b4c1fd971f91/libs/langchain_v1/langchain/agents/factory.py) |
| langchain-core | 1.6.2 | [event_stream.py, 8215039](https://github.com/langchain-ai/langchain/blob/8215039dea978372bd3fd95b88663a11b0159043/libs/core/langchain_core/tracers/event_stream.py) |
| langgraph | 1.2.11 | [Pregel, 644815f](https://github.com/langchain-ai/langgraph/blob/644815f9e5bc52ad8f7a5227a456227e9c3e639b/libs/langgraph/langgraph/pregel/main.py) |
| langgraph-prebuilt | 1.1.0 | [ToolNode, 3614e88](https://github.com/langchain-ai/langgraph/blob/3614e88c58af63f597764218646e85c49952b2da/libs/prebuilt/langgraph/prebuilt/tool_node.py) |

The producer must supply version/configuration provenance, including Python, serializer auxiliary dependencies, and exporter identity/version. The initial environment envelope retains qualification's CPython 3.11.15 / Pydantic 2.13.5 restriction; other environments require qualification, not best-effort acceptance. Version declarations are provenance claims, not authenticated runtime identity or dependency closure proof.

### Ten freeze checks

| Check | Independently confirmed fact | Source locator |
| --- | --- | --- |
| 1. run_id | Identifies a Runnable invocation; child invocations have their own IDs | [schema.py](https://github.com/langchain-ai/langchain/blob/8215039dea978372bd3fd95b88663a11b0159043/libs/core/langchain_core/runnables/schema.py), L124-128 |
| 2. parent_ids | v2 ordered containment chain, root to immediate parent; empty for root | schema.py L150-160; event_stream.py L146-163 |
| 3. tool start | Emitted data contains `input: inputs or {}` | event_stream.py L654-694 |
| 4. tool end | Emitted data contains output and cached input, with the invocation run_id | event_stream.py L730-748 |
| 5. tool error | Error object, input, and nullable tool_call_id are emitted; object is not necessarily JSON-safe | event_stream.py L697-727 |
| 6. terminal call ID | ToolMessage declares tool_call_id and success/error status | [messages/tool.py](https://github.com/langchain-ai/langchain/blob/8215039dea978372bd3fd95b88663a11b0159043/libs/core/langchain_core/messages/tool.py), L67-82 |
| 7. missing start call ID | start saves the ID internally but does not emit it in its event payload | event_stream.py L670-691 |
| 8. tool-run correlation | end/error recover the start information by run_id; emitted parent chain preserves containment | event_stream.py L643-651, L710-745 |
| 9. model-to-start gap | Neither run_id nor containment supplies the missing model-call identity edge; no universal model-request correlation follows | Checks 1, 2 and 7; factory ToolNode wiring; ToolNode L1099-1105 |
| 10. serializer fallback | dumps invokes recursive serialization; unsupported objects become `lc=1`, `type=not_implemented`, id and repr | [dump.py](https://github.com/langchain-ai/langchain/blob/8215039dea978372bd3fd95b88663a11b0159043/libs/core/langchain_core/load/dump.py) L70-102; [_validation.py](https://github.com/langchain-ai/langchain/blob/8215039dea978372bd3fd95b88663a11b0159043/libs/core/langchain_core/load/_validation.py) L69-102; [serializable.py](https://github.com/langchain-ai/langchain/blob/8215039dea978372bd3fd95b88663a11b0159043/libs/core/langchain_core/load/serializable.py) L380-406 |

Additional bounded checks: factory imports the prebuilt ToolNode; pinned ToolNode invokes `tool.ainvoke` after argument injection and may synthesize error returns. Pregel's v2 path delegates to Core (L3743-3780); v3 is separate. Core rewrites the first emitted event input with the root invocation input (L1065-1089), so filtered tool-only captures are inadmissible. Closing the consumer can cancel the runtime task (L1092-1101); missing terminals must not become successful completions.

The initial source-inspection command used an overly specific `async def astream_events` search and stopped at Pregel, whose method is `def astream_events` returning an async iterator/awaitable. Reading the actual definition resolved this inspection mismatch; it was not a product failure. All ten checks above were completed. No pinned-source contradiction with qualification was found.

## 4. Frozen Source Profile

MUST, MUST NOT and MAY below apply to this profile, not to LangChain generally.

| Property | Frozen rule |
| --- | --- |
| profile_id | `langchain-create-agent-tool-run-jsonl-v0.1` |
| profile_version | `0.1.0` |
| source_representation | `lc-dumps-jsonl-v1` |
| Native source | Existing unfiltered `astream_events(version="v2")` archive from ordinary `create_agent` |
| Serializer | `langchain_core.load.dump.dumps` from Core 1.6.2; default single-line representation, no custom replacement serializer |
| Encoding | UTF-8 JSONL, LF-delimited, one event object per line, final LF required; no BOM, blank records, multiline objects or repaired records |
| Invocation scope | One root invocation and one ordinary tool run with one structured successful ToolMessage terminal |
| Capture provenance | Existing exporter identity/version, exact runtime/dependency versions, invocation/configuration, filter settings, capture scope and termination/degradation information |
| Filter policy | No include/exclude event filters; preserve original event order and all original lines |
| Supported data | String-key JSON objects/arrays, null, booleans, strings, finite numbers; required terminal has the explicit constructor form below |
| Out of scope | Raw/custom LangGraph, nested/subagents, MCP, provider-hosted tools, replay/resume, tool middleware retries/short circuits, injected tool arguments, custom BaseTool lifecycle overrides, Command-returning tools |

Source metadata must establish the claimed profile configuration. Missing information remains unknown and prevents matching; event shapes alone cannot prove the absence of a hidden wrapper or modification. Self-reported provenance and byte digests do not authenticate a hostile producer. This is source qualification, not runtime admission.

No fixed tool name, argument value, result value, run ID, event count, historical line number, team source hash, or model provider is an admission constant. The old Core 1.6.1 engineering capture remains a regression reference, not a Core 1.6.2 external source. The qualification's relevant-file comparison supports contract continuity, not retroactive version relabeling or an installed-runtime compatibility test.

## 5. Required Structures and Correlation

### Envelope and root

Every event used for matching has string `event`, nonempty string `name` and `run_id`, an ordered array of nonempty string `parent_ids`, and object `data`. Optional tags/metadata are provenance only. The first event MUST be the sole root `on_chain_start`, with empty parents and `data.input` present. The matching root `on_chain_end` MUST be present after the tool terminal, with the same root ID/name and empty parents; no second root invocation is allowed. Root input/output content is not projected into tool facts.

Every child envelope MUST belong to that root. Parent chains cannot contain the event's own run_id or duplicate ancestors. Envelope conflicts, a missing root endpoint, an explicit failed/cancelled/incomplete capture, or a terminal outside the root span prevent successful profile acceptance. EOF or a collector's `ok` flag cannot substitute for a native endpoint. These checks detect observable inconsistencies, not every malicious deletion.

### Tool start

Exactly one `on_tool_start` is required. Its run_id is distinct from the root, its nonempty parent chain begins at that root, and `data.input` is a fully structured JSON object in the supported subset. It is a **runtime tool-request observation**, not physical entry and not necessarily the model's original arguments. Tool display name does not establish executable identity.

### Successful terminal

Exactly one corresponding `on_tool_end` is required. `data.input` is present as the cached public input and must be consistent with the start snapshot; equality is only a conflict check, never an executed-arguments proof. `data.output` MUST have:

- `lc` equal to integer 1, `type` equal to `constructor`.
- `id` equal to `["langchain", "schema", "messages", "ToolMessage"]`.
- Object `kwargs`, with `type="tool"`, nonempty string `tool_call_id`, explicit `status="success"`, and name equal to the tool event name.
- `content` as a string or supported JSON list; any artifact and additional payload values must remain structured within the supported subset. Unknown executable constructors, secret placeholders, unsupported objects and ambiguous escaped data in required records are not accepted.

The reader MUST inspect serialized structure without instantiating Python objects or calling LangChain deserializers. Missing explicit status is not repaired from the class default. Raw text, a list of messages, Command, status=error, or an error event is not this success profile.

### Correlation rules

The key is the tuple **(exact source digest, root_run_id, tool_run_id)**. Start precedes terminal, start/end run_id and complete ordered parent_ids agree, and names agree as a consistency check. Pairing by timestamps, neighboring lines, parameter equality, tool name, or guessed IDs is forbidden.

Reject duplicate starts or terminals, even byte-identical ones; conflicting results, extra tool runs, multiple roots, cross-root events, and ID/ancestry conflicts cannot be collapsed into one success. Extra tool error records also disqualify this success-only source. Multiple event observations are not retry ordinals; a unique pair does not prove exactly-once physical execution.

The returned native ToolMessage call ID MAY populate request.tool_call_id retrospectively. It does not make that ID available at start. A unique matching structured model terminal can support a separately reviewed retrospective ID bridge, as in the earlier proof, but this profile does not consume it to claim model intent. **Level A tool-run lifecycle correlation is proven at the source-contract level; universal Level B model-request-to-tool-run correlation remains false.**

## 6. Evidence v0.2 Mapping Freeze

The existing [MVP spec](kerniq_evidence_schema_v0_2_mvp_spec.md) and [validator](../../python/kerniq_evidence_conformance/validator.py) allow nullable request identifiers, snapshot references, unknown observations and independent execution stages. Inspection confirms no schema fields, enum values or validator semantics need changing.

| Evidence field | Classification | Frozen mapping |
| --- | --- | --- |
| request | Derived from reviewed semantics | Known runtime invocation request with source lineage to start/root/terminal; request_id=null; attempt_ref is a namespaced reference to the native root/tool invocation, not a fabricated model request or physical attempt |
| request.tool_call_id | Source-confirmed | Exact native ID in the matched typed terminal; lineage explicitly records its terminal origin |
| request.action_name | Source-confirmed | Tool display name; action_ref=null because no executable identity is established |
| request.runtime_ref | Derived | Reference to declared source runtime provenance, not an integrity attestation |
| request.identity_provenance | Unknown | source=unknown with reason; subject and identity proof references null; tags/metadata cannot elevate trust |
| decision | Unknown | No policy decision receipt; success is not allow, error is not block |
| authorization | Unknown | No approval or authorization source; tool/run IDs do not become authorization references |
| argument_binding.requested | Source-confirmed | Snapshot reference to start.data.input, under RUNTIME_TOOL_REQUEST_OBSERVATION; digest=null is permitted; tool_ref/scope_ref remain null absent evidence |
| argument_binding.effective / executed | Unknown | No policy-final or physical-entry snapshot; equal start/end inputs do not fill these |
| argument_binding.scope / authorization_match | Unknown | Containment is not authority scope or a validated authorization match |
| execution.release / dispatch / start | Unknown | No reviewed receipts for those stages; on_tool_start is before validation/body |
| execution.completion | Derived from reviewed semantics | Known, occurred=true, at=null, from the unique matching typed success terminal; runtime settlement only |
| outcome | Source-confirmed | status=success with result_ref to the original typed terminal; source-reported successful return, not external business success or side effect |

All known/derived records need exact source references. Derivation rules belong in lineage/diagnostics, not newly invented Evidence enums. Namespaced references must encode original identity components unambiguously, with the exact source digest, and resolve locally without executing anything. Missing native execution timestamps remain null; capture receipt times cannot fill them.

This table defines the success mapping only. A rejected source yields diagnostics, not a fabricated successful Evidence document. In accepted output, unknown observations retain null values and reasons; neither false nor not_applicable substitutes for missing evidence.

## 7. Refusal and F-01 Rules

The following stable diagnostic categories are profile-level outcomes, not new governance decisions or changes to Evidence Schema:

| Condition | Required handling |
| --- | --- |
| Missing version/exporter/filter/configuration provenance | `MISSING_PROVENANCE`; no profile acceptance; missing facts unknown |
| Non-pinned producer/environment/serializer or different stream/export format | `UNSUPPORTED_PROFILE`; no best-effort parsing or automatic pin upgrades |
| Invalid UTF-8/Unicode, duplicate JSON keys, nonfinite numbers, malformed JSONL or invalid envelope | `INVALID_SOURCE`; do not repair or skip malformed lines |
| Missing endpoint, truncated line, cancellation/error/incomplete capture | `INCOMPLETE_SOURCE`; no success Evidence; do not infer failed, blocked, cancelled tool, or not executed |
| Duplicate/conflicting identity, ancestry, start or terminal | `CORRELATION_CONFLICT`; refuse rather than choose last/nearest result |
| Extra tool runs, excluded runtime path, error terminal, raw/list/Command terminal | `UNSUPPORTED_SCOPE`; do not select a convenient successful sub-run |
| Required source contains unsupported/escaped/unknown constructor semantics | `UNSUPPORTED_SERIALIZATION`; no required-field reconstruction |
| Digest mismatch or unsafe local reference | `SOURCE_BINDING_FAILURE`; no verified artifact claim |
| Nonessential opaque Command carrier satisfying the exception below | `OPAQUE_SOURCE_EXCLUDED`; retain raw bytes, report location, use none of that event for known Evidence |

All applicable diagnostics must be surfaced deterministically with file/line/field location; any refusal category prevents profile acceptance. Multiple diagnostics cannot cancel each other out. Diagnostic wording and CLI exit-number allocation are implementation details; these conditions and their acceptance effects are frozen.

**F-01 is avoided by dependency exclusion, not fixed.** Full-capture qualification remains REJECTED and the original silent-fallback issue remains UNRESOLVED. The existing bundle, manifest, hashes, session status and diagnostics are immutable.

Only nonessential model/chain payload carriers with the structural LC `not_implemented` Command marker may use the exclusion. Recognition uses marker/type identity, never repr text or a hardcoded line/count. The entire carrier event is excluded from known Evidence mapping and reported by its actual location. Identity envelopes may be inspected to reject contradictory scope, but opaque content supplies no fact. Root start/end and required tool start/end cannot use this exception. Unknown fallback kinds or ambiguity in essential structure require refusal, not a broader exclusion list invented during implementation.

No repr parsing, evaluation, object restoration, Command routing inference or silent line deletion is permitted. A valid JSON document and a collector's exit_status=ok do not demonstrate lossless serialization. The allowed classification is a limited structured subset with explicit exclusions, never full lossless capture.

## 8. Source Digest and Reference Freeze

The raw-source digest representation is **`utf8-jsonl-exact-v1`**: SHA-256 over all original UTF-8 JSONL bytes, including delimiters and final LF. Store algorithm `sha256`, representation, lowercase 64-hex value and exact byte length in source provenance. Compute separately for each submitted archive; never compare against a team regression hash to determine qualification.

No normalization, reserialization, redaction, event removal, key sorting, newline conversion or F-01 exclusion changes those bytes. Source references identify this digest, one-based raw line and JSON Pointer into that line. The pointer references original serialized fields; it does not authorize deserialization or URL execution. Derived facts identify every required source reference and the applied rule.

Runtime/exporter/configuration provenance files are each bound by exact-byte SHA-256, byte length and normalized relative path in a local source inventory. Duplicate paths, absolute paths, traversal, or symlink resolution outside the selected source root are refused; do not fetch remote references. The inventory must bind all files consumed for qualification, not only the raw stream. Read-only verification must check the same bytes actually consumed; it must not use a stale digest for a later file read.

This is source binding, not a new governance protocol. Hash consistency proves byte identity only, not an external owner, authentic producer, honest capture, or physical execution. Artifact serialization/canonicalization and identifier encoding must be specified and tested during the minimal implementation proof, without changing these source-byte rules or Evidence v0.2 semantics. No new argument digest scheme is needed: snapshot_ref plus digest=null remains valid.

## 9. Acquisition, Claims and Product Boundaries

```text
SOURCE_ACQUISITION_MODE=EXISTING_ARCHIVE_ONLY
SOURCE_ACQUISITION_PATH_PROVEN_FOR_EXTERNAL_USER=false
GENERAL_LANGCHAIN_ZERO_CHANGE_CAPTURE_PROVEN=false
CAPTURE_PATH_REVIEW_REQUIRED_BEFORE_GENERAL_LANGCHAIN_PILOT=true
```

SDK-free applies to eligible owners already holding compatible archives: no KerniQ import, runtime fork, business-code change or capture helper is needed to read that input offline. It is not a proof that arbitrary LangChain applications already export this format. Missing archives and acquisition UX are product limitations, not reasons to redesign this profile.

The strongest allowed claim after a future successful validation is: **a declared compatible source contains a correlated runtime tool-request observation and a structured source-reported successful return, mapped into Evidence v0.2 with explicit unknowns and source binding**. Schema PASS alone does not establish trustworthy provenance.

Forbidden claims include GOVERNED capability, authorization/approval, pre-dispatch governance, release, physical dispatch/entry/side effects, executed arguments, runtime trust, exactly-once physical execution, model intent provenance, general LangChain support, zero-change capture for all users, official support, external validation or adoption.

Preserve: Decision != Outcome; Authorized != Executed; Blocked != Failed; Unknown != False; Approval existence != Approval attribution; Authenticated != Authorized; Projection != Execution Control; Projection != Runtime Trust.

## 10. Minimal Implementation Readiness and Next Stage

All readiness gates are satisfied at the protocol-design level: fixed profile semantics, Level A correlation, deterministic refusal conditions, exact-byte source binding, and bounded F-01 exclusions. Evidence v0.2 can represent the mapping without changing schema, existing validator semantics, runtime, or governance protocol. No architecture blocker was identified.

**MINIMAL_VALIDATOR_IMPLEMENTATION_AUTHORIZED=true applies to the next stage only.** Its maximum scope is:

1. One local CLI and ONE frozen profile.
2. Read-only JSONL loader and strict profile matcher.
3. Strict lifecycle correlation and existing Evidence v0.2 mapping.
4. Unknown/refused preservation and explicit exclusion diagnostics.
5. Local result artifact writer and artifact verifier with bound source references.
6. Deterministic positive/negative tests and concise pilot README stating existing compatible archive required.

Do not implement capture helpers, LangSmith integration, automatic capture, generic LangChain support, multiple profiles, an error profile, Command support, nested agents, middleware retries, MCP, GUI, cloud upload, accounts or telemetry. Do not mutate old projectors or source pins to disguise a new profile as the historical internal proof.

Implementation proof must cover valid success, dynamic IDs/values, unknown fields, duplicate/conflicting events, missing/unsupported provenance, malformed/truncated input, required vs nonessential opaque material, and source/artifact binding failures. This is future test scope, not tests created or executed in this task. Unexpected need to change schema/validator semantics/runtime/governance or guess correlation must stop implementation for review.

The next sequence is frozen: **Profile Freeze -> Minimal Validator Implementation -> Internal 10-minute Test -> Separately Authorized External Pilot Outreach**. Do not insert another design-only milestone for already accepted product limitations. Timing is not measured and is not an implementation prerequisite; setup/download must be included when measured.

Outreach remains unauthorized until a working validator and the internal usability test are reviewed separately. External validation still requires an external owner, external operator, externally owned real source, external run, machine-verifiable artifact and artifact verification. Public specs, this freeze, an internal fixture and a future CLI implementation do not satisfy those conditions. PraisonAI remains a later candidate, with no outreach authorized here.

## 11. Validation and Delivery Boundary

This task performed repository/remote preflight, pinned official-source inspection and read-only Evidence spec/validator compatibility review. Document checks cover local references, required machine conclusions, file scope and `git diff --check`. Product, runtime and projection tests are not run: no code or test behavior changed, and implementation proof is explicitly deferred.

Deliver one documentation commit on the existing qualification branch, push it, and create the authorized docs-only PR to main. Verify that the PR changes only the qualification and freeze documents. Do not merge, tag, release, contact users, create fixtures, run a model, or start implementation.

## 12. Machine Decision

```text
BASE_MAIN_HEAD=1c1e23720faa48133d177917ef2911316444b433
QUALIFICATION_COMMIT=c47822cdbd0626f0c463313188372eb5df22eec6
PROFILE_ID=langchain-create-agent-tool-run-jsonl-v0.1
PROFILE_VERSION=0.1.0
PROFILE_FROZEN=true
PUBLIC_SOURCE_CONTRACT_QUALIFIED=true
CAPABILITY_CLASSIFICATION=OBSERVED
REQUEST_SEMANTICS=RUNTIME_TOOL_REQUEST_OBSERVATION
TOOL_RUN_LIFECYCLE_CORRELATION_PROVEN=true
MODEL_REQUEST_TO_TOOL_RUN_CORRELATION_PROVEN=false
SOURCE_ACQUISITION_MODE=EXISTING_ARCHIVE_ONLY
SOURCE_ACQUISITION_PATH_PROVEN_FOR_EXTERNAL_USER=false
GENERAL_LANGCHAIN_ZERO_CHANGE_CAPTURE_PROVEN=false
CAPTURE_PATH_REVIEW_REQUIRED_BEFORE_GENERAL_LANGCHAIN_PILOT=true
PROFILE_SEMANTICS_COMPLETE=true
CORRELATION_RULES_COMPLETE=true
REFUSAL_RULES_COMPLETE=true
SOURCE_DIGEST_RULE_COMPLETE=true
F01_BOUNDARY_COMPLETE=true
FULL_CAPTURE_QUALIFICATION=REJECTED
F01_FULL_CAPTURE_STATUS=UNRESOLVED
NEW_SCHEMA_REQUIRED=false
NEW_RUNTIME_REQUIRED=false
NEW_GOVERNANCE_PROTOCOL_REQUIRED=false
ARCHITECTURE_CHANGE_REQUIRED=false
TARGET_TIME_TO_FIRST_RESULT_MET=false
TARGET_TIME_MEASUREMENT_STATUS=NOT_MEASURED
MINIMAL_VALIDATOR_IMPLEMENTATION_READY=true
MINIMAL_VALIDATOR_IMPLEMENTATION_AUTHORIZED=true
PILOT_OUTREACH_AUTHORIZED=false
EXTERNAL_VALIDATION_PROVEN=false
ADOPTION_PROVEN=false
IMPLEMENTATION_STARTED=false
CODE_CHANGED=false
TEST_CHANGED=false
DEPENDENCY_CHANGED=false
FINAL_RECOMMENDATION=GO_TO_MINIMAL_VALIDATOR_IMPLEMENTATION
FINAL_STATUS=LANGCHAIN_EXTERNAL_PROFILE_V0_6_2_FROZEN_READY_FOR_MINIMAL_VALIDATOR_IMPLEMENTATION
```
