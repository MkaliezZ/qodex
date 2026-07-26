# ADR-020

**Status:** Accepted and frozen for v0.6 foundation
**Date:** 2026-07-24

## Context

KerniQ needs a provider-neutral action lifecycle and a private Python boundary
before Python-backed capabilities can be introduced safely. Existing Patch and
Project Command paths already have reviewed approval, durable receipt, and
native execution boundaries. Re-routing those paths during the foundation
milestone would increase risk and would make the proof claim broader than the
implementation.

DHMS AgentFuse remains the canonical policy implementation in
`MkaliezZ/dhms-engine`. KerniQ must call that Python source at an exact reviewed
commit rather than reproduce its policy in TypeScript or Rust.

## Decision

### Ownership and process boundaries

- TypeScript owns orchestration, versioned action/UI contracts, approval
  binding, the deterministic lifecycle, handler registration, and dispatch.
- Rust owns the app-private runtime root, pinned artifact ingestion, SHA-256
  verification, safe extraction, atomic promotion, direct process spawning,
  bounded stdin/stdout/stderr transport, timeout, and cleanup.
- Python owns the bridge adapter and the canonical DHMS AgentFuse decision
  call. The bridge may translate protocol shapes but contains no replacement
  policy algorithm.
- Registered action handlers own physical side effects and receive no arbitrary
  module, shell, URL, or path selected by model output.
- Session Runtime owns durable Session history. Action Runtime lifecycle hooks
  are awaited before dispatch and adapt into generic `ACTION_*` evidence
  without changing the Session database schema. A standalone
  `ACTION_DECIDED` record must precede generic Action dispatch.

The Python bridge is a child process of the desktop native boundary. It uses
newline-delimited JSON over private stdin/stdout pipes. Stdout is protocol-only;
logs use bounded stderr. No shell is involved.

### Universal Action Runtime

`@qodex/action-runtime` keeps five facts separate:

1. `ActionProposal`, including an exact SHA-256 digest.
2. `ActionApproval`, bound to action, task, proposal digest, generation, and
   expiry.
3. `ActionDecision`, produced by the policy boundary.
4. `ActionStarted`, the unique pre-dispatch execution receipt.
5. `ActionOutcome`, the terminal fact after dispatch.

The deterministic state machine is:

```text
Proposed -> AwaitingApproval -> Approved -> Evaluating
         -> Allowed | Denied | Held | DecisionError
Allowed  -> Starting -> Running
Running  -> Completed | Failed | Cancelled | Interrupted
```

Deny, hold, malformed or duplicate decision, decision error, missing approval,
expired approval, stale approval, unknown action type, duplicate receipt,
cancellation before dispatch, a failed durable decision hook, or a failed
`beforeDispatch` hook invoke no handler. A registered handler is invoked at
most once. Handler failures are outcomes and never rewrite an allow decision as
a deny.

A candidate physical outcome becomes terminal only after its durable settlement
hook succeeds. If that hook fails after dispatch, the runtime exposes
`Interrupted/unknown_or_interrupted` with
`settlement_persistence_failed`; it does not expose ordinary completion or
failure and does not replay the handler.

### Managed runtime root and versioning

The managed root is derived from Tauri's app-data directory:

```text
<app-data>/runtime/python/<runtime-version>/<platform>-<arch>/
```

Each profile separates:

```text
distribution/
environment/
agentfuse-source/
bridge/
manifest/
logs/
locks/
```

The v0.6 profile uses CPython 3.12.13 from Astral's reproducible
`python-build-standalone` release `20260718`. Every supported asset has an exact
HTTPS URL and SHA-256 in trusted application data. The publisher, release,
asset, license, executable layout, and hashes are documented. No moving
`latest` URL is used at runtime.

The canonical AgentFuse source is the GitHub source archive for
`MkaliezZ/dhms-engine` commit
`ec4b5842339dccfba0db62df7541920759203bc9`, package version 3.6.0,
policy version `dhms-agentfuse-runtime-guard@3.6.0`,
verified against its pinned archive and installed-tree SHA-256. The bridge
loads the stdlib-only canonical
`dhms_agentfuse.runtime_guard` and evidence modules from that verified source.
It calls public `RuntimeGuard.evaluate()` and does not install into global or
project site-packages.

### Provisioning and integrity

Provisioning is explicit and user-initiated. Rust acquires an exclusive profile
lock, downloads only manifest-owned URLs with TLS verification, writes into a
temporary sibling directory, verifies hashes before extraction, validates
archive entries and expected executable/source layout, writes the installed
manifest, verifies the completed tree, and atomically renames it into place.

Extraction rejects absolute paths, parent traversal, hardlinks, devices,
escaping or missing symlink targets, and entries escaping the destination.
Relative symlinks that resolve to verified regular files inside the archive
root are materialized as ordinary files, so the promoted runtime contains no
filesystem links. An interrupted temporary installation is removed on the next
explicit provisioning attempt. The active profile is never partially replaced.

Verification recomputes complete distribution, AgentFuse source, and bridge
trees and compares them with digests embedded at compile time. The mutable
installed-runtime record may retain timestamps and observed digests for
diagnostics, but it is not a trust anchor and cannot bless local tampering.

Removal stops any owned bridge process and deletes only the canonical managed
profile under the app-private root. It does not touch system Python, Homebrew,
pyenv, conda, project environments, project files, Session data, or provider
configuration.

### Bridge and trust boundary

Bridge protocol `kerniq.agentfuse.bridge.v1` supports:

```text
hello
hello_ack
health_check
health_result
decision_request
decision_result
shutdown
shutdown_ack
protocol_error
```

Every message carries `protocolVersion`, `messageId`, `messageType`, and
`payload`. Handshake evidence includes Python version, bridge protocol,
AgentFuse package version, exact source commit, supported decision schema, and
PID. Protocol, source revision, schema, message ID, decision value, evidence,
size, timeout, or process mismatches fail closed. The current one-shot
hello/request/shutdown child process has one enforced 15-second bridge-session
deadline; independent startup and request deadlines are not claimed.

The native process receives a minimal environment allowlist for execution,
locale, and temporary paths. Common provider, cloud, GitHub, Slack, Google,
database, and other inherited credential variables are omitted. Absolute
private paths are not returned in normal status, Session evidence, or exports.

### Proof action

The only v0.6 action integration is
`kerniq.proof.increment-counter`. Its handler resolves a disposable counter from
a trusted in-memory sandbox registry; proposal parameters cannot provide a
filesystem path. Registration is development/proof-only and requires a
dedicated flag.

Allow and deny use trusted proof policy fixtures that configure the pinned
canonical Python `RuntimeGuard`; model output cannot choose the policy fixture.
The allow proof dispatches the TypeScript handler exactly once. The deny proof
records a decision with no outcome and invokes the handler zero times.

Patch, Project Command, Git, file-write, shell, MCP, browser, Office, Skill,
Memory, and multi-Agent production paths are not migrated.

### Evidence and restart limits

The awaited hooks are:

```text
beforeApprovalAccepted
beforeDecisionRequest
afterDecisionReceived
beforeDispatch
afterSettlement
afterSettlementPersistenceFailure
```

The durable decision hook and `beforeDispatch` hook are sequential barriers. A
failed barrier blocks the handler. Proposal, approval, independent decision,
execution receipt, outcome, AgentFuse commit, policy version, and schema
version are retained as bounded metadata.
Raw credentials, environment values, unrestricted absolute paths, and private
project contents are excluded and existing Session sanitization remains active.

SQLite evidence and external side effects are not atomic. Cancellation after
dispatch is best effort. A process termination or missing settlement cannot
prove whether an external side effect occurred and must be represented as
unknown or interrupted.

v0.6 does not recover a live bridge request or resume a started action after
restart. The private runtime can be re-verified and a new bridge started. Proof
action evidence is durable through Session hooks, while active action runtime
objects remain process-local.

### Upgrade and uninstall

Runtime upgrades use a new immutable runtime-version directory and the same
verify-then-promote flow. Existing profiles remain untouched until the new
profile verifies. Rollback selects a previously trusted manifest/profile; it
does not mutate it in place. Uninstall removes only a selected verified managed
profile after bridge shutdown.

## Consequences

KerniQ gains a tested Universal Action Runtime foundation and one isolated
canonical Python AgentFuse-backed proof action. It does not gain a general
Python console, arbitrary package installer, arbitrary shell, arbitrary URL
fetcher, or general file-write action.

The private Python distribution adds release size and supply-chain maintenance.
Pinned artifacts must be refreshed deliberately for each runtime version.
Relying on a pinned canonical policy resolver means AgentFuse API changes require
an explicit bridge compatibility review and a new source pin.

No claim is made that all KerniQ actions are protected by AgentFuse, that
cancellation erases side effects, that SQLite and external actions are atomic,
or that the managed runtime is a malware sandbox.

The v0.6 foundation is merged and frozen. v0.6.1 has not started. Patch and
Project Command migration have not started and remain subject to separate
planning and review.
