# ADR-021

**Status:** Accepted plan; v0.6.1.1 through v0.6.1.5 merged; v0.6.1.6 real proof ready for Draft PR review
**Date:** 2026-07-26
**Updated:** 2026-07-29

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

KerniQ Action Runtime owns:

- trusted command catalog resolution;
- trusted risk classification;
- required approval strength;
- approval UI and workflow;
- `ActionProposal` and `ActionApproval` validation;
- proposal digest, approval expiry, and generation validation;
- action, task, project, and session identity validation;
- project identity and authorization;

The KerniQ bridge owns:

- request protocol and identity validation;
- mapping validated trusted context into `ToolCallRequest`;
- mapping trusted policy configuration and `safe_metadata`.

AgentFuse core owns:

- configured static or custom `ToolCallRequest` policy evaluation;
- canonical `allow|block` evidence;
- fail-closed policy exceptions and malformed policy results.

The KerniQ adapter owns:

- response identity validation;
- source commit, schema, policy revision, and protocol validation;
- `allow -> allow`, `block -> deny`, and bridge/validation failure -> `error`
  mapping;
- duplicate decision-response detection.

Universal Action Runtime owns:

- durable-decision gating;
- dispatch gating;
- duplicate prevention;
- process-local lifecycle coordination.

The KerniQ Rust runner owns:

- physical process execution;
- native catalog re-resolution and project authorization;
- cancellation, timeout, environment, and output bounds.

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
AGENTFUSE_CORE_INPUT=ToolCallRequest
AGENTFUSE_CORE_DECISIONS=allow|block
AGENTFUSE_CORE_APPROVAL_CONTRACT=false
AGENTFUSE_CORE_HOLD_DECISION=false
KERNIQ_MAPPED_DECISIONS=allow|deny|error
AGENTFUSE_HOLD_SUPPORTED=false
```

Risk cannot be derived from LLM arguments, provider metadata, prompt text,
command output, or DHMS inference. For the initial adapter, every admitted
command maps deterministically to Action risk `process`. A trusted
KerniQ-owned catalog policy may later add finer metadata.

### v0.6.1.1 implementation boundary

The merged v0.6.1.1 slice implements only the immutable KerniQ-owned policy
metadata and pure future action-parameter contract. Every trusted discovered
command receives the same source-defined policy. Unknown or malformed entries
receive no guessed policy. The model schema remains limited to `commandId`.

The existing TypeScript/Rust catalog digest is unchanged. Policy metadata has a
separate deterministic representation; a future `ActionProposal` digest will
bind command identity and policy metadata without weakening native
re-resolution.

No Action Runtime or AgentFuse call, `ACTION_DECIDED` persistence, dispatch
change, approval UI change, Session schema change, native-runner change, Rust
catalog change, or command migration is included. Project Command is not yet
AgentFuse-protected.

### v0.6.1.2 implementation boundary

The merged v0.6.1.2 slice adds a pure Desktop integration mapper because Desktop
already depends on both Agent Runtime and Action Runtime. Agent Runtime does
not gain an Action Runtime dependency. The mapper reuses
`createActionProposal()` and `validateActionApproval()` without creating or
mutating Action Runtime state.

The proposal binds exact provider tool-call, task, Session, trusted command,
native catalog digest, project binding, project fingerprint, fixed action type,
fixed risk, policy profile, deterministic policy digest, and trusted timestamp
identity. The approval binds the exact action, task, and proposal digest.
Session generation `n` maps explicitly to Action generation `n + 1`, and the
existing validator enforces identity, positive generation, and expiry.

This slice does not call AgentFuse, persist `ACTION_DECIDED`, write Session
events, invoke the native runner or Tauri, change dispatch or
`COMMAND_STARTED`, alter the Session schema, or migrate Project Command.
PR #10 merged through `c201e32ec1dcb342e9b1fbbeace6315cb422bc99`.

### v0.6.1.3 implementation boundary

The merged v0.6.1.3 slice fixes the application-owned policy profile at
`kerniq-project-command-v1` and binds it to policy digest
`sha256:9c01df377b0cfd8db8392dc8966a2f12b38ad1b2ab9c89780ac049ac0eed38ad`.
The bridge validates the bounded Project Command proposal and approval,
constructs `ToolCallRequest` with safe identity metadata, and calls only public
`RuntimeGuard.evaluate()`. AgentFuse `allow|block` maps to KerniQ
`allow|deny`; invalid or unavailable canonical evidence maps to `error`.
The embedded bridge installed-tree integrity digest is updated to
`34e0633e303a0e2b5107832d42486503f7c1f55a0e717001d176345ecfbe9ef3`;
the managed Python runtime version, AgentFuse package/commit, protocol, and
evidence schema remain unchanged.

A Desktop decision coordinator validates the proposal and approval, obtains and
validates one decision, then durably records command-linked `ACTION_DECIDED`.
Session Runtime additively binds that decision to the pending command's action,
task, approval ID/generation, and proposal digest. No Session schema or SQLite
migration is required.

This slice did not call `ActionRuntime.execute`, write `COMMAND_STARTED` or
`COMMAND_COMPLETED`, invoke Tauri or the native runner, or physically execute a
command. Physical execution was intentionally left to v0.6.1.4.

### v0.6.1.4 implementation boundary

The merged v0.6.1.4 slice connects only the bounded native Desktop Project Command
flow. It creates the trusted proposal and expiring approval from live runtime
identity, durably records `COMMAND_APPROVED`, calls the merged decision
coordinator, and accepts only the exact current persisted allow at the start
barrier. `COMMAND_STARTED` must persist before the existing runner is invoked.

Policy deny/error, approval expiry, cancellation before start, stale pending
identity, and approval/decision/start persistence failures invoke no native
runner. Human denial remains a separate `COMMAND_DENIED` event and makes no
AgentFuse request. Recovery revalidates the project and command catalog,
reconstructs the same proposal digest, and requires fresh approval and policy
decision.

The native request and Rust implementation are unchanged. No generic
`ACTION_STARTED` or `ACTION_COMPLETED` is added. This implementation does not
protect Patch, Git, MCP, browser, file-write, arbitrary-shell, or non-Desktop
Project Command paths.

### v0.6.1.5 implementation boundary

The merged v0.6.1.5 slice adds deterministic fault and recovery evidence around the
merged command path. It covers proposal, approval, decision, start, execution,
and settlement boundaries; cancellation races; duplicate submissions; restart
positions; project and catalog drift; timeout/output fixtures; cache release;
and bounded model-visible failures.

An unstarted allow from before restart is explicitly removed as dispatch
authority before fresh reapproval. Started work remains unknown or interrupted
until matching settlement evidence exists and is never automatically replayed.
The native Rust runner, managed Python bridge, Session schema version, package
manifests, workflow, and lockfile remain unchanged.

This slice did not claim a real Tauri smoke or frozen status.

### v0.6.1.6 proof and correction boundary

The v0.6.1.6 review branch adds a dual-gated proof surface that uses the actual
Tauri process, SQLite Session store, managed Python bridge, pinned canonical
AgentFuse source, `RuntimeGuard.evaluate()`, Tauri IPC, Rust catalog
re-resolution, and direct no-shell process.

The real proof exposed one bounded native admission defect: Rust still accepted
only the older trusted proof fixture while the merged Project Command request
correctly supplied the frozen profile and digest. The correction accepts
exactly one trusted fixture or exactly the fixed
`kerniq-project-command-v1` profile/digest pair, and rejects unknown,
incomplete, or ambiguous selection. It does not change the Python bridge,
AgentFuse identity, Session schema, catalog, or physical runner.

The rerun proves allow, human deny, canonical block, decision/start
zero-dispatch barriers, settlement interruption, restart no-replay,
allowed-unstarted authority invalidation, controlled duplicate approval, and
active-run identity coalescing. Final freeze remains pending Draft PR CI,
review, and merge.

### Target lifecycle

The command remains one command-kind pending action in Session Runtime:

```text
COMMAND_PROPOSED
COMMAND_APPROVED
KerniQ validates approval/digest/expiry/generation
KerniQ bridge maps trusted request to ToolCallRequest
AgentFuse RuntimeGuard.evaluate()
AgentFuse allow/block
KerniQ maps to allow/deny or fail-closed error
ACTION_DECIDED
COMMAND_STARTED
COMMAND_COMPLETED
```

`ACTION_DECIDED` is linked to the exact command proposal, approval generation,
proposal digest, policy/schema version, and AgentFuse source commit.

For mapped deny or error:

```text
COMMAND_PROPOSED
COMMAND_APPROVED
ACTION_DECIDED
```

The non-allow decision settles the command as blocked with no
`COMMAND_STARTED` and zero native invocations. A direct user denial remains
`COMMAND_DENIED` and does not require an AgentFuse call.

The generic `ActionDecision` contract retains `hold`, but the canonical
AgentFuse 3.6.0 Project Command path does not emit it. A hold-producing provider
or extended policy vocabulary requires a separately reviewed design outside
v0.6.1.

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

The existing command approval click maps to one `ActionApproval`. Action Runtime
validates it and binds the
exact task, action/tool-call ID, proposal digest, generation, approval time, and
expiry. Recovered unstarted commands require project reauthorization, catalog
rediscovery, a new approval generation, a new proposal digest, and a new DHMS
decision.

### Policy boundary and evidence

The KerniQ bridge validates request identity and maps the validated proposal,
approval, and trusted policy context into `ToolCallRequest`. It calls the
canonical public AgentFuse `RuntimeGuard.evaluate()` API through
`AgentFuseAdapter.decide`. KerniQ selects a fixed reviewed Project Command
policy profile. Model output cannot select or alter that profile. AgentFuse
evaluates configured policy and returns only canonical `allow|block` evidence.
The KerniQ adapter validates the response and maps allow to allow, block to
deny, and bridge or validation failure to error.

The durable decision barrier writes `ACTION_DECIDED` before the command start
barrier. A missing, malformed, stale, duplicate, mismatched, denied, errored,
timed-out, unsupported, or unpersisted decision invokes no native runner.

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
AgentFuse block -> KerniQ deny; COMMAND_STARTED absent; native invocations=0
bridge/validation failure -> KerniQ error; native invocations=0
AgentFuse hold -> unsupported; native invocations=0
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

The command path gains canonical AgentFuse allow/block evidence before dispatch while
preserving KerniQ's responsibility for risk, approval, native execution, and
physical outcomes. Session history remains coherent because one physical
command has one start receipt and one terminal settlement.

The Session projector must be extended so a pending command can retain a linked
`ACTION_DECIDED` record. This is an event-validation change, not a Session or
SQLite schema migration.

The integration adds a managed-Python availability dependency to approved
Project Command execution. The product must fail closed and explain that no
process started when the trusted runtime or policy decision is unavailable.

The Project Command policy profile is fixed at
`kerniq-project-command-v1`. It uses exact action/risk/profile/digest identity,
trusted catalog categories, bounded command and project identities, valid
catalog/project SHA-256 values, and approval identity metadata. The model,
provider, project metadata, prompt, and command output cannot select or alter
the profile.

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

The v0.6.1.4 implementation remains bounded and does not:

- migrate Patch or actions beyond native Desktop Project Command;
- add `ACTION_STARTED` or `ACTION_COMPLETED`;
- change Session or SQLite schema versions;
- change managed Python or AgentFuse identity;
- add arbitrary shell, executable, arguments, environment, cwd, or timeout;
- add automatic approval or Git push;
- add MCP or browser execution;
- change package names, bundle identity, local paths, or provider behavior;
- remove or incompatibly change existing exports; or
- claim production-wide AgentFuse protection.

The full source audit, threat model, typed-contract proposal, test plan, and
real Tauri proof plan are recorded in
`docs/development/kerniq_project_command_action_runtime_adapter_planning_v0_6_1.md`.
