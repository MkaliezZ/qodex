# KerniQ Product Roadmap

KerniQ is evolving into a provider-neutral, skill-driven, memory-aware,
approval-first, evidence-first, general-purpose Agent. Coding is the first
mature Capability Pack, not the product boundary.

## Milestones

### v0.4.1 - Minimal Coding Agent Loop

**Status:** Frozen

### v0.5 - Universal Session Ledger and Restart Recovery

### v0.6 - Managed Python Runtime, Universal Action Runtime, and DHMS / AgentFuse Integration

**Status:** Merged and frozen

Private managed CPython provisioning, universal action contracts, and one
development-only canonical AgentFuse proof are frozen. Patch and Project
Command migration remained outside that proof milestone.

### v0.6.1 - Project Command Action Runtime Adapter

**Status:** v0.6.1.6 implementation, real proof, and final freeze seal merged;
Project Command scope frozen

The source audit, responsibility boundary, typed contracts, lifecycle decision,
threat model, six implementation slices, automated test plan, and real Tauri
proof plan are documented. The planned adapter preserves KerniQ-owned risk,
approval-contract validation, response validation, and physical execution.
KerniQ maps trusted context to AgentFuse `ToolCallRequest`; AgentFuse returns
canonical `allow|block` evidence; KerniQ maps it to `allow|deny|error`.
Native catalog re-resolution, no shell, one authoritative command start, honest
settlement uncertainty, and restart no-replay remain mandatory.

The bounded native Desktop Project Command path is migrated through its live
decision and dispatch gate. Patch migration remains a separate, future
decision.

v0.6.1.1 merged immutable KerniQ-owned policy metadata and pure future
action-parameter contracts. v0.6.1.2 merged pure
`ActionProposal` and `ActionApproval` mapping with deterministic policy-digest
binding, proposal revalidation, and explicit approval-generation conversion.
v0.6.1.3 merged the fixed Project Command AgentFuse profile, public
decision-only evaluation, `block -> deny` mapping, and durable command-linked
`ACTION_DECIDED`. It does not call `ActionRuntime.execute`, start or complete a
command, invoke Tauri or Rust, or change native execution.

The merged v0.6.1.4 slice binds the live Desktop approval flow to that decision
path. It durably records `COMMAND_APPROVED`, obtains and persists the exact
AgentFuse decision, and permits `COMMAND_STARTED` plus the existing native
runner only for a current durable allow. Deny, error, expiry, cancellation, and
persistence failures remain zero-dispatch. The native request, Rust catalog
re-resolution, project authorization, and no-shell implementation are
unchanged. This claim applies only to the bounded native Desktop Project
Command path, not Patch, Git, MCP, browser actions, or arbitrary shell.

The merged v0.6.1.5 slice adds deterministic persistence-fault, cancellation,
duplicate, restart, drift, timeout, result-bound, cache-cleanup, and no-replay
coverage. It resets unstarted pre-restart allow evidence before fresh
reapproval, releases transient live decision state on every terminal path, and
prevents raw runner diagnostics from reaching model-visible results.

The merged v0.6.1.6 result adds a dual-gated real Tauri proof and one bounded
native request-admission correction exposed by that proof. The isolated proof
uses the actual SQLite store, managed Python bridge, pinned AgentFuse
`RuntimeGuard.evaluate()`, Tauri IPC, Rust catalog re-resolution, and no-shell
process. It proves allow, human deny, canonical block, zero-dispatch
persistence barriers, settlement interruption, restart no-replay, stale
authority invalidation, and controlled lifecycle at-most-once behavior. A
separate docs-only PR merged the final freeze seal. The v0.6.1 Project Command
scope is frozen and the next implementation milestone has not started.

- [v0.6.1 planning document](kerniq_project_command_action_runtime_adapter_planning_v0_6_1.md)
- [v0.6.1.6 real Tauri proof](kerniq_project_command_real_tauri_proof_v0_6_1_6.md)
- [v0.6.1 final freeze seal](kerniq_v0_6_1_project_command_final_freeze.md)
- [ADR-021](../../qodex-config/adr/ADR-021-Project-Command-Action-Runtime-Adapter.md)

### v0.7 - Coding Pack Product Integration

**Status:** Product planning merged in
`46ae1d405a5519477de7da3d1eba51c7e0ae5640`; v0.7.1 contracts and deterministic
portable manifest merged in `d01ad3b71a83efe906c262fa466417d325969946`;
v0.7.2 deterministic selection and path-based privacy core merged in
`1a20c3920ccb83a0c0306ae175be933b24aac161`; v0.7.3 selected-file preview and
exact ephemeral confirmation merged in
`5d5152ca25c0fc2772cec730dd6229dd44aa88cb`; v0.7.4.1 durable store and export
proposal contracts merged in `c3f7c9cef73cb9660f9b4d39c325dc8c4e3f5170`;
v0.7.4.2 AgentFuse export decision merged in
`6d592a199d5d4ee65663f107f64dfbb91cd1d8e5`; v0.7.4.3 Tauri-only native
atomic export implemented for Draft PR review

The source audit found authorized project reads, selected-file context
assembly, project binding, action contracts, and Session persistence, but no
Coding Pack contract, manifest, preview, durable lifecycle, staleness, receipt,
or export implementation.

The proposed product creates a deterministic, inspectable source manifest from
an authorized project, applies explicit privacy and size rules, requires user
confirmation, and exports through a bounded durable write lifecycle. AgentFuse
is not a content-quality judge, and the frozen v0.6.1 Project Command scope does
not change.

- [v0.7 planning document](kerniq_v0_7_coding_pack_product_integration_planning.md)
- [ADR-022](../../qodex-config/adr/ADR-022-Coding-Pack-Product-Integration.md)

Repo2Prompt, Agent Doctor, Agent Rules Kit, and Git Task Checkpoints remain
roadmap context, not currently integrated Coding Pack capabilities.

v0.7.1 is a pure browser-safe package slice only. Its contract uses
portable machine codes for inclusion reasons and selection-rule versions,
rejects ill-formed UTF-16 before canonical UTF-8 processing, and keeps an
optional project label explicit rather than deriving it from a local folder.

v0.7.2 adds pure caller-supplied candidate selection, fixed hard exclusions,
strict UTF-8 classification, conservative fail-closed case/normalization
collisions, Windows-portable filename rules, bounded candidate work, fixed
project-ignore provenance, runtime-verified purpose/rules/source identity, and
deterministic budgets.

v0.7.3 adds bounded exact-byte reads through the already-authorized Project
Runtime adapter and a Desktop preview for explicitly selected files only.
A shared runtime read plan classifies byte-independent exclusions before read,
checks candidate count before the first read, and bounds cumulative eligible
bytes during reading. Manual refresh re-plans every selected path and re-reads
only read-required sources. The complete candidate-path digest is recomputed
from included and excluded evidence and bound to the preview. Exact confirmation
is local, in-memory, invalidated by project/selection/purpose/refresh changes,
and grants no export authority. Tauri rejects links observed during pre-read
checks but does not claim race-free protection against concurrent replacement.
v0.7.4.1 adds the dedicated `kerniq.coding-pack.store.v1` lifecycle, separate
Tauri SQLite storage, opaque destination bindings, exact proposal digests, and
separate export approval. Only `PACK_PROPOSED` and `PACK_CONFIRMED` are
implemented. Persistence failures fail closed and restart never advances an
operation automatically. Browser directory authority remains session-only;
Tauri absolute destination paths remain private to the native binding store.
The reviewed correction adds UTF-8 canonical identity, immutable destination
bindings, atomic snapshots, native pre-persistence digest/chronology validation,
24-hour proposal/approval bounds, and SQLite `synchronous=FULL`.

v0.7.4.2 migrates the dedicated store to
`kerniq.coding-pack.store.v2`, adds the separately frozen
`kerniq-coding-pack-export-v1` AgentFuse profile, derives one digest-only request
from a live confirmed snapshot, and persists exactly one `PACK_DECIDED`
allow/deny/error event. It performs no source read, destination write, staging,
or Action Runtime dispatch. The corrected contract binds evaluation start,
turns late allow/block into terminal error evidence, validates exact response
keys, revalidates the observed destination capability, and distinguishes one
durable decision from non-crash-safe bridge invocation. Recovered decisions
remain historical.

v0.7.4.3 migrates the store to `kerniq.coding-pack.store.v3` and implements
Tauri-only `PACK_EXPORT_STARTED`, `PACK_EXPORT_COMPLETED`, and
`PACK_EXPORT_INTERRUPTED`. Native export revalidates trusted bindings,
canonical manifest identity, and exact source bytes before STARTED; stages on
the destination filesystem; and performs platform no-overwrite atomic
promotion. Completion-persistence failure remains an explicit uncertain
`export_started` state. Browser export, cross-filesystem fallback, automatic
restart replay/retry, and Action Runtime export dispatch remain unimplemented.

### v0.8 - Product Packaging and Closed Beta

Windows installer as the primary distribution target, macOS unsigned technical
preview, onboarding, credential storage, and managed-Python bootstrap.

### v0.9 - Research Pack and Office Pack

### v1.0 Beta

Skills, Memory, Automation, bounded delegation, mature capability packs, and
real-user validation.

## Distribution Constraints

```text
WINDOWS_INSTALLER=PLANNED_FOR_V0_8
MACOS_UNSIGNED_TECHNICAL_PREVIEW=PLANNED_FOR_V0_8
MACOS_DEVELOPER_ID_SIGNING=DEFERRED
MACOS_NOTARIZATION=DEFERRED
MAC_APP_STORE=DEFERRED
```

## Architectural Decisions

```text
PYTHON_IS_A_FIRST_CLASS_RUNTIME=true
MANAGED_PYTHON_IS_PLANNED=true
DHMS_PYTHON_REMAINS_CANONICAL=true
FULL_DHMS_TYPESCRIPT_REWRITE=false
```

## Explicitly Deferred

- MCP Agent Loop
- complex Multi-Agent orchestration
- cloud sync
- cross-device sessions
- mobile client
- large marketplace expansion
- multiple messaging gateways
- arbitrary shell
- automatic Git push
- automatic approvals
- enterprise administration
- Stage 2 namespace-wide rename
