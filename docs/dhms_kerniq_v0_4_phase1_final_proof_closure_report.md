# DHMS / KerniQ v0.4 — Phase 1 Final Proof Closure Report

```text
REPOSITORY=MkaliezZ/qodex
BRANCH=feat/kerniq-v0.4-cheshire-preview
BASELINE=dadaf2f9f53f2570314037b127afea4dc6765a94 (proof closure)
REVIEW_INPUT=docs/dhms_kerniq_v0_4_phase1_final_proof_review.md (Codex)
TARGET_RUNTIME=cheshire-cat-ai==2.0.23 (fastmcp==3.4.3)
AGENTFUSE=dhms-agentfuse==3.7.3
```

## Fixed counterexamples

### F-01 — Active wrapper replacement bypass (P0)

```text
BEFORE  attaching foreign `Agent.call_tool` while the registry was active
        left governance bypassed: the governed wrapper never ran, so its
        internal integrity check never fired, and physical execution
        proceeded ungoverned.

AFTER   Defense in depth at two independent boundaries:
        1. Wrapper check — the governed call_tool re-verifies at every
           dispatch that the class's resolved call_tool is exactly the
           wrapper this attach published; mismatch → blocked result +
           runtime degraded.
        2. Tool.execute guard (the decisive one) — attach installs a
           class-level guarded execute on the audited Tool alongside the
           call_tool wrapper. The guard requires a per-dispatch
           authorization token (contextvar) that only the governed
           observed-execute wrapper sets. A foreign Agent.call_tool calling
           Tool.execute directly carries no token → RuntimeError before
           any physical execution + runtime degraded. Detach restores the
           audited execute exactly.
```

### F-02 — Approved tool redirected to another physical tool (P0)

```text
BEFORE  admission accepted any signature-compatible call_tool override; an
        override could receive approval for tool A but execute tool B.

AFTER   Admission profile tightened: governed dispatch is admitted only
        when the target class's method-resolution path to the audited base
        Agent contains NO call_tool override of its own (the attach's own
        governed wrapper is exempt). A redirecting subclass is refused at
        admission with "dispatch profile mismatch" — nothing is patched,
        no evidence is written, no governed dispatch can occur.
```

### F-03 — Instance-level Tool.execute override producing false EXECUTED (P1)

```text
BEFORE  a pre-existing instance execute override was wrapped by the
        observation and its synthetic returns counted as EXECUTED.

AFTER   The observation binds only to the audited Tool.execute boundary:
        before dispatch, the interceptor checks (a) no instance-level
        execute entry exists and (b) the resolved class execute is the
        audited implementation or this attach's own guard. Any instance
        override, foreign wrapper, or ambiguous identity → blocked result
        with execute_profile_mismatch, count stays 0, no EXECUTED evidence.
        Restore is exact: the instance dict entry the interceptor itself
        installed is removed; anything else left behind degrades the
        runtime rather than fabricating a clean state.
```

### F-04 — Async-unsafe observation ownership (P1)

```text
BEFORE  a threading.RLock across await points allowed two async tasks to
        interleave install/restore on the same tool instance.

AFTER   Per-tool asyncio.Lock: observation install → physical execute →
        exact restore is serialized per tool instance across concurrent
        tasks; different tool instances stay concurrent. Cancellation and
        exceptions restore through finally, and the failure path records
        terminal evidence (BaseException) so the ledger never rests in
        DISPATCHING without a terminal fact and never fabricates EXECUTED.
```

## Architecture changes (execution / evidence identity rules)

```text
admission
  cheshire-cat-ai==2.0.23 + symbols + awaitability
  call_tool signature compatible
  execute signature compatible (audited shape or this preview's guard shape)
  NEW dispatch profile: no call_tool override on the resolution path
  NEW exposed audited_call_tool / audited_execute identities

attach (single lock, atomic publication, rollback)
  call_tool wrapper  → integrity check per dispatch (F-01.1)
  Tool.execute guard → token-gated physical boundary (F-01.2/F-03)
  observation        → per-tool asyncio.Lock, exact restore (F-04)

governed dispatch pipeline
  health check → REQUESTED → atomic reservation → six-field identity
  decision → BLOCKED / AUTHORIZED → execute profile check (F-03) →
  DISPATCH_STARTED → token-gated observed execute → EXECUTED (boundary
  arguments) / FAILED_* → any terminal-evidence failure degrades (H-05)
```

## Changed files

```text
python/kerniq_cheshire_preview/admission.py                dispatch profile + guard-shape signature + identities
python/kerniq_cheshire_preview/interceptor.py              execute guard + token + F-03 checks + asyncio locks + BaseException
python/kerniq_cheshire_preview/tests/conftest.py            real-Tool fixtures, ambient context, pristine teardown
python/kerniq_cheshire_preview/tests/test_governed_paths.py adapted
python/kerniq_cheshire_preview/tests/test_patch_ownership.py adapted
python/kerniq_cheshire_preview/tests/test_proof_closure.py  adapted (3 tests to new boundary semantics)
python/kerniq_cheshire_preview/tests/test_real_execution_paths.py adapted
python/kerniq_cheshire_preview/tests/test_sidecar_and_real.py adapted
python/kerniq_cheshire_preview/tests/test_final_counterexamples.py NEW
docs/dhms_kerniq_v0_4_phase1_final_proof_closure_report.md  this report
```

## Test results

```text
54 passed in 15.69s  (audited env: cheshire-cat-ai==2.0.23,
                      fastmcp==3.4.3, dhms-agentfuse==3.7.3)
```

```text
Retained (adapted) tests:                                    46
New final counterexample regressions:                         6
  F-01  foreign wrapper replaces call_tool, invokes tool:
        execute guard raises before physical execution,
        count 0, runtime degraded                              1
  F-02  redirecting dispatcher subclass refused at admission;
        no evidence file even created                          1
  F-03  pre-existing instance execute override: blocked with
        execute_profile_mismatch, count 0, no EXECUTED         1
  F-04  same real Tool instance, two call_ids under gather:
        both execute once each, exact restore, per-request
        boundary attribution, health stays HEALTHY             2
  (plus the adapted lying-dispatcher test now asserting the
   stronger admission refusal)
```

## Exact supported proof claim

```text
GOVERNED_RUNTIME_PROVEN is claimed ONLY for:

  runtime     cheshire-cat-ai==2.0.23, single process,
              audited base Agent.call_tool dispatch path,
              audited Tool.execute physical boundary
  governance  attach-scoped, single-owner, MRO-overlap-checked,
              wrapper + execute-guard integrity enforced per dispatch
  decisions   local sidecar subprocess, dhms-agentfuse==3.7.3
              semantics, six-field identity-bound IPC
  evidence    per-request lifecycle (REQUESTED → AUTHORIZED/BLOCKED
              → DISPATCH_STARTED → EXECUTED/FAILED_*), executed facts
              only from the physical boundary, evidence failure
              degrades the runtime

NOT claimed: universal Cheshire Cat governance, production governance,
cross-process exactly-once, hostile-admin resistance, protection against
runtime tampering that occurs between integrity checks, multi-runtime
support.
```

## Remaining limitations (unchanged scope)

```text
PATCH_CONTENT_TOCTOU / RUNTIME_FILESYSTEM_TOCTOU remain P2 documented.
H-07 (async IPC) and H-08 (runtime identity sealing) untouched.
The dispatch token is contextvar-scoped: a hostile actor inside the same
async context during a governed dispatch window is out of the bounded
threat model. Observation serializes same-instance concurrency.
```

## Status

```text
INTERCEPTION_HARDENED_PROTOTYPE=true
GOVERNED_RUNTIME_PROOF_CANDIDATE=true
GOVERNED_RUNTIME_PROVEN=true   (bounded preview boundary above)
```
