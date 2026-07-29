# KerniQ v0.6.1 Project Command Action Runtime Adapter Planning

**Date:** 2026-07-26
**Updated:** 2026-07-29
**Status:** v0.6.1.6 implementation, real proof, and final freeze seal merged;
Project Command scope frozen
**Source baseline:** `c7a0b0adf7a0dab4729a2db1a77a58d8c2366beb`
**v0.6.1.1 implementation baseline:** `7be4a7d69699eeac7498be1d75e17c7c1dc599ad`
**v0.6.1.1 merge:** `be32ca0caa764aa86e3de341557fedbc2acba0a5`
**v0.6.1.2 implementation baseline:** `be32ca0caa764aa86e3de341557fedbc2acba0a5`
**v0.6.1.2 merge:** `c201e32ec1dcb342e9b1fbbeace6315cb422bc99`
**v0.6.1.3 implementation baseline:** `c201e32ec1dcb342e9b1fbbeace6315cb422bc99`
**v0.6.1.3 merge:** `ca005397b88534ba3663f1f19b0b539de0f94766`
**v0.6.1.4 implementation baseline:** `ca005397b88534ba3663f1f19b0b539de0f94766`
**v0.6.1.4 merge:** `a36503f198c016daa1f6c1c8f2af1d894c0e95ef`
**v0.6.1.5 implementation baseline:** `a36503f198c016daa1f6c1c8f2af1d894c0e95ef`
**v0.6.1.5 merge:** `c5e214a43f9102c23f9c0a973782d227606a5c2b`
**v0.6.1.6 proof baseline:** `c5e214a43f9102c23f9c0a973782d227606a5c2b`
**v0.6.1.6 real proof execution code head:** `1ec336c4d5aaa1f0ba902117532bf2b610be1a4a`
**v0.6.1.6 reviewed head:** `1d600e7eb4493c7f7e41b7f6fea22ba907c94d4e`
**v0.6.1.6 merge:** `4eb7c24c493b0fc135a750f07ed46cbb86ddd461`
**v0.6.1.6 post-merge CI:** `30389964085`

## Executive Summary

KerniQ already has two separately reviewed foundations:

1. Project Command resolves a model-supplied command ID through a trusted
   TypeScript catalog, pauses for explicit approval, commits
   `COMMAND_STARTED`, and invokes a Rust no-shell runner that independently
   resolves the same catalog ID.
2. Universal Action Runtime validates a proposal and digest-bound expiring
   approval. The KerniQ bridge validates request identity and maps trusted
   context into `ToolCallRequest`; AgentFuse returns canonical `allow|block`
   evidence; the KerniQ adapter maps it to `allow|deny|error`. Action Runtime
   persists `ACTION_DECIDED` and blocks physical dispatch when any decision or
   pre-dispatch evidence barrier fails.

v0.6.1 should connect those foundations without replacing the reviewed native
command path or creating a second execution history. KerniQ remains the trusted
risk classifier and physical execution owner. DHMS remains a policy and
authorization boundary, not a danger classifier. Universal Action Runtime
coordinates decision and dispatch gating. Session Runtime remains the durable
lifecycle and restart-recovery source of truth.

The proposed lifecycle is:

```text
model requests run_project_command
    -> trusted TypeScript catalog resolution
    -> trusted KerniQ risk classification
    -> durable COMMAND_PROPOSED
    -> explicit command approval
    -> KerniQ validates approval/digest/expiry/generation
    -> KerniQ bridge maps trusted request to ToolCallRequest
    -> AgentFuse RuntimeGuard.evaluate()
    -> AgentFuse allow/block
    -> KerniQ maps to allow/deny or fail-closed error
    -> durable ACTION_DECIDED linked to the command
    -> durable COMMAND_STARTED only for valid allow
    -> existing Rust catalog re-resolution and no-shell execution
    -> COMMAND_COMPLETED
       or SESSION_INTERRUPTED / unknown_or_interrupted
```

`COMMAND_STARTED` and `COMMAND_COMPLETED` remain the only authoritative start
and terminal receipts for the physical command. v0.6.1 must not add
`ACTION_STARTED` or `ACTION_COMPLETED` for the same execution.

Required boundary constants:

```text
TRUSTED_RISK_OWNER=KERNIQ
MODEL_SUPPLIED_RISK_TRUSTED=false
DHMS_DANGER_CLASSIFIER=false
DHMS_POLICY_BOUNDARY=true
AGENTFUSE_CORE_INPUT=ToolCallRequest
AGENTFUSE_CORE_DECISIONS=allow|block
AGENTFUSE_CORE_APPROVAL_CONTRACT=false
AGENTFUSE_CORE_HOLD_DECISION=false
KERNIQ_VALIDATES_ACTION_APPROVAL=true
KERNIQ_BRIDGE_VALIDATES_REQUEST_IDENTITY=true
KERNIQ_ADAPTER_VALIDATES_RESPONSE_IDENTITY=true
KERNIQ_MAPPED_DECISIONS=allow|deny|error
AGENTFUSE_HOLD_SUPPORTED=false
```

## Current Command-Path Audit

### Current flow

1. `AGENT_TOOLS` exposes `list_project_commands` and
   `run_project_command`; the model can provide only `commandId`.
2. `AgentToolRegistry.discoverCommands()` derives package and Cargo commands
   from project metadata. It admits only `test`, `check`, `lint`, `typecheck`,
   and `build` script-name families and computes a catalog digest.
3. `AgentLoopRuntime.processQueuedCalls()` calls
   `AgentToolRegistry.resolveCommand()`. An unknown ID or unavailable native
   runner becomes a structured tool result; a valid command becomes
   `pendingCommand` and status `WaitingForCommandApproval`.
4. `AgentSessionLedgerRecorder.recordTask()` records
   `COMMAND_PROPOSED`. `AgentTimeline` renders the resolved executable,
   arguments, relative working directory, category, source, and explicit
   Approve/Deny controls.
5. `AgentLoopRuntime.approveCommand()` generates approval and execution
   receipt IDs. Its `beforeCommandStart()` hook durably appends
   `COMMAND_APPROVED` and `COMMAND_STARTED` before calling the runner.
6. `createTauriProjectCommandRunner().run()` sends only run ID, project root,
   command ID, and catalog digest to the Tauri command.
7. Rust `run_project_command()` canonicalizes and checks the root against the
   session-authorized root set, then `resolve_command()` rereads project
   metadata and verifies the digest. `execute_command()` uses
   `std::process::Command` directly with no shell, cleared environment,
   allowlisted environment keys, null stdin, 120-second timeout, cancellation,
   and separate 64 KiB stdout/stderr bounds.
8. `AgentSessionLedgerRecorder.afterCommandComplete()` durably records
   `COMMAND_COMPLETED`. Failure to persist settlement records
   `SESSION_INTERRUPTED` when possible and raises
   `SettlementPersistenceError`; provider continuation stops.
9. `SessionRecoveryService` finds unmatched `COMMAND_STARTED` evidence before
   trusting terminal status and marks the session `Interrupted` without replay.
   A command that never started requires project reauthorization, catalog
   rediscovery, comparison, and a fresh approval generation.

### Audited components

| Component | File and symbol | Input | Output / current owner | Trust boundary | Durable evidence | Failure behavior | Planned v0.6.1 change |
|:--|:--|:--|:--|:--|:--|:--|:--|
| Tool declarations | `packages/agent-runtime/src/agent-loop/tools.ts` - `AGENT_TOOLS` | Provider tool call | Exact empty-object list request or one `commandId` run request; Agent Runtime | Provider/model to KerniQ | `TOOL_REQUESTED` through the desktop recorder | Extra/malformed fields are rejected | No model-supplied risk, args, env, cwd, executable, or policy fixture |
| Command discovery | Same file - `AgentToolRegistry.listProjectCommands()` and `discoverCommands()` | Indexed `package.json` or `Cargo.toml` | `ProjectCommandDefinition[]`; KerniQ | Project metadata to trusted catalog | Catalog fields are included in `COMMAND_PROPOSED` | Malformed metadata yields no unsafe guess | Add deterministic KerniQ-owned risk/approval metadata to the trusted definition |
| Command resolution | Same file - `AgentToolRegistry.resolveCommand()` | Exact tool call | Trusted definition or structured error; KerniQ | Model ID to trusted catalog | Proposal only after successful resolution | Unknown ID and browser command request fail before approval | Produce the adapter input only from the resolved catalog entry |
| Agent pause | `packages/agent-runtime/src/agent-loop/runtime.ts` - `processQueuedCalls()` | Queued provider calls | `PendingCommandApproval`, `WaitingForCommandApproval`; Agent Runtime | Provider stream to approval state | `COMMAND_PROPOSED`, state evidence | Invalid command returns a tool error; no pending action | Build one immutable command proposal identity before approval |
| Approval execution | Same file - `approveCommand()` | Task ID and live pending command | Runs exactly one approved command; Agent Runtime | UI approval to dispatch barrier | Current `COMMAND_APPROVED` and `COMMAND_STARTED` | Stale, duplicate, cancelled, or expired actions do not dispatch | Map the same user approval to `ActionApproval`, evaluate DHMS, then cross the existing command start barrier only on durable allow |
| Denial | Same file - `denyCommand()` | Task ID and live pending command | Structured denied result; Agent Runtime | UI denial boundary | `COMMAND_DENIED` | No runner invocation | Remain a KerniQ user denial; do not call DHMS or create start evidence |
| Duplicate/cancel | Same file - `claimApproval()`, `activeApprovalActions`, `activeCommandRuns`, `cancel()` | Repeated approval or stop | Coalesced approval and best-effort native cancellation | UI concurrency to process lifecycle | Command settlement or interruption | At most one runner call; provider does not resume after cancel | Preserve one execution promise/receipt and route Action Runtime cancellation to the same command cancellation owner |
| Approval UI | `apps/desktop/src/components/AgentTimeline.tsx` - `AgentTimeline` | `pendingCommand` | Exact command preview and one-time Approve/Deny; Desktop | Human decision boundary | UI itself is not durable | Controls absent outside waiting state | Add trusted risk and policy-boundary explanation without weakening explicit approval |
| Desktop orchestration | `apps/desktop/src/hooks/useRuntime.ts` - `sendPrompt()`, `approveCommand()`, `denyCommand()` | Prompt, opened project, click | Constructs Agent Loop and recorder; Desktop | React/UI to runtime | Session created before loop; recorder flushed around decisions | Missing binding blocks Agent Mode; invalid UI state is inert | Construct a per-task command adapter using the existing Session Runtime, managed bridge, catalog, binding, and runner |
| Project identity | `apps/desktop/src/platform/projectBinding.ts` - `projectBindingIdentity()` | Opened project source and private root | Private binding ID/fingerprint; Desktop/Session | Selected local root to durable identity | Session stores binding ID; private root is separate | Recovery rejects nonmatching binding | Bind proposal to the active project binding/fingerprint; never expose the private root to DHMS |
| Session lifecycle adapter | `apps/desktop/src/session/agentSessionRecorder.ts` - `AgentSessionLedgerRecorder` | Agent task/lifecycle callbacks | Command ledger entries; Desktop adapter | In-memory Agent state to durable Session Runtime | `COMMAND_PROPOSED`, `COMMAND_APPROVED`, `COMMAND_STARTED`, `COMMAND_COMPLETED`, interruption | Pre-dispatch append failure blocks runner; settlement failure becomes uncertain | Persist linked `ACTION_DECIDED` between command approval and `COMMAND_STARTED`; keep command receipts authoritative |
| Durable append | `packages/session-runtime/src/recorder.ts` - `SessionRecorder.recordDurably()` | Typed append input | Awaited deduplicated append; Session Runtime | Runtime to ledger store | Exact event and `recordKey` | Rejection surfaces to caller | Add a command-linked decision record key and await it before command start |
| SQLite persistence | `apps/desktop/src-tauri/src/session_database.rs` - `SessionDatabase.append_entry()` | Entry plus projected Session mutation | One immediate SQLite transaction; Rust store | Session Runtime bridge to local database | Entry and active-leaf mutation commit together | Transaction failure returns without a partial ledger append | Reuse the existing transaction and schema; add no database migration |
| Ledger projection | `packages/session-runtime/src/projector.ts` - `SessionProjector.project()` | Active event path | Deterministic `ProjectedSessionState`; Session Runtime | Stored evidence to UI/recovery truth | Validates action/approval/start/settlement identities | Impossible order, duplicate, or mismatch throws | Allow `ACTION_DECIDED` to bind to a pending command without turning it into a second generic action lifecycle |
| Restart recovery | `packages/session-runtime/src/recovery.ts` - `SessionRecoveryService.recover()` and `findUnmatchedStartedAction()` | Session and active path | RecoveryRequired or Interrupted; Session Runtime | Previous process evidence to current process | `RECOVERY_REQUIRED` or `SESSION_INTERRUPTED` | Started work is never reapproved or replayed | Preserve unmatched `COMMAND_STARTED` as the only command replay sentinel |
| Recovered command | `apps/desktop/src/session/recoveryActions.ts` - `recoveredCommand()`, `commandsMatch()`; `apps/desktop/src/views/SessionsView.tsx` - `reauthorize()`, `approveRecovered()` | Stored proposal and newly opened project | Re-resolved command or blocked recovery; Desktop | Durable proposal to fresh project/catalog | Fresh approval/start/settlement | Changed project/catalog cannot run | Recreate proposal/approval/decision from the newly verified trusted catalog; no decision reuse across restart |
| Tauri bridge | `apps/desktop/src/platform/tauriProjectCommandRunner.ts` - `createTauriProjectCommandRunner()` | Trusted definition and run ID | Native result; Desktop platform | TypeScript to Rust | Session lifecycle remains in TypeScript | Missing digest rejects before invoke | Keep the narrow request; do not add arbitrary executable/args/env/cwd |
| Native authorization | `apps/desktop/src-tauri/src/lib.rs` - `pick_project_directory()`, `validate_project_root()`, `run_project_command()` | Selected root and narrow request | Authorized canonical root or error; Rust | Desktop request to OS process boundary | Native result returned; Session records lifecycle | Unknown/unauthorized/non-directory/symlink roots reject | Preserve exact session root authorization and deny identity mismatch before process spawn |
| Native catalog | Same file - `resolve_command()`, `is_safe_script_name()` | Root, command ID, expected digest | Native `CommandDefinition`; Rust | TypeScript catalog claim to independent Rust truth | Error is returned as command result/failure | Unknown IDs, unsafe categories, changed scripts reject | Preserve independent reread and digest verification; add no general command input |
| Native process | Same file - `execute_command()`, `copy_allowed_environment()`, `read_bounded()` | Native trusted definition | Bounded `ProjectCommandResult`; Rust | Rust to operating system | Result becomes `COMMAND_COMPLETED` | Spawn/status/read failures fail; timeout/cancel kill and reap child | Remain no-shell, fixed cwd/args/env policy, bounded output, and catalog-bounded timeout |
| Action contracts | `packages/action-runtime/src/types.ts`, `validation.ts` - `ActionProposal`, `ActionApproval`, `createActionProposal()`, validators | KerniQ-owned proposal and approval | Digest-bound validated contracts; Action Runtime | Command adapter to policy runtime | Hook-driven evidence | Mismatch, expiry, stale generation, malformed JSON fail closed | Reuse contracts with `actionType=kerniq.project-command.run` and trusted process risk |
| Dispatch gate | `packages/action-runtime/src/runtime.ts` - `ActionRuntime.propose()`, `approve()`, `execute()`, `executeOnce()` | Proposal, approval, decision provider, handler | At-most-once decision-gated handler | Universal Action Runtime to registered physical handler | Awaited decision and dispatch hooks | Any non-allow generic Action decision or barrier failure invokes no handler | Register one command handler that delegates to the existing runner; adapt its start/settlement hooks to command events |
| AgentFuse bridge and adapter | `python/kerniq_agentfuse_bridge/service.py` - `AgentFuseRuntime.decide`; `packages/agentfuse-adapter/src/adapter.ts` - `AgentFuseAdapter.decide` | KerniQ-validated Action proposal, approval, and policy profile | Bridge maps to `ToolCallRequest`; AgentFuse emits `allow|block`; adapter maps to `allow|deny|error` | TypeScript to managed Python/AgentFuse | Canonical evidence returned to durable hook | Request/response identity, protocol, revision, schema, and policy errors become fail-closed error decisions; `hold` is unsupported | Use a trusted KerniQ-selected Project Command policy profile; never infer risk or fixture in AgentFuse |

### Exact source symbols

```text
list_project_commands
  AGENT_TOOLS
  AgentToolRegistry.listProjectCommands

run_project_command
  AGENT_TOOLS
  AgentToolRegistry.resolveCommand
  AgentLoopRuntime.processQueuedCalls
  createTauriProjectCommandRunner
  Rust run_project_command

WaitingForCommandApproval
  AgentLoopStatus
  AgentLoopRuntime.processQueuedCalls
  AgentLoopRuntime.approveCommand
  AgentLoopRuntime.denyCommand

RunningCommand
  AgentLoopStatus
  AgentLoopRuntime.approveCommand
  SessionRecoveryService.INTERRUPTED_RUNTIME_STATES

COMMAND_PROPOSED
  AgentSessionLedgerRecorder.recordPendingActions
  SessionProjector.project

COMMAND_APPROVED
  AgentSessionLedgerRecorder.beforeCommandStart
  AgentSessionLedgerRecorder.recordCommandApproval
  SessionsView.approveRecovered

COMMAND_DENIED
  AgentSessionLedgerRecorder.recordCommandApproval
  AgentSessionLedgerRecorder.recordCommandOutput
  SessionProjector.project

COMMAND_STARTED
  AgentSessionLedgerRecorder.beforeCommandStart
  SessionsView.approveRecovered
  SessionProjector.project
  SessionRecoveryService.findUnmatchedStartedAction

COMMAND_COMPLETED
  AgentSessionLedgerRecorder.afterCommandComplete
  SessionsView.approveRecovered
  SessionProjector.project
  SessionRecoveryService.findUnmatchedStartedAction
```

### Current implementation state

```text
Project Command carries KerniQ-owned trusted policy metadata=V0_6_1_1_MERGED
Project Command has pure proposal and approval mapping=V0_6_1_2_MERGED
Project Command uses Action Runtime contracts without process-local execution=true
Project Command native Desktop path calls AgentFuse=true
Project Command native Desktop path persists ACTION_DECIDED=true
Project Command has a fixed DHMS policy profile=true
ActionRuntime restores live process-local records after restart=false
Native request accepts caller-selected arguments/environment/cwd/timeout=false
```

The bounded native Desktop flow uses durable Session evidence rather than
restoring process-local Action Runtime state. Caller-selected native execution
parameters remain intentionally absent.

### Audited test evidence

| File | Current evidence inspected |
|:--|:--|
| `packages/agent-runtime/tests/agent-tools.test.ts` | Safe discovery, immutable policy ownership, deterministic serialization, exact unchanged catalog IDs/digests/preview, strict model schema, narrow pure parameters, unknown ID, and browser unavailability |
| `packages/agent-runtime/tests/minimal-agent-loop.test.ts` | Command approval, exact tool-call result, denial, and zero process start |
| `packages/agent-runtime/tests/agent-loop-boundaries.test.ts` | Timeout result, running-command cancellation, provider stop, and command limits |
| `packages/agent-runtime/tests/agent-loop-state-safety.test.ts` | Pre-dispatch persistence barrier, causal lifecycle order, settlement failure, stale/duplicate approval, cancellation, and at-most-once run |
| `packages/session-runtime/tests/lifecycle-integrity.test.ts` | Proposal/approval/start/completion ordering, identity binding, duplicate rejection, and started-action recovery constraints |
| `packages/session-runtime/tests/projection-recovery.test.ts` | Pending command reapproval, unmatched start interruption, approval generation, and no process on projection |
| `packages/action-runtime/tests/runtime.test.ts` | Proposal digest, approval expiry/generation, decision barrier, duplicate dispatch, cancellation, uncertain settlement, and no replay |
| `packages/agentfuse-adapter/tests/adapter.test.ts` | Protocol, action, policy/schema/revision, response, timeout/error, and duplicate-decision validation |
| `apps/desktop/src/session/projectCommandActionMapping.test.ts` | Proposal determinism and identity, trusted policy digest binding, explicit generation conversion, exact approval binding, expiry rejection, excluded process fields, and dependency/import side-effect boundary |
| `apps/desktop/src/session/agentSessionRecorder.test.ts` | Exact command event IDs, output redaction/bounds projection, settlement failure, and unmatched-start recovery |
| `apps/desktop/src/platform/tauriProjectCommandRunner.test.ts` | Narrow native invoke shape and dedicated cancellation command |
| `apps/desktop/src/platform/tauriCapability.test.ts` | Absence of Tauri shell permissions |
| `apps/desktop/src-tauri/src/lib.rs` inline tests | Unknown/unsafe ID, forbidden request fields, exact root authorization, output bounds/path sanitization, timeout, and cancellation |
| `apps/desktop/e2e/minimal-agent-loop.spec.ts` | Visible approval, allow/deny, start counts, cancel-before-dispatch, browser honesty, and command limits |
| `apps/desktop/e2e/session-recovery.spec.ts` | Fresh reapproval, catalog rediscovery/change, running-command interruption, settlement uncertainty, and restart no-replay |

## Ownership Matrix

| Responsibility | Owner | Required rule |
|:--|:--|:--|
| Trusted command catalog | KerniQ Agent Runtime and Rust native boundary | TypeScript resolves for proposal; Rust resolves again before spawn |
| Trusted risk classification | KerniQ | Deterministic catalog metadata only |
| Required approval strength | KerniQ | Explicit, one execution, digest-bound, expiring |
| Approval UI and workflow | KerniQ Desktop | Exact command and trusted risk visible before approval |
| Policy/authorization evaluation | DHMS AgentFuse | Evaluate exact proposal and approval identity; return decision only |
| Canonical policy evidence | DHMS AgentFuse through adapter | Exact commit, schema, policy, decision, and reason retained |
| Durable decision and dispatch gate | Universal Action Runtime | No allow or durable decision means no command start |
| Command lifecycle coordination | Agent Runtime adapter | One pending command, one execution promise, one result |
| Durable command lifecycle | Session Runtime | `COMMAND_*` remains the physical lifecycle source of truth |
| Project binding and restart recovery | Session Runtime and Desktop | Fresh verification/reapproval for unstarted work; no replay for started work |
| Physical dispatch and execution | KerniQ Desktop and Rust | Existing narrow runner and no-shell process boundary |
| Physical outcome | Rust result plus KerniQ Session settlement | DHMS allow never implies command success |

## Risk-Classification Boundary

Risk must not come from:

```text
LLM arguments
provider metadata
prompt text
command output
DHMS inference
```

For the first v0.6.1 slice, every admitted command is an operating-system
process and should map deterministically to Action Runtime risk `process`.
KerniQ may later add more specific trusted catalog metadata, but the adapter
must reject unknown or missing metadata rather than accept a model-supplied
replacement. The initial typed metadata should be:

```ts
interface TrustedProjectCommandPolicy {
  actionType: "kerniq.project-command.run";
  risk: "process";
  approval: "explicit_once";
  maxTimeoutMs: 120_000;
  policyProfileId: "kerniq-project-command-v1";
}
```

`policyProfileId` is application configuration, not model input. KerniQ must
translate the reviewed profile into AgentFuse allowlist, denylist, and optional
custom-policy configuration. The current production profile and its trusted
`safe_metadata` fields are `NOT_CONFIRMED`.

## Approval Boundary

The visible command approval remains mandatory and separate from Patch
approval. The adapter must create an `ActionApproval` from the same user click,
not request a second generic approval.

The approval binds:

```text
approvalId
actionId == provider toolCallId
taskId
proposalDigest
generation
approvedAt
expiresAt
```

Before evaluation and again before dispatch, KerniQ must reject missing,
expired, stale, mismatched, cancelled, or already-claimed approval. A recovered
command requires fresh project authorization, catalog rediscovery, a new
approval generation, a new Action proposal digest, and a new DHMS decision.
Neither old approval nor old decision may be reused.

## AgentFuse Decision Boundary

KerniQ Action Runtime validates `ActionProposal` and `ActionApproval`, including
proposal digest, approval identity, expiry, generation, and action/task
identity. The KerniQ bridge validates request identity, then maps the validated
proposal, approval, and trusted policy context into a provider-neutral
AgentFuse `ToolCallRequest`.

AgentFuse core owns:

- configured static or custom `ToolCallRequest` policy evaluation;
- canonical `allow|block` evidence;
- fail-closed policy exception handling; and
- fail-closed malformed policy-result handling.

AgentFuse core does not:

- classify whether the command is dangerous;
- define or universally validate KerniQ's `ActionProposal` or
  `ActionApproval` schema;
- validate proposal digest, approval expiry, or approval generation as a
  universal built-in contract;
- choose the command catalog entry;
- authorize a private project root;
- approve on behalf of the user;
- spawn, cancel, time out, or settle the command; or
- claim that allow means execution succeeded.

A trusted custom policy may inspect fields that the KerniQ bridge places in
`ToolCallRequest.safe_metadata`; those fields remain application-owned.

The KerniQ adapter validates response identity, source commit, schema, policy
revision, and protocol. It maps:

```text
AgentFuse allow -> KerniQ allow
AgentFuse block -> KerniQ deny
bridge or validation failure -> KerniQ error
AgentFuse hold -> unsupported
```

The generic `ActionDecision` type retains `hold`, but the canonical AgentFuse
3.6.0 Project Command path does not emit it. Adding a hold-producing decision
provider or extending canonical policy semantics requires separate review and
is outside v0.6.1.

Any mapped deny or error, bridge timeout, protocol mismatch, source revision
mismatch, malformed response, duplicate decision, unsupported value, or
decision-persistence failure leaves `COMMAND_STARTED` absent and invokes the
native runner zero times.

## Responsibility Matrix

| Responsibility | Owner |
|:--|:--|
| Trusted risk | KerniQ command catalog |
| Approval contract | KerniQ Action Runtime |
| Proposal digest, expiry, and generation | KerniQ Action Runtime |
| Request identity mapping | KerniQ bridge |
| Configured tool policy evaluation | AgentFuse core |
| Canonical `allow|block` evidence | AgentFuse core |
| Response, source, schema, and revision validation | KerniQ adapter |
| Durable `ACTION_DECIDED` | KerniQ Session Runtime adapter |
| Dispatch | KerniQ Universal Action Runtime |
| Physical execution | KerniQ Rust runner |

## Proposed Typed Contracts

The future adapter should reuse existing public Action Runtime contracts and
add the narrow command-owned types below in Agent Runtime or the Desktop
integration layer. Names are planning names and may be refined during review.

```ts
interface TrustedProjectCommandDefinition extends ProjectCommandDefinition {
  policy: TrustedProjectCommandPolicy;
}

interface ProjectCommandActionParameters {
  commandId: string;
  catalogDigest: string;
  commandCategory: ProjectCommandCategory;
  projectBindingId: string;
  projectFingerprint: string;
}

interface ProjectCommandActionContext {
  taskId: string;
  sessionId: string;
  pending: PendingCommandApproval;
  projectBindingId: string;
  projectFingerprint: string;
  approvalGeneration: number;
}

interface ProjectCommandDecisionLink {
  actionId: string;
  approvalId: string;
  approvalGeneration: number;
  decisionId: string;
  decision: "allow" | "deny" | "error";
  policyVersion: string;
  decisionSchemaVersion: string;
  agentFuseCommit: string;
  proposalDigest: string;
}
```

The `ActionProposal.parameters` must omit executable strings, arbitrary args,
environment values, private absolute roots, and caller-selected cwd or timeout.
The command ID and catalog digest are evidence for identity, not authority for
Rust. Rust still rereads the actual catalog source.

The command Action handler returns a bounded JSON projection of
`ProjectCommandResult` with no unbounded raw environment or private path. The
existing Session settlement remains responsible for the safe durable result.

## Lifecycle Decision

### One lifecycle, one start, one settlement

The current Session projector treats a pending event as exactly one kind:
`action`, `patch`, or `command`. Generic `ACTION_DECIDED` currently requires a
generic action. v0.6.1 should extend decision evidence so a command proposal may
carry a linked Action decision without changing its kind.

Recommended event sequence:

```text
COMMAND_PROPOSED
COMMAND_APPROVED
ACTION_DECIDED
COMMAND_STARTED
COMMAND_COMPLETED
```

Deny/error sequence:

```text
COMMAND_PROPOSED
COMMAND_APPROVED
ACTION_DECIDED
```

The non-allow decision settles the pending command as blocked. No
`COMMAND_DENIED` is required for a mapped AgentFuse block or bridge/adapter
error because the durable `ACTION_DECIDED` already records the reason. A user
clicking Deny continues to use `COMMAND_DENIED` and does not call AgentFuse.

Authoritative receipts:

```text
authoritative_start_receipt=COMMAND_STARTED
authoritative_terminal_receipt=COMMAND_COMPLETED or SESSION_INTERRUPTED
generic_ACTION_STARTED_for_same_command=false
generic_ACTION_COMPLETED_for_same_command=false
```

The `ActionRuntime.beforeDispatch` hook must write `COMMAND_STARTED`, carrying
the matching action, approval, decision, and execution receipt identity. The
handler then calls the existing `ProjectCommandRunner`. Its `afterSettlement`
hook writes `COMMAND_COMPLETED`. The Action Runtime process-local snapshot may
coordinate dispatch, but the Session ledger remains restart truth.

This avoids the duplicate-lifecycle risk in which one physical execution would
have both `ACTION_STARTED` and `COMMAND_STARTED` or could settle one history
while leaving the other unmatched.

### Required invariants

```text
one physical command execution
-> one authoritative COMMAND_STARTED receipt
-> one authoritative COMMAND_COMPLETED or SESSION_INTERRUPTED settlement

unknown command ID -> deny before dispatch
catalog mismatch -> deny before dispatch
project identity mismatch -> deny before dispatch
model-supplied risk mismatch -> ignored or rejected
missing or stale approval -> deny before dispatch
proposal digest mismatch -> deny before dispatch
AgentFuse block -> KerniQ deny; COMMAND_STARTED absent; native invocations=0
bridge/adapter failure -> KerniQ error; native invocations=0
AgentFuse hold -> unsupported; native invocations=0
ACTION_DECIDED persistence failure -> native invocations=0
COMMAND_STARTED persistence failure -> native invocations=0
allow decision -> does not itself execute the command
duplicate dispatch -> native invocations at most 1
settlement persistence failure -> Interrupted; unknown_or_interrupted
restart with unmatched COMMAND_STARTED -> Interrupted; no reapproval; no replay
cancel before dispatch -> native invocations=0
timeout or cancellation race -> no invented success
```

## Native Catalog Re-Resolution

The native boundary remains structurally unchanged:

```text
TypeScript resolves command ID for proposal and approval.
Rust independently resolves command ID again before execution.
```

The Tauri request should remain narrow. Rust must continue to deny unknown
request fields through `deny_unknown_fields`; therefore model/caller-provided
`executable`, `args`, `environment`, `cwd`, raw command, and timeout are not
accepted. The effective timeout remains native-owned and no greater than the
catalog maximum.

Before spawn, native code independently rejects:

- unknown command ID;
- unsafe package script category/name;
- changed catalog digest;
- unauthorized or mismatched project root;
- unexpected executable or arguments by never accepting them from the caller;
- unexpected environment entries by clearing and rebuilding the allowlist;
- unsupported working directory by deriving cwd from the authorized root; and
- caller-selected timeout, including any value above the native/catalog limit.

`std::process::Command` remains direct. No shell plugin, `sh -c`, `cmd /C`,
PowerShell, terminal, arbitrary executable, or raw command string may be added.

## Threat Model

| # | Threat | Preventive control | Detective/durable evidence | Residual risk |
|:--:|:--|:--|:--|:--|
| 1 | Model invents command ID | TypeScript and Rust catalog resolution | Structured unknown-ID result; no start | Project scripts themselves may have side effects |
| 2 | Model supplies lower risk | Risk absent from tool schema; KerniQ catalog owns risk | Proposal records trusted risk | Catalog classification defects require code review |
| 3 | Model supplies executable/args/env/cwd | Tool and Tauri schemas reject fields | No `COMMAND_STARTED` | Existing trusted script content can invoke other programs |
| 4 | Catalog changes after approval | Digest in proposal; Rust rereads metadata | Native mismatch result | Metadata can change immediately after reread; process launch is not filesystem-transactional |
| 5 | Wrong project selected | Binding/fingerprint check plus exact authorized canonical root | Binding and action identities | Files can change within the authorized project |
| 6 | Approval reused for changed proposal | SHA-256 proposal digest, expiry, generation | Approval and digest linkage | User may approve a risky but accurately displayed script |
| 7 | Approval UI race/double click | Existing claim/coalescing plus Action Runtime execution promise | One approval/start/receipt | Process cancellation remains best effort |
| 8 | DHMS response forged/mismatched | Protocol, message, action, revision, schema, policy validation | Canonical `ACTION_DECIDED` metadata | Managed bridge compromise outside verified tree remains an OS-level threat |
| 9 | DHMS used as danger classifier | Explicit KerniQ risk ownership; fixed policy profile | Proposal risk and policy evidence | Policy may allow a high-risk command when configured to do so |
| 10 | Decision persisted after dispatch | Await `ACTION_DECIDED` before command start hook | Causal ledger order | SQLite and process are not one transaction |
| 11 | Start evidence fails | Await `COMMAND_STARTED` before runner | Start absent, native count zero | None after successful barrier until actual spawn call returns |
| 12 | Duplicate physical dispatch | One Action execution promise, receipt set, existing command claim | One `COMMAND_STARTED` receipt | Cross-process duplicate prevention depends on Session recovery and no replay |
| 13 | Output leaks private data | Rust path sanitization and 64 KiB stream bounds; Session safe projection | Truncation flags, bounded settlement | Command output may contain unrecognized sensitive text |
| 14 | Timeout/cancel race invents success | Native kill/reap and explicit flags; handler outcome rules | `timedOut`, `cancelled`, or interruption evidence | Child descendants may outlive a killed parent on some platforms; `NOT_CONFIRMED` as fully contained |
| 15 | Settlement persistence fails | Unknown/interrupted state; suppress normal terminal session evidence | `SESSION_INTERRUPTED` or unmatched start | Physical result remains genuinely unknown |
| 16 | Restart replays started command | Recovery scans unmatched starts first; no reapproval path | `Interrupted`, execution count unchanged | External side effects cannot be rolled back automatically |

Threats reviewed: **16**.

## Compatibility Constraints

- Preserve `@qodex/*` package identities and exports unless a separately
  reviewed implementation requires an additive internal export.
- Do not change managed Python identity, AgentFuse package `3.6.0`, pinned
  commit `ec4b5842339dccfba0db62df7541920759203bc9`, policy
  `dhms-agentfuse-runtime-guard@3.6.0`, or evidence schema
  `agentfuse-evidence-schema-v0.1` in this planning milestone.
- Preserve current command IDs, visible command preview, explicit user
  approval, browser-mode unsupported result, and provider tool-call identity.
- Preserve current Tauri bundle identity, application data paths, Session
  schema version, SQLite schema, and project binding privacy.
- Preserve command output limits, timeout, cancellation, catalog categories,
  native environment allowlist, no stdin, and no-shell execution.
- Preserve Patch behavior exactly; it is not part of v0.6.1.
- No existing command may become automatically approved or automatically
  executed during recovery.

## Implementation Slices

### v0.6.1.1 - Trusted command risk metadata and action contracts

**Status:** Merged through `be32ca0caa764aa86e3de341557fedbc2acba0a5`;
not frozen.

- Adds deterministic immutable KerniQ-owned command policy metadata.
- Defines a narrow pure command Action parameter contract and factory.
- Rejects missing, malformed, unknown, or caller-forged policy inputs.
- Preserves existing command IDs, native catalog digest, command preview,
  browser behavior, and strict model schema.
- Does not connect dispatch, Action Runtime, AgentFuse, or Session evidence.

### v0.6.1.2 - Command proposal and approval mapping

**Status:** Merged through `c201e32ec1dcb342e9b1fbbeace6315cb422bc99`;
not frozen.

- Create one digest-bound `ActionProposal` from the resolved command and
  project binding.
- Map the existing explicit command approval to one expiring
  `ActionApproval`.
- Bind the fixed policy profile and deterministic policy digest without
  changing the native catalog digest.
- Convert Session's 0-based approval generation explicitly to Action Runtime's
  positive generation.
- Keep user denial and all command dispatch behavior unchanged.

### v0.6.1.3 - DHMS decision-only integration and durable ACTION_DECIDED

**Status:** Merged through `ca005397b88534ba3663f1f19b0b539de0f94766`;
not frozen.

- Select a fixed KerniQ-owned Project Command policy profile.
- Call public `RuntimeGuard.evaluate()` through `AgentFuseAdapter.decide`.
- Persist command-linked `ACTION_DECIDED`.
- Prove mapped deny/error, unsupported values, and persistence failure invoke
  no runner.
- Advance only the embedded bridge installed-tree integrity digest required by
  the reviewed bridge source; preserve the managed Python runtime version,
  AgentFuse package/commit, protocol, and evidence schema.

### v0.6.1.4 - COMMAND_STARTED dispatch gate and native binding

**Status:** Merged; not frozen.

- Bind the live Desktop approval and recovery flows to the decision
  coordinator with a five-minute approval TTL.
- Persist one exact `COMMAND_APPROVED`, then one command-linked
  `ACTION_DECIDED`; only a current durable allow may persist
  `COMMAND_STARTED`.
- Delegate to the existing runner once after the start receipt.
- Keep Rust catalog re-resolution, authorization, limits, request shape, and
  no-shell spawn unchanged.
- Preserve `COMMAND_COMPLETED` settlement without generic Action
  start/complete events.
- Fail closed with zero native invocations for policy deny/error, expiry,
  cancellation before start, stale identity, and approval/decision/start
  persistence failure.

### v0.6.1.5 - Duplicate, interruption, timeout, cancellation, and recovery tests

**Status:** Merged through `c5e214a43f9102c23f9c0a973782d227606a5c2b`.

- Exercise stale approvals/digests, catalog and project mismatch, duplicate
  clicks/execute calls, cancellation windows, timeout, output truncation,
  settlement failure, restart interruption, and no replay.
- Cover normal and recovered command paths.
- Release transient proposal and decision state after success, denial, error,
  cancellation, or persistence failure, with bounded completed-decision
  retention.
- Reset an unstarted pre-restart allow before requiring a fresh approval
  generation and AgentFuse decision.
- Keep model-visible execution failures generic and bounded.

### v0.6.1.6 - Real Tauri proof, result review, and freeze

**Status:** Implementation and real proof merged through
`4eb7c24c493b0fc135a750f07ed46cbb86ddd461`; final docs-only freeze seal merged
through `7c594b05293e7d151c536a7b37f2f88b95135263`.

- Run one real cataloged harmless command and one policy-denied command in an
  isolated project.
- Inspect SQLite ordering and native invocation counts.
- Repeat restart, settlement-fault, timeout/cancel, and catalog-change checks.
- Produce a result review/freeze document only after evidence passes.

## Unit Test Plan

### Agent Runtime

- Catalog assigns only KerniQ-owned process risk and fixed policy metadata.
- Unknown ID, missing metadata, and model-supplied risk never form an Action
  proposal.
- Exact command definition and project binding produce a stable digest.
- Duplicate approval shares one evaluation and one runner invocation.
- User denial produces `COMMAND_DENIED`, no AgentFuse call, and no runner call.
- Expired/stale/mismatched approval and digest fail before AgentFuse or
  dispatch.
- Cancellation before evaluation and after allow but before start invokes no
  runner.

### Action Runtime and AgentFuse adapter

- Command action proposal/approval validation reuses the existing strict
  validators.
- AgentFuse allow remains a decision with zero mutation until the handler runs.
- Mapped deny/error, malformed response, timeout, revision mismatch, duplicate
  decision, unsupported `hold`, and decision-persistence failure invoke no
  handler.
- Generic Action Runtime `hold` tests remain valid for its provider-neutral
  contract but are not proof of AgentFuse hold behavior.
- Duplicate `execute()` shares one execution.
- `beforeDispatch` failure invokes no handler.
- Settlement failure returns `Interrupted/unknown_or_interrupted` and duplicate
  execute does not replay.

### Session Runtime

- A pending command accepts exactly one command-linked `ACTION_DECIDED` after
  matching approval.
- Decision identity, proposal digest, approval ID/generation, policy, schema,
  and AgentFuse commit are mandatory.
- Non-allow decision settles without `COMMAND_STARTED`.
- Allow requires matching decision before `COMMAND_STARTED`.
- `ACTION_STARTED` and `ACTION_COMPLETED` are rejected for the same command
  lifecycle.
- Duplicate decision/start/settlement and cross-action identity mismatches are
  rejected.
- Unmatched `COMMAND_STARTED` becomes Interrupted on restart and is never
  reapprovable.

### Rust native runner

- Unknown IDs, changed digest, unauthorized root, unsafe script name, and
  malformed request fields reject before `Command::spawn`.
- Raw command, executable, args, environment, cwd, and caller timeout fields
  remain rejected.
- No shell permission or invocation exists.
- Output remains separately bounded and paths sanitized.
- Timeout and cancellation terminate and reap the child without fabricated
  success.

## Integration Test Plan

1. Model requests a known command; catalog risk and project identity are mapped
   into one Action proposal; UI pauses.
2. User approves; KerniQ validates approval/digest/expiry/generation, the
   bridge maps trusted context to `ToolCallRequest`, and AgentFuse allow maps to
   KerniQ allow. `ACTION_DECIDED` then precedes `COMMAND_STARTED`, one runner
   invocation, and `COMMAND_COMPLETED`.
3. AgentFuse block maps to KerniQ deny; bridge or validation failure maps to
   error. Either writes `ACTION_DECIDED` only and leaves runner count zero.
4. Inject decision persistence failure; command start and runner invocation
   remain absent.
5. Inject command start persistence failure; runner remains absent.
6. Inject settlement persistence failure after one runner invocation; Session
   becomes Interrupted and provider continuation stops.
7. Change `package.json` between approval and native execution; Rust rejects
   the catalog mismatch.
8. Reopen a pending unstarted command; require matching project, rediscovery,
   new generation, new approval, and new decision.
9. Restart with unmatched start; show Interrupted and no approval/run surface.
10. Run cancellation and timeout races; retain one start and one honest
    terminal or interrupted outcome.

## Desktop E2E Plan

- Extend the deterministic command fixture with KerniQ-owned AgentFuse
  allow/block policy configuration and an induced bridge/validation error.
- Assert trusted risk and exact command remain visible in the approval card.
- Assert `starts=0` before approval, during mapped deny/error, and after any
  pre-dispatch persistence fault.
- Assert allow produces event order
  `COMMAND_PROPOSED -> COMMAND_APPROVED -> ACTION_DECIDED ->
  COMMAND_STARTED -> COMMAND_COMPLETED`.
- Assert no `ACTION_STARTED` or `ACTION_COMPLETED` appears for the command.
- Assert duplicate Approve clicks produce one policy request, one native start,
  and one completion.
- Assert browser mode still returns `command_unavailable` and never claims a
  DHMS-protected native execution.
- Assert pending restart requires reauthorization and a fresh approval;
  started restart is Interrupted with no replay.
- Assert changed catalog, wrong project, timeout, cancellation, output
  truncation, decision persistence failure, start persistence failure, and
  settlement persistence failure.

## Real Tauri Proof Plan

Use a new isolated HOME/app-data root and disposable project. Build the normal
desktop application with the reviewed command adapter enabled through its
production path; do not use a browser command fixture for the proof.

Evidence must show:

1. Managed Python verifies the frozen AgentFuse package, commit, policy, and
   schema before evaluation.
2. A harmless cataloged command is shown exactly and waits for explicit
   approval.
3. After approval, SQLite contains one `ACTION_DECIDED` before one
   `COMMAND_STARTED`.
4. Rust independently rereads the catalog and spawns directly without a shell.
5. One physical process produces one start and one matching
   `COMMAND_COMPLETED`.
6. A trusted policy-denied command produces `ACTION_DECIDED`, zero start, and
   zero process invocation.
7. Injected decision/start persistence failures produce zero process
   invocations.
8. Injected settlement persistence failure produces one invocation,
   `Interrupted/unknown_or_interrupted`, no ordinary completion, and zero replay
   after restart.
9. Catalog mutation and wrong project selection block execution.
10. Timeout/cancel output is honest and bounded; full app stop leaves no owned
    child process.

The proof does not claim malware sandboxing, transactional atomicity between
SQLite and the process, or safety of arbitrary project scripts.

## Explicit Non-Goals

```text
v0.6.1.1 merged=true
v0.6.1.2 merged=true
v0.6.1.3 merged=true
v0.6.1.4 merged=true
v0.6.1.5 merged=true
v0.6.1.6 real Tauri proof complete=true
v0.6.1.6 Draft PR merged=true
v0.6.1 final freeze seal merged=true
v0.6.1 Project Command release frozen=true
next implementation milestone started=false
Project Command native Desktop path migrated=true
Project Command all environments migrated=false
Project Command decision path implemented=true
Project Command native Desktop execution AgentFuse-gated=true
Patch migrated=false
arbitrary shell added=false
automatic approval added=false
automatic Git push added=false
MCP integration added=false
browser execution added=false
DHMS danger classification added=false
managed Python identity changed=false
embedded bridge tree digest updated=true
Session schema migration added=false
```

Also out of scope: installer work, release tagging, package renaming, Stage 2
namespace migration, new provider behavior, generic terminal UI, arbitrary
commands, arbitrary Python, and production claims beyond Project Command.

## Open Questions

1. Resolved in v0.6.1.3: KerniQ selects
   `kerniq-project-command-v1`, bound to policy digest
   `sha256:9c01df377b0cfd8db8392dc8966a2f12b38ad1b2ab9c89780ac049ac0eed38ad`.
   The bridge maps only bounded command parameters plus task, Session,
   approval, proposal, risk, profile, and digest identity into AgentFuse.
2. Should all current catalog commands remain risk `process`, or should a later
   KerniQ-owned taxonomy add deterministic severity/approval metadata while
   keeping Action Runtime's existing `process` risk?
3. Should command-linked `ACTION_DECIDED` extend the existing projector rule or
   use a new command-specific decision event? Reusing `ACTION_DECIDED` is
   preferred for canonical evidence, but its command binding must be explicit.
4. Resolved in v0.6.1.2: one named and tested conversion maps Session
   generation `n` to Action generation `n + 1`; invalid Session generations
   fail closed.
5. Should native timeout stay fixed at 120 seconds for v0.6.1 or become
   per-catalog metadata with a Rust-owned upper bound? Caller/model selection
   remains prohibited either way.
6. Can cancellation reliably terminate descendant process trees on every
   supported platform? Current direct-child termination is proven; full
   descendant containment is `NOT_CONFIRMED`.
7. Should recovered unstarted commands enter DHMS only after a newly verified
   project binding and catalog are durably recorded? The plan recommends yes.

## Final Planning Verdict

The current source implements the bounded adapter without introducing a
duplicate lifecycle. v0.6.1.1 through v0.6.1.6 are merged. The isolated real
Tauri proof exposed and verified the bounded native policy-profile admission
correction. The full matrix was rerun through actual SQLite, managed Python,
canonical AgentFuse, Tauri IPC, Rust catalog resolution, and no-shell
execution.

The evidence supports the controlled native Desktop lifecycle only. The
separate docs-only final freeze seal is merged, the bounded v0.6.1 Project
Command scope is frozen, and the next implementation milestone has not started.
See
[`kerniq_project_command_real_tauri_proof_v0_6_1_6.md`](kerniq_project_command_real_tauri_proof_v0_6_1_6.md)
and
[`kerniq_v0_6_1_project_command_final_freeze.md`](kerniq_v0_6_1_project_command_final_freeze.md).

```text
KERNIQ_V0_6_1_PROJECT_COMMAND_AGENTFUSE_GATE_FROZEN
```
