# KerniQ Evidence Schema v0.2 — Offline Conformance Proof (MVP)

```text
SPEC=docs/development/kerniq_evidence_schema_v0_2_mvp_spec.md
SPEC_STATUS=MVP_SPEC_FROZEN_FOR_CONFORMANCE
SCHEMA_VERSION=kerniq.governance-evidence.v0.2
BASELINE_BRANCH=feat/kerniq-evidence-schema-v0-2-conformance (from b743a572, v0.3.3.3)
```

## What this proves

The frozen schema can **express** the key governance lifecycle facts
truthfully. This is an offline, read-only, fixture-driven proof with a
fail-closed structural validator. It is not a runtime, not a writer, and it
claims no execution-control capability.

Spec internal consistency was verified before implementation: both
documented example digests recompute exactly
(`sha256('{"limit":10}')=ca502dec…`, `sha256('{"limit":5}')=a03c8657…`),
so `SCHEMA_ISSUE_FOUND=false` and the spec's §4 example is adopted
byte-for-byte as the CASE 2 fixture.

## Validator properties

- Strict JSON loading: duplicate object keys are invalid input (not an
  auto-repairable unknown).
- Fail closed: first violated MUST raises `EvidenceSchemaError`; no field
  completion, no trimming, no defaults, no guessing unknown; a passing
  document is returned byte-identical (asserted in tests).
- Unknown/extra fields raise `UnsupportedFieldError` — never silently
  assigned governance semantics.
- Observation discipline: `known` requires value + source_ref and forbids
  reason; `unknown` forbids value and requires reason (source_ref may point
  at an incomplete source or be null); `not_applicable` requires both, and
  is rejected wherever the spec's per-field status table forbids it.
- Digest discipline: algorithm must be exactly `sha256`, value 64 lowercase
  hex, non-empty representation; foreign algorithms are rejected, not
  renamed.
- Time discipline: `YYYY-MM-DDTHH:mm:ss[.fraction]Z` and a real calendar
  date; `occurred=false` must keep `at=null`.
- String discipline: every non-null string must be non-empty and not
  whitespace-only.
- Collection discipline: same `(producer_ref, evidence_id)` with identical
  content reads idempotently; the same id with different content is a
  conflict.

## Case matrix

| Case | Fixture | Proves |
| --- | --- | --- |
| 1 | `case1_success.json` | full success lifecycle (allow → granted → release → dispatch → start → completion → success) is expressible; fractional timestamps valid |
| 2 | `case2_approval_then_policy_block.json` (the spec's §4 example verbatim) | policy block preserves the historical granted approval; release/dispatch/start = evidenced false; completion=true with dispatch=false is a legal controlled non-execution terminal; outcome not_executed |
| 3 | `case3_argument_variation.json` | requested (limit=10) / effective (limit=5) digests differ and both validate; executed stays `unknown` with a reason — never auto-equal to effective; mismatched authorization target recorded without rewriting the old approval target |
| 4 | `case4_identity_unknown.json` | granted authorization + `identity_provenance.source=unknown` is a valid record (authorization existence != human attribution); trusted identity without subject/provenance refs is rejected |
| 5 | `case5_unknown_semantics.json` | `execution.start=unknown` stays unknown (never converted to occurred=false); `known` outcome with `value.status=unknown` is valid; `evaluation=error` keeps `action=null`; not_applicable misused on request is rejected |
| 6 | in-test mutations of valid fixtures | missing required field (envelope + record), wrong enum (action/outcome status), digest not-64-lowercase-hex (uppercase + wrong length), foreign digest algorithm, `known` missing value, `unknown` carrying value, `known` missing source_ref, `known` with reason, occurred=false with `at`, failure outcome without reason, action with evaluation=error, approved_at with refused, wrong schema_version, whitespace-only string, impossible calendar date, request without any correlation id, scope without scope_ref, unsupported top-level field, duplicate JSON object key, duplicate evidence-id content conflict (with idempotent + cross-namespace negative controls) |

## Test results

```text
46 passed   (Python 3.11 preview venv and Python 3.13 both green;
             dependencies: Python stdlib only — json/datetime/re/hashlib not
             even needed beyond json/datetime/re)
```

## Boundaries (inherited from the spec)

- Fixtures are synthetic; no runtime, producer, reader/writer, SDK,
  service, or storage was created.
- The validator verifies structural conformance only; it cannot detect a
  producer that erases history into `not_applicable` with a fabricated
  source-backed reason — history preservation is a producer/profile duty
  (documented explicitly in the CASE 2 boundary test).
- References are opaque; no resolution, network access, or replay.
- No CI wiring was added (remote CI quota deferred); the suite runs offline
  via `python -m pytest python/kerniq_evidence_conformance/tests`.

```text
FILES_CHANGED=docs/development/kerniq_evidence_schema_v0_2_mvp_spec.md (verbatim)
             python/kerniq_evidence_conformance/** (validator+fixtures+tests)
             docs/development/kerniq_evidence_schema_v0_2_conformance_proof.md
CODE_CHANGED=true (offline validator/test code only)
RUNTIME_CHANGED=false
PROTOCOL_CHANGED=false
DEPENDENCY_CHANGED=none (stdlib only)
FINAL_STATUS=EVIDENCE_CONFORMANCE_PROOF_MVP_COMPLETE
```
