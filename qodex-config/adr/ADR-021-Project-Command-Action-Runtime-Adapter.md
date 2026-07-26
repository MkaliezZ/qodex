# ADR-021

**Status:** Proposed for v0.6.1; implementation not started
**Date:** 2026-07-26

## Context

KerniQ Project Command already has a reviewed execution path:

- the model supplies only a command ID;
- TypeScript resolves a trusted project catalog entry;
- the Desktop shows the exact command and requires explicit one-time approval;
- durable `COMMAND_STARTED` evidence is committed before dispatch;
- Rust independently resolves the ID and catalog digest again;
- Rust uses a direct no-shell process with project authorization, cleared and
  allowlisted environment, timeout, output bounds, and cancellation; and
- durable settlement or interruption evidence prevents restart replay.

KerniQ v0.6.0 also introduced Universal Action Runtime and the canonical DHMS
AgentFuse decision boundary. That foundation separates a digest-bound proposal,
approval, decision, dispatch receipt, and outcome. Its only integrated action
is a development proof. Project Command is not currently routed through it.

The next implementation must obtain a canonical policy decision before command
dispatch without weakening the existing catalog, approval, native, settlement,
or recovery boundaries and without representing one command as two competing
lifecycles.

## Decision

### Responsibility boundary

KerniQ owns:

- trusted command catalog resolution;
- trusted risk classification;
- required approval strength;
- approval UI and workflow;
- project identity and authorization;
- physical dispatch;
- native process execution, cancellation, timeout, and output bounds;
- physical outcome and recovery.

DHMS owns:

- policy and authorization-boundary evaluation;
- exact action and approval identity validation;
- deterministic allow, deny, hold, or error;
- canonical decision evidence.

Universal Action Runtime owns:

- durable-decision gating;
- dispatch gating;
- duplicate prevention;
- process-local lifecycle coordination.

Session Runtime owns:

- durable command lifecycle evidence;
- interruption and settlement uncertainty;
- approval-generation recovery;
- restart no-replay.

Required constants:

```text
TRUSTED_RISK_OWNER=KERNIQ
MODEL_SUPPLIED_RISK_TRUSTED=false
DHMS_DANGER_CLASSIFIER=false
DHMS_POLICY_BOUNDARY=true
```

Risk cannot be derived from LLM arguments, provider metadata, prompt text,
command output, or DHMS inference. For the initial adapter, every admitted
command maps deterministically to Action risk `process`. A trusted
KerniQ-owned catalog policy may later add finer metadata.

### Target lifecycle

The command remains one command-kind pending action in Session Runtime:

```text
COMMAND_PROPOSED
COMMAND_APPROVED
ACTION_DECIDED
COMMAND_STARTED
COMMAND_COMPLETED
```

`ACTION_DECIDED` is linked to the exact command proposal, approval generation,
proposal digest, policy/schema version, and AgentFuse source commit.

For DHMS deny, hold, or error:

```text
COMMAND_PROPOSED
COMMAND_APPROVED
ACTION_DECIDED
```

The non-allow decision settles the command as blocked with no
`COMMAND_STARTED` and zero native invocations. A direct user denial remains
`COMMAND_DENIED` and does not require a DHMS call.

`COMMAND_STARTED` is the one authoritative physical start receipt.
`COMMAND_COMPLETED` is the ordinary authoritative terminal receipt.
`SESSION_INTERRUPTED` or an unmatched `COMMAND_STARTED` represents unknown
settlement. The adapter must not also emit `ACTION_STARTED` or
`ACTION_COMPLETED` for the same command.

### Typed mapping

The adapter reuses existing `ActionProposal`, `ActionApproval`,
`ActionDecision`, and Action Runtime validation. The proposal uses:

```text
actionType=kerniq.project-command.run
risk=process
parameters.commandId=<trusted catalog ID>
parameters.catalogDigest=<trusted catalog digest>
parameters.commandCategory=<trusted catalog category>
parameters.projectBindingId=<active Session binding>
parameters.projectFingerprint=<private identity digest>
```

The proposal excludes executable strings, arbitrary arguments, environment
values, private absolute roots, caller-selected cwd, raw command text, and
caller-selected timeout.

The existing command approval click maps to one `ActionApproval`. It binds the
exact task, action/tool-call ID, proposal digest, generation, approval time, and
expiry. Recovered unstarted commands require project reauthorization, catalog
rediscovery, a new approval generation, a new proposal digest, and a new DHMS
decision.

### Policy boundary and evidence

The adapter calls the canonical public DHMS `RuntimeGuard.evaluate()` API
through `AgentFuseAdapter.decide`. KerniQ selects a fixed reviewed Project
Command policy profile. Model output cannot select or alter that profile.

The durable decision barrier writes `ACTION_DECIDED` before the command start
barrier. A missing, malformed, stale, duplicate, mismatched, denied, held,
errored, timed-out, or unpersisted decision invokes no native runner.

DHMS allow is not execution. It only permits KerniQ to attempt the separately
guarded command start. Native spawn, timeout, cancellation, exit code, output,
and recovery remain KerniQ facts.

### Native boundary

The existing two-stage catalog resolution is preserved:

```text
TypeScript resolves for proposal and approval.
Rust independently resolves again immediately before execution.
```

The Tauri request remains narrow. Rust accepts no arbitrary executable, args,
environment, cwd, raw command, shell text, or model-selected timeout. It
continues to deny unknown request fields, unknown IDs, unsafe script names,
changed catalog digests, and unauthorized canonical project roots.

The process uses `std::process::Command` directly. No shell, terminal, `sh -c`,
`cmd /C`, PowerShell, or Tauri shell permission is introduced.

The native timeout remains fixed and bounded for the first adapter unless a
separate implementation review approves trusted per-catalog timeout metadata
with a Rust-owned maximum. Any caller-selected timeout is rejected.

### Dispatch and settlement barriers

The Action Runtime registered handler delegates to the existing
`ProjectCommandRunner`. Its lifecycle hooks are adapted as follows:

```text
afterDecisionReceived -> durable command-linked ACTION_DECIDED
beforeDispatch        -> durable COMMAND_STARTED
handler               -> existing ProjectCommandRunner.run
afterSettlement       -> durable COMMAND_COMPLETED
settlement failure    -> SESSION_INTERRUPTED / unknown_or_interrupted
```

Both decision and start appends are awaited. Failure at either barrier invokes
the runner zero times. Duplicate approval or execute calls share one execution
promise and produce at most one physical invocation.

If settlement persistence fails after dispatch, KerniQ records
`Interrupted/unknown_or_interrupted` when possible, does not emit ordinary
completion/failure, stops provider continuation, and does not replay on restart.
SQLite and an external process are not transactionally atomic.

## Required Safety Invariants

```text
unknown command ID -> deny before dispatch
catalog mismatch -> deny before dispatch
project identity mismatch -> deny before dispatch
model-supplied risk -> ignored or rejected
missing/stale approval -> deny before dispatch
proposal digest mismatch -> deny before dispatch
DHMS deny/hold/error -> COMMAND_STARTED absent; native invocations=0
ACTION_DECIDED persistence failure -> native invocations=0
COMMAND_STARTED persistence failure -> native invocations=0
allow decision -> no execution by itself
duplicate dispatch -> native invocations at most 1
settlement persistence failure -> Interrupted/unknown_or_interrupted
restart with unmatched COMMAND_STARTED -> no reapproval; no replay
cancel before dispatch -> native invocations=0
timeout/cancellation race -> no invented success
```

## Consequences

The command path gains canonical DHMS policy evidence before dispatch while
preserving KerniQ's responsibility for risk, approval, native execution, and
physical outcomes. Session history remains coherent because one physical
command has one start receipt and one terminal settlement.

The Session projector must be extended so a pending command can retain a linked
`ACTION_DECIDED` record. This is an event-validation change, not a Session or
SQLite schema migration.

The integration adds a managed-Python availability dependency to approved
Project Command execution. The product must fail closed and explain that no
process started when the trusted runtime or policy decision is unavailable.

The current Project Command policy profile is not yet confirmed. Implementation
cannot begin until its fixed identity and semantics are reviewed with the
canonical DHMS public API.

## Rejected Alternatives

### Let DHMS classify command danger

Rejected. DHMS is a policy and authorization boundary. KerniQ owns deterministic
risk metadata because it owns the trusted command catalog and product approval
semantics.

### Trust risk or policy metadata from the model

Rejected. Model/provider input is untrusted and cannot weaken risk or select
policy.

### Replace the Rust runner with Action Runtime execution

Rejected. Action Runtime coordinates and gates dispatch; Rust retains
independent catalog resolution, project authorization, and physical execution.

### Emit both generic and command start/completion events

Rejected. Two starts and two settlements for one process create competing
recovery histories and ambiguous replay protection.

### Pass the resolved executable and arguments to Rust

Rejected. Rust must independently derive executable, arguments, cwd,
environment, and timeout from its trusted catalog rules.

### Reuse an approval or allow decision after restart

Rejected. Unstarted work requires fresh project verification and approval;
started work is uncertain and cannot be replayed or reapproved.

## Compatibility and Non-Goals

This proposed decision does not:

- start implementation;
- migrate Project Command or Patch;
- change Session or SQLite schema versions;
- change managed Python or AgentFuse identity;
- add arbitrary shell, executable, arguments, environment, cwd, or timeout;
- add automatic approval or Git push;
- add MCP or browser execution;
- change package names/exports, bundle identity, local paths, or provider
  behavior; or
- claim production-wide AgentFuse protection.

The full source audit, threat model, typed-contract proposal, test plan, and
real Tauri proof plan are recorded in
`docs/development/kerniq_project_command_action_runtime_adapter_planning_v0_6_1.md`.
