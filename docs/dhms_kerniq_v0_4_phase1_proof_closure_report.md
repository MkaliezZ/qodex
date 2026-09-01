# DHMS / KerniQ v0.4 — Phase 1 Proof Closure Report

```text
REPOSITORY=MkaliezZ/qodex
BRANCH=feat/kerniq-v0.4-cheshire-preview
BASELINE=d2025dc731d741f64588caf6c3992e71b7524e73 (Phase 1 hardening)
REVIEW_INPUT=docs/dhms_kerniq_v0_4_phase1_hardening_codex_review.md
TARGET_RUNTIME=cheshire-cat-ai==2.0.23 (fastmcp==3.4.3)
AGENTFUSE=dhms-agentfuse==3.7.3
```

## Fixed findings

### H-01 (P0) — Class-hierarchy ownership bypass

```text
BEFORE  ownership bound the exact class only: a base-class attach plus a
        subclass attach (either order) could shadow active governance, and
        publication was not atomic.

AFTER   MRO ownership domain: an attach whose class shares a method-
        resolution path with any active attach (base/subclass in either
        direction) is refused with GovernancePatchError. Detach now
        verifies three things before restoring: owner identity, generation
        match, and that the wrapper currently installed on the class is the
        exact object this attach published (foreign/tampered wrappers are
        refused). Registry entry and class wrapper are published atomically
        under one lock with rollback on install failure (a failed setattr
        leaves no active entry).
```

### H-02 (P0) — Concurrent duplicate dispatch

```text
BEFORE  check-id → execute → record raced under concurrency.

AFTER   Atomic reservation lifecycle per tool_call_id under a lock:
        UNKNOWN → RESERVED → DISPATCHING → EXECUTED | FAILED. Only the
        request that wins the UNKNOWN→RESERVED transition may reach
        physical execution; concurrent same-id requests deterministically
        receive a blocked "duplicate_tool_call_replayed" result. Verified
        against the real cheshire Tool.execute with asyncio.gather:
        execution_count == 1.
```

### H-03 (P1) — Full IPC identity binding

```text
BEFORE  only request_id and tool_call_id were verified.

AFTER   All six identity fields are bound end to end — request carries
        request_id, tool_call_id, runtime_id, session_id, turn_id,
        protocol_version; the sidecar echoes all six verbatim; the
        interceptor verifies all six. Missing, mismatched, stale, or
        unsupported-version responses fail closed
        ("identity_mismatch:<field>").
```

### H-04 (P1) — Physical Tool.execute evidence boundary

```text
BEFORE  EXECUTED evidence derived from the Agent.call_tool return, so a
        dispatcher fabricating a result without executing could produce an
        execution claim.

AFTER   An observation boundary inside the dispatch: the interceptor wraps
        the resolved tool instance's bound execute for exactly one dispatch
        (per-agent observation lock; restored immediately after). EXECUTED
        evidence — and executed_arguments — is emitted only when the real
        Tool.execute actually runs; the arguments are taken at the execute
        boundary, not copied from the request. If the dispatcher returns
        without invoking Tool.execute, no EXECUTED evidence is produced and
        the fact is recorded as a failure ("dispatcher returned without
        invoking Tool.execute"). This is an observation wrapper, not a
        second execution path: the original dispatcher still owns execution.
```

### H-05 (P1) — Outcome evidence failure fail-closed

```text
BEFORE  terminal evidence write failure left the runtime silently
        executing further tools.

AFTER   Runtime health state per attach: HEALTHY → EVIDENCE_DEGRADED.
        When terminal outcome evidence (EXECUTED / dispatcher-failure)
        cannot be persisted, the attach degrades and every subsequent
        governed request is blocked ("runtime_evidence_degraded") before
        any decision or dispatch. No silent continuation.
```

## Architecture changes

```text
governed_call_tool pipeline (per request):
  health check (H-05)
    → REQUESTED evidence
    → atomic UNKNOWN→RESERVED reservation (H-02)
    → six-field identity-bound sidecar round trip (H-03)
    → BLOCKED / AUTHORIZED evidence
    → DISPATCHING transition + DISPATCH_STARTED evidence
    → resolve target tool; one-dispatch execute observation wrapper (H-04)
    → original dispatcher executes (its own ownership, unchanged)
    → EXECUTED evidence from the physical boundary — or, if the dispatcher
      never invoked Tool.execute, a recorded failure with no EXECUTED claim
    → any terminal-evidence write failure degrades the runtime (H-05)

attach/detach publication (H-01):
  MRO-overlap check → registry entry + wrapper under one lock → rollback
  on install failure; detach verifies owner + generation + installed
  wrapper object; retired entries persist for generation monotonicity.
```

## Changed files

```text
python/kerniq_cheshire_preview/interceptor.py             all five fixes (rewritten)
python/kerniq_cheshire_preview/sidecar_main.py            six-field identity echo
python/kerniq_cheshire_preview/tests/conftest.py          six-field echoing sidecar double
python/kerniq_cheshire_preview/tests/test_proof_closure.py  NEW: proof-closure regressions
python/kerniq_cheshire_preview/tests/test_governed_paths.py  adapted (identity/lifecycle)
python/kerniq_cheshire_preview/tests/test_patch_ownership.py adapted (retired-entry retention)
docs/dhms_kerniq_v0_4_phase1_proof_closure_report.md      this report
```

No DHMS repo changes, no private files, no unrelated refactors, no product
features, no Phase 2 work.

## Test results

```text
49 passed in 12.72s  (audited environment: cheshire-cat-ai==2.0.23,
                      fastmcp==3.4.3, dhms-agentfuse==3.7.3, pytest)
```

```text
Retained (adapted) hardening tests:      35
New proof-closure tests:                 14
  H-01  base→subclass attach refused; subclass→base refused; wrapper-
        tamper detach refused; failed-install rollback; concurrent
        attach exactly one wins                                 5
  H-02  concurrent same-id fake tool (count 1); concurrent same-id
        real Tool.execute under asyncio.gather (count 1)        2
  H-03  runtime_id / session_id / turn_id / protocol_version
        mismatch → blocked with field-specific reason           4
  H-04  fabricating dispatcher produces no EXECUTED; real execute
        executed_arguments come from the boundary               2
  H-05  outcome evidence failure → EVIDENCE_DEGRADED → second
        call blocked, no second execution                       1
```

## Remaining limitations

```text
- The observation wrapper serializes concurrent dispatches through the
  same tool instance (per-agent observation lock); different tools remain
  concurrent. Bounded-preview tradeoff, documented.
- Runtime/session/turn identity is attach-scoped; the seam carries no
  request-context fields to derive them from today.
- The reservation ledger and health state are per-attach, process-local.
- H-07 (async IPC) and H-08 (runtime identity sealing) intentionally
  untouched per review instruction.
- Once RESERVED, a tool_call_id never re-executes even after FAILED —
  retries must use a fresh id (fail-closed bias, documented).
```

## Updated proof boundary

```text
INTERCEPTION_HARDENED_PROTOTYPE=true

GOVERNED_RUNTIME_PROOF_CANDIDATE=true
  (all five review blockers closed with causal regressions, including the
   real-Tool.execute concurrent exactly-once proof and the physical
   execution evidence boundary; awaiting Codex confirmation)

GOVERNED_RUNTIME_PROVEN — NOT claimed at this stage.
```
