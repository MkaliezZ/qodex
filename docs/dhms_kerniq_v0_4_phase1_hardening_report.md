# DHMS / KerniQ v0.4 — Phase 1 Governance Hardening Report

```text
REPOSITORY=MkaliezZ/qodex
BRANCH=feat/kerniq-v0.4-cheshire-preview
BASELINE=6735c12e5204798700b21274f64b55906aa4d8d (Phase 1 prototype)
REVIEW_INPUT=docs/dhms_kerniq_v0_4_phase1_codex_review.md (Codex independent review)
```

## Fixed findings

### F-01 CRITICAL — Patch ownership hardening

```text
BEFORE  attach A → attach B → detach A could restore an ungoverned method
        over B's active governance (runtime bypass).

AFTER   Single-owner, generation-controlled patch registry
        (interceptor._PATCH_REGISTRY keyed by agent class):
        - a second active attach on the same class raises
          GovernancePatchError (nested attach refused);
        - every attach records owner_id, generation, original method, and
          original identity (qualname);
        - detach verifies the current registry owner matches the handle;
          a stale or out-of-order handle raises GovernancePatchError and
          NEVER restores anything — active governance survives;
        - detach is idempotent (a retired handle is a no-op when nobody
          else owns the class) and safe;
        - retired entries stay in the registry so generations increment
          monotonically across attach cycles.
```

### F-03 HIGH — Sidecar decision identity binding

```text
BEFORE  responses were not correlated to requests (replay/stale/mismatch
        could steer decisions).

AFTER   Requests carry request_id, tool_call_id, runtime_id, session_id,
        turn_id, protocol_version (=1). The sidecar echoes request_id and
        tool_call_id verbatim; the interceptor verifies both plus the
        response type. Missing, stale, mismatched, or replayed identity →
        block ("identity_mismatch:..."). runtime/session/turn identity is
        attach-scoped (auto-generated unless provided).
```

### F-04 HIGH — Evidence truthfulness

```text
BEFORE  decision-phase evidence predicted dispatch=true and
        executed_arguments=requested_arguments before Tool.execute ran.

AFTER   Lifecycle state machine, one JSON line per event; nothing about
        execution is written before it happens:
          REQUESTED              requested_arguments (observed)
          AUTHORIZED             policy allow + effective_arguments snapshot
          BLOCKED                policy block / fail-closed (dispatch=false)
          DISPATCH_STARTED       original dispatcher invocation began
          EXECUTED               the ONLY state carrying executed_arguments
                                 and tool_result
          FAILED_BEFORE_EXECUTION  dispatcher raised and no such tool was
                                   registered (nothing could have executed)
          FAILED_AFTER_DISPATCH    dispatcher raised after dispatch began
        requested_arguments come from the request; effective_arguments
        from the policy result; executed_arguments only from the real
        execution boundary. Canonical actions stay allow|block (no modify).
```

### F-07 HIGH — Block message correlation

```text
BEFORE  blocked Message carried tool_call_id=None.

AFTER   AdmittedRuntime.blocked_message builds the host-native cheshire
        Message with tool_call_id=<original id>, so the runtime
        continuation correlates the blocked result exactly like a real
        tool result.
```

## Changed files

```text
python/kerniq_cheshire_preview/interceptor.py        ownership registry + identity validation + lifecycle evidence
python/kerniq_cheshire_preview/evidence.py           lifecycle state machine (REQUESTED..FAILED_*)
python/kerniq_cheshire_preview/sidecar_main.py       identity echo + protocol version
python/kerniq_cheshire_preview/admission.py          blocked message tool_call_id correlation
python/kerniq_cheshire_preview/__init__.py           GovernancePatchError export
python/kerniq_cheshire_preview/tests/conftest.py     identity-echoing sidecar double, real-Message FakeTool, registry isolation
python/kerniq_cheshire_preview/tests/test_governed_paths.py      adapted + identity/dispatcher-failure tests
python/kerniq_cheshire_preview/tests/test_patch_ownership.py     NEW: F-01 regressions
python/kerniq_cheshire_preview/tests/test_real_execution_paths.py NEW: real Tool.execute + continuation
docs/dhms_kerniq_v0_4_phase1_hardening_report.md     this report
```

No DHMS repo changes, no private files, no unrelated refactors.

## Test results

```text
35 passed in 9.13s   (audited env: cheshire-cat-ai==2.0.23,
                      dhms-agentfuse==3.7.3, fastmcp==3.4.3,
                      docstring-parser==0.18.0)
```

Breakdown over the prototype's 20 tests (all retained and adapted):

```text
Old coverage (adapted to the new lifecycle/identity semantics): 20
New coverage:
  F-01  nested attach refused; out-of-order detach refused while
        governance stays active; stale handle cannot restore; idempotent
        detach restores the audited method; generation increments;
        ownership records identity                                            6
  F-03  mismatched request_id; mismatched tool_call_id; stale replayed
        response; duplicate response cannot double-dispatch                   4
  F-04  unknown tool → FAILED_BEFORE_EXECUTION; tool raise after dispatch
        → FAILED_AFTER_DISPATCH; allow lifecycle ordering; block lifecycle
        has zero execution claims (folded into adapted tests)                 2
  F-07/real real @tool Tool.execute block (count 0) and allow (count 1);
        real Message continuation through the provider's
        convert_message keeps tool_call_id                                    3
```

## Remaining risks

```text
- The registry is process-local; multi-process hosts attach independently.
- Evidence result-phase write failure after a real execution still cannot
  un-execute the tool (decision-phase failures remain fail-closed).
- The runtime/session/turn identity is attach-scoped, not derived from a
  Cheshire request context (no such field exists on the seam today).
- Patch concurrency is mutex-protected for attach/detach; governed calls
  themselves rely on the single-dispatch-point plus replay ledger.
```

## Unresolved findings (explicitly deferred, unchanged)

```text
F-05, F-06, F-08, F-09 — per review instruction this round only F-01,
F-03, F-04, F-07 were addressed.
```
