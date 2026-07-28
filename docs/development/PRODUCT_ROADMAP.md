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

**Status:** v0.6.1.1 through v0.6.1.4 merged; v0.6.1.5 implemented in Draft PR; v0.6.1.6 not started

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

The v0.6.1.5 Draft PR adds deterministic persistence-fault, cancellation,
duplicate, restart, drift, timeout, result-bound, cache-cleanup, and no-replay
coverage. It resets unstarted pre-restart allow evidence before fresh
reapproval, releases transient live decision state on every terminal path, and
prevents raw runner diagnostics from reaching model-visible results. It does
not claim real Tauri proof or frozen status. v0.6.1.6 has not started.

- [v0.6.1 planning document](kerniq_project_command_action_runtime_adapter_planning_v0_6_1.md)
- [ADR-021](../../qodex-config/adr/ADR-021-Project-Command-Action-Runtime-Adapter.md)

### v0.7 - Coding Pack Product Integration

Repo2Prompt, Agent Doctor, Agent Rules Kit, and Git Task Checkpoints.

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
