# KerniQ v0.6.0 Result Review and Freeze

**Date:** 2026-07-26
**Status:** Merged and frozen
**Verdict:** `KERNIQ_V0_6_0_MANAGED_ACTION_RUNTIME_FOUNDATION_FROZEN`

## Frozen Merge Chain

The release-integrity merge order was DHMS first, then KerniQ.

| Repository | Pull request | Reviewed head | Merge commit | Merge method |
|:--|:--:|:--|:--|:--|
| `MkaliezZ/dhms-engine` | #3 | `ec4b5842339dccfba0db62df7541920759203bc9` | `e7ca9a0848497906b95047a0fe46640d27b32144` | Merge commit |
| `MkaliezZ/qodex` | #6 | `fc2d24514f6fec4f496438e658b2b070d8318e54` | `3d333a30e4507e796aa97ddc0142606ad2e42587` | Merge commit |

The DHMS base branch `agent-harness-v1` contained the reviewed DHMS head
before KerniQ PR #6 was marked ready and merged. Both reviewed heads are
ancestors of their recorded merge commits. Neither source branch was deleted.

## Frozen Canonical Identity

| Identity | Frozen value |
|:--|:--|
| DHMS package | `dhms-agentfuse 3.6.0` |
| DHMS commit | `ec4b5842339dccfba0db62df7541920759203bc9` |
| Policy | `dhms-agentfuse-runtime-guard@3.6.0` |
| Evidence schema | `agentfuse-evidence-schema-v0.1` |
| Runtime profile | `20260718-cpython-3.12.13-agentfuse-ec4b584` |
| AgentFuse archive SHA-256 | `1659d81d39aab382d550c33c3b6a42b24254f584055eb15d8168f17200e323c3` |
| AgentFuse source tree SHA-256 | `9a51121ec6a719bc7c79db428d522f3c4430d99d5f176b9e62a939bf004d32e9` |
| KerniQ bridge tree SHA-256 | `52bd2dfd5fdd7eb183ed30d4fad56666cd19363fcce381a94ef77b3ac4a4a8dc` |

The exact pinned codeload archive was downloaded again after the DHMS merge.
Its archive hash, package version, public decision API, and extracted source
tree were independently reverified before the KerniQ merge.

## Frozen Runtime Guarantees

The following guarantees are frozen because they are supported by merged code,
automated tests, CI, and the isolated real Tauri smoke:

- malformed allow decisions fail closed;
- the policy decision precedes physical dispatch;
- `ACTION_DECIDED` is independently durable;
- deny causes zero handler invocations;
- allow dispatch is bound to approval and decision identity;
- duplicate dispatch does not repeat physical mutation;
- settlement persistence failure becomes `Interrupted`;
- an unknown physical outcome is not reported as `Completed` or `Failed`;
- interrupted execution is not replayed;
- managed Python uses pinned trusted artifacts;
- installed-tree verification uses embedded trust anchors;
- the mutable installed record is not a trust anchor;
- canonical Python policy is not reimplemented in TypeScript or Rust;
- the bridge uses public `RuntimeGuard.evaluate()`; and
- private AgentFuse API integration references are zero.

## Frozen Scope Boundary

KerniQ v0.6.0 does not prove or claim:

- Patch is AgentFuse-protected;
- Project Command is AgentFuse-protected;
- Git operations are AgentFuse-protected;
- arbitrary shell execution;
- arbitrary Python execution;
- arbitrary file operations;
- MCP integration;
- browser integration;
- Office integration;
- provider integration;
- production-wide execution safety;
- malware sandboxing;
- automatic runtime installation;
- successful Repair under every network condition;
- PyPI distribution; or
- signed binary distribution.

Patch and Project Command retain their existing reviewed execution paths. No
v0.6.1 adapter implementation or migration has started.

## Repair Caveat

Initial user-initiated installation was proven successful.

Tamper detection and fail-closed behavior were proven.

Two later explicit Repair attempts were interrupted by the environment during
the fixed CPython archive download. Neither attempt promoted a partial profile.

Therefore:

- Repair failure safety is frozen.
- Successful post-tamper Repair under that interrupted network condition is not
  frozen.

The fresh post-merge smoke did not require a Repair success. It repeated a new
user-initiated initial installation, proved tamper fail-closed behavior, and
confirmed that no temporary profile was promoted.

## Validation Evidence

### DHMS post-merge

| Validation | Result |
|:--|:--|
| Package identity | `dhms-agentfuse 3.6.0` |
| Public API imports | `RuntimeGuardDecision`, `evaluate`, and `aevaluate` pass |
| `python -m pytest` | 89 passed |
| `python -m compileall -q dhms_agentfuse` | Pass |
| `git diff --check` | Pass |
| Merge-commit CI | Run `30191818461` passed |
| Working tree | Clean |

### KerniQ post-merge

| Validation | Result |
|:--|:--|
| `pnpm install --frozen-lockfile` | Pass |
| `pnpm build` | Pass |
| `pnpm lint` | Pass; no selected package defines a lint script |
| `pnpm test` | 1,486 passed |
| `pnpm --filter @qodex/action-runtime test` | 35 passed |
| `pnpm --filter @qodex/session-runtime test` | 73 passed |
| `pnpm --filter @qodex/python-runtime test` | 15 passed |
| `pnpm --filter @qodex/agentfuse-adapter test` | 15 passed |
| `python -m pytest python/kerniq_agentfuse_bridge/tests` | 8 passed |
| `python -m compileall -q python/kerniq_agentfuse_bridge` | Pass |
| `pnpm --filter @qodex/desktop test` | 56 passed |
| `pnpm --filter @qodex/desktop test:e2e` | 56 passed, 4 credential-gated scenarios skipped |
| Private AgentFuse API audit | 0 integration matches |
| `cargo fmt --check` | Pass |
| `cargo check --locked` | Pass |
| `cargo test --locked` | 35 passed, 2 maintenance tests ignored |
| Ordinary debug Tauri build | Pass |
| Proof-enabled debug Tauri build | Pass |
| `git diff --check` | Pass |
| Merge-commit CI | Run `30192158944`; all five required jobs passed |
| Working tree before freeze docs | Clean |

The proof-enabled build used the existing
`VITE_KERNIQ_ENABLE_AGENTFUSE_PROOF=1` build-time flag.

### Real macOS Tauri smoke

The smoke ran on macOS x86_64 with a completely new isolated HOME and
application-data root. It did not reuse an earlier runtime profile or Session
database.

| Evidence | Result |
|:--|:--|
| Initial runtime state | `NotInstalled` |
| User-initiated Install | Pass |
| Runtime state after verified promotion | `Ready` |
| Python handshake | `3.12.13` |
| AgentFuse package | `3.6.0` |
| AgentFuse commit | `ec4b5842339dccfba0db62df7541920759203bc9` |
| Source archive trust | Verified against pinned SHA-256 |
| Distribution tree | Verified |
| AgentFuse source tree | Verified |
| KerniQ bridge tree | Verified |
| Self-check | Canonical import, allow, deny, and zero deny dispatches pass |
| Allow proof | `Completed`; one invocation; one mutation; zero replay |
| Deny proof | `Denied`; zero invocations; zero mutations; zero replay |
| Settlement fault | `Interrupted/unknown_or_interrupted`; one invocation; one mutation; zero replay |
| Restart | Target settlement session remained `Interrupted`; no reapproval or replay |
| Tamper | `Broken` after mutable record recalculation |
| Bridge/proof after tamper | Blocked; zero handler invocations |
| Temporary failed-download promotion | 0 |
| Orphan KerniQ/bridge/managed-Python processes | 0 |

SQLite retained the exact allow sequence:

```text
SESSION_CREATED
ACTION_PROPOSED
ACTION_APPROVED
ACTION_DECIDED
ACTION_STARTED
ACTION_COMPLETED
```

The deny sequence ended at durable `ACTION_DECIDED` with no start or physical
outcome. The settlement-fault sequence ended at `SESSION_INTERRUPTED` with no
`ACTION_COMPLETED` or `ACTION_FAILED`. `ACTION_DECIDED` metadata retained the
frozen DHMS commit, policy, schema, approval, proposal, and decision identities.

## Freeze Verdict

```text
KERNIQ_V0_6_0_MANAGED_ACTION_RUNTIME_FOUNDATION_FROZEN
```

Status at freeze:

```text
v0.6.0 merged and frozen
v0.6.1 not started
Patch migration not started
Project Command migration not started
```

The recommended next milestone is:

```text
KerniQ v0.6.1 — Project Command Action Runtime Adapter Planning
```

This recommendation is planning only. Implementation has not started.
