# KerniQ v0.6.1 Project Command Result Review and Freeze Preparation

**Date:** 2026-07-29
**Status:** Ready for Draft PR result review; not merged or release-frozen
**Proof base:** `c5e214a43f9102c23f9c0a973782d227606a5c2b`
**Verdict:** `READY_FOR_V0_6_1_6_RESULT_REVIEW`

## Review Basis

The review combines:

- the merged v0.6.1.1 through v0.6.1.5 implementation chain;
- passing post-merge workspace, focused, E2E, Python, Rust, and CI validation;
- an isolated real macOS x86_64 Tauri proof;
- actual Session SQLite event and recovery evidence;
- the actual managed Python bridge and pinned AgentFuse source;
- the actual Rust catalog re-resolution and no-shell runner; and
- a full rerun after correcting the native policy-profile admission defect.

The full proof record is
[`kerniq_project_command_real_tauri_proof_v0_6_1_6.md`](kerniq_project_command_real_tauri_proof_v0_6_1_6.md).

## Evidence-Supported Freeze Candidate

The following boundary is ready for review and may be frozen when this branch
passes CI, receives review, and is merged:

- bounded native Desktop Project Command only;
- trusted TypeScript and Rust catalog command identity;
- KerniQ-owned fixed action, risk, profile, and policy digest;
- explicit one-time user approval;
- exact proposal, approval generation, project, and command binding;
- canonical AgentFuse `RuntimeGuard.evaluate()` before command start;
- durable `ACTION_DECIDED` before durable `COMMAND_STARTED`;
- native catalog re-resolution immediately before physical execution;
- direct no-shell execution with fixed environment, timeout, output, and
  cancellation bounds;
- zero dispatch when decision or start evidence cannot persist;
- honest settlement uncertainty after physical start;
- restart no-replay for started-unsettled work;
- invalidation of an unstarted pre-restart approval and allow;
- at-most-once execution for the controlled product lifecycle; and
- process-local active `runId` coalescing with identity-transfer rejection.

Required bounded product wording:

```text
PROJECT_COMMAND_NATIVE_DESKTOP_PATH_AGENTFUSE_GATED=true
PROJECT_COMMAND_CONTROLLED_LIFECYCLE_AT_MOST_ONCE=true
ARBITRARY_DIRECT_IPC_GLOBAL_EXACTLY_ONCE=false
PROJECT_COMMAND_ALL_ENVIRONMENTS_PROTECTED=false
ALL_KERNIQ_ACTIONS_AGENTFUSE_PROTECTED=false
```

## Result Matrix

| Case | Durable result | AgentFuse requests | Native delta |
|:--|:--|--:|--:|
| Allow | proposed, approved, allow, started, completed | 1 | 1 |
| Human deny | proposed, denied | 0 | 0 |
| Canonical block | canonical block mapped to deny | 1 | 0 |
| `ACTION_DECIDED` fault | decision absent, fail closed | 1 | 0 |
| `COMMAND_STARTED` fault | allow present, start absent | 1 | 0 |
| Settlement fault | start present, completion absent, interrupted | 1 | 1 |
| Settlement restart | interrupted, no replay | 0 automatic | 0 |
| Allowed-unstarted restart | recovery required, old allow cleared | 0 automatic | 0 |
| Concurrent approval | one approve, decision, start, completion | 1 | 1 |
| Active duplicate `runId` | same identity coalesced; transfer blocked | not applicable | 1 |

All proof processes were stopped, orphan count was zero, and final temporary
trigger count was zero.

## Validation

Frozen install, workspace build, and all 1,605 workspace tests passed. Focused
results were Agent Runtime 100, Action Runtime 35, AgentFuse Adapter 25,
Session Runtime 88, and Desktop 139. Desktop Playwright completed with 56
passed and four credential-gated scenarios skipped. The Python bridge completed
with 15 passed and two canonical-source-gated tests skipped; compileall passed.
Rust formatting and check passed, and native tests completed with 35 passed and
two explicit maintenance tests ignored.

Both ordinary and dual-flag proof Tauri debug no-bundle builds passed. The
ordinary JavaScript artifact contained no Project Command real-proof surface;
the proof artifact contained it. `git diff --check` and the committed-artifact
privacy/secret scan passed.

## Corrected Integration Defect

Real Tauri proof found that the native `agentfuse_decide` request validator
accepted only the older trusted proof fixture, while the merged Project Command
path correctly selected the frozen policy profile and digest. This rejected the
real product request before Python and failed closed with zero dispatch.

The bounded correction admits exactly the frozen profile/digest pair as the
alternative to exactly one trusted fixture. Unknown, incomplete, or ambiguous
selection still fails closed. Regression coverage was added and the entire real
proof was rerun. No Python bridge, AgentFuse source, bridge digest, Session
schema, package boundary, or native execution contract changed.

## Explicit Non-Claims

This review does not freeze or claim:

- arbitrary shell safety;
- that every trusted project script is harmless;
- all KerniQ actions being AgentFuse-protected;
- browser Project Command execution;
- Patch protection;
- Git protection;
- MCP protection;
- Office protection;
- provider action protection;
- arbitrary file-write protection;
- permanent global exactly-once behavior for arbitrary direct IPC callers;
- production multi-user authorization;
- descendant-process containment on every supported platform;
- successful Repair under every network interruption;
- a real Windows Project Command proof; or
- transactional atomicity between SQLite and an external process.

```text
PATCH_MIGRATED=false
ARBITRARY_SHELL_ADDED=false
PROJECT_COMMAND_ALL_ENVIRONMENTS_PROTECTED=false
ALL_KERNIQ_ACTIONS_AGENTFUSE_PROTECTED=false
```

## Freeze Procedure

This document prepares, but does not perform, the final freeze. The remaining
administrative gates are:

1. commit the proof harness/correction and documentation separately;
2. push the v0.6.1.6 branch;
3. open the required Draft PR;
4. pass all Draft PR CI jobs;
5. complete human result review; and
6. merge only under a separately authorized release-integration task.

Until those gates complete:

```text
V0_6_1_6_DRAFT_PR_MERGED=false
V0_6_1_PROJECT_COMMAND_RELEASE_FROZEN=false
```

## Recommended Review Verdict

```text
READY_FOR_V0_6_1_6_RESULT_REVIEW
```
