# KerniQ Evidence v0.2 — DSH Runtime Projection Proof (MVP)

```text
SPEC=docs/development/kerniq_evidence_schema_v0_2_mvp_spec.md
BOUNDARY=docs/development/kerniq_evidence_runtime_projection_boundary_review.md
PROFILE=dsh-observer-v0.1
SCHEMA_VERSION=kerniq.governance-evidence.v0.2
BRANCH=feat/kerniq-evidence-projection-dsh-v0-1 (from conformance 9e4f809)
```

## What this proves

One pinned runtime profile's read-only native event bundles map to the
frozen Evidence v0.2 contract with observed facts preserved and gaps kept
as unknown — nothing upgraded, invented, or completed. It is an offline
projection proof, not runtime integration and not execution control.

## Real source captures (entry condition 2 of the boundary review)

Two genuine artifacts from the audited governed runs (DSH
deepseek-harness==0.1.2-alpha.1 @ cd5ef814, production observer v0.3.1),
copied verbatim into `fixtures/`:

| Fixture | Origin | Events |
| --- | --- | --- |
| `real_success_read_call.jsonl` | 2026-08-31 real DeepSeek governed run (call_00_C3bK…) | model_request, pre_execute observed, pre_execute decision=allow, dispatch, result isError=false |
| `real_block_read_call.jsonl` | 2026-08-31 real deny run (call_00_0jNn…) | model_request, pre_execute observed, pre_execute decision=deny, result isError=true (denial feedback) |

Both are original captures, not reverse-constructed from v0.2 fixtures;
neither contains credentials. All other fixtures are clearly labeled
`syn_*` synthetic variants used only to verify the mapping never upgrades
facts — none is claimed as a new real runtime run.

## Profile decisions (each traceable to a boundary-review rule)

| Mapping | Rule | Basis |
| --- | --- | --- |
| `model_request` → request known | tool_call_id = native call id; request_id/attempt_ref null; identity unknown | RP-07: the observer records no args, no identity, no request/attempt id |
| `pre_execute decision=allow/deny` → decided/allow, decided/**block** | "deny" is the audited DSH adapter spelling of canonical block (normalized + regression-tested at the adapter boundary in KerniQ v0.3.2) | RP-07 decision row; decision_id/policy_ref/target_ref/decided_at all null (none exist in the format) |
| unmapped decision kind → unknown + diagnostic-grade reason | the frozen mapping table is never widened by payload content | unknown local enums must not become canonical actions |
| `dispatch` line → execution.dispatch known/occurred=true, at=null | the observer records it from a prepended `tools/execute` hook that chains `next()` — entering the hook IS the native execution-chain delegation; profile-pinned after read-only source review of the observer in this repo | RP-07 dispatch row |
| dispatch ≠ start | `execution.start` stays unknown: hook entry is not the tool implementation entry | RP-03 |
| no release receipt exists | `execution.release` always unknown | RP-07: the vocabulary has no release event |
| `result` line → completion known/occurred=true; isError=false → outcome success | success = source-confirmed tool-call return; no side-effect or physical-entry claim | spec OutcomeRecord semantics |
| isError=true + dispatch present → failure | execution chain delegated, then error result | failure keeps time position |
| isError=true + decision=block + **no** dispatch → outcome **not_executed** reason policy_blocked | the AgentFuse gate does not chain `next()` on deny, so no dispatch line is non-delegation evidence; the error-shaped result is the denial feedback terminal (Blocked != Failed) | RP-07/result row + controlled-terminal rule |
| no result line → completion unknown, outcome unknown | never auto success/failure | CASE 2 |
| no args at any stage → requested/effective/executed/scope all unknown, three distinct reasons | nothing copied between stages | RP-04 |
| no approval event → authorization unknown (not absence, not not_applicable) | — | RP-05 |
| `tool_call_approved` (profile-supported, **synthetic-only**; the audited observer does not emit it) → known granted + identity_provenance unknown | approval existence is never human attribution; lineage marks `synthetic_source: true` | RP-05, CASE 4 |
| authorization granted without target → authorization_match unknown | not comparable, never matched | RP-04 match rule |

## Fail-closed behaviors

- Malformed JSON line → diagnostic; the line is dropped, never repaired.
- Unsupported event phase → diagnostic `unsupported_event`; never mapped.
- Event missing its defined source shape → diagnostic; the fact stays
  unrecorded (missing toolCallId reports under `missing_correlation_key`).
- Same call id with conflicting decisions or differing results →
  diagnostic `conflicting_source`; the whole group is withheld, never
  merged last-write-wins.
- Identical duplicate lines are idempotent (one document, not two).
- Every produced document is re-validated by the frozen conformance
  validator inside `project_bundle` before being returned: a projection
  that fails validation is a projector bug, never a published output.
- `recorded_at` is the projection time; no event time is ever fabricated
  (`decided_at`/`at` stay null — the format has no timestamps).

## Test results

```text
python -m pytest python/kerniq_evidence_projection/tests
  → 21 passed   (Python 3.11 and 3.13 both green)
python -m pytest python/kerniq_evidence_conformance/tests
  → 46 passed   (validator unchanged; regression green)
Dependencies: Python stdlib only (json/hashlib/pathlib).
```

Coverage: valid projection (real success + real blocked), determinism,
lineage source-line fidelity, CASE 2 truncated (outcome unknown, never
failure), CASE 3 no-args (three distinct unknown reasons, no stage
copying), CASE 4 approval-without-identity (unknown provenance, no
manufactured allow, match unknown), missing field (source shape + orphan
correlation), unsupported event (+ malformed line), unknown preservation
(completion/release/recorded_at), conflicting source (withheld group +
idempotent duplicate negative control), real/synthetic separation.

## Explicit non-claims

```text
Projection != Execution Control
Projection != Runtime Trust
Projection != Authorization
Projection != Proof of Physical Side Effect
```

The projected documents assert nothing about runtime integrity (no
admission re-issuance), identity attribution, or side effects; the
evidence object is not a bearer capability. Live adapters, framework
integration (LangChain/AutoGen/MCP/Cheshire), SDKs, CI wiring, and any
observer/runtime modification are out of scope and untouched.

```text
FILES_CHANGED=docs/development/kerniq_evidence_runtime_projection_boundary_review.md (verbatim)
             python/kerniq_evidence_projection/** (profile/projector/fixtures/tests)
             docs/development/kerniq_evidence_projection_dsh_v0_1_proof.md
CODE_CHANGED=true (offline projector/tests only)
RUNTIME_CHANGED=false
PROTOCOL_CHANGED=false
DEPENDENCY_CHANGED=none
FINAL_STATUS=RUNTIME_PROJECTION_PROOF_MVP_COMPLETE
```
