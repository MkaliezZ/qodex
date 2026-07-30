# KerniQ Architecture

## Overview

KerniQ is a modular AI coding agent built as a pnpm monorepo. Each subsystem is an independent package with its own interfaces, tests, and lifecycle. All packages communicate through well-defined TypeScript interfaces — no runtime coupling.

---

## Core Flow

```
User Input → ContextEngine → AgentLoopRuntime → Provider SDK
                ↓                  ↓                    ↓
              Skills         Typed Tool Registry   Tool-call stream
              Memory          Read-only tools             ↓
              Metadata        Approval pauses       DiffEngine patch
              Files           Command catalog              ↓
                                  ↓                  Verified apply
                         Native no-shell runner             ↓
                                  ↓                    Tool result
                            Provider next turn
                                  ↓
                         Session Recorder
                                  ↓
                 Append-only Ledger → Projector → Sessions UI
```

---

## Package Architecture

### 1. Provider SDK (`packages/provider-sdk`)

**Purpose:** Unified interface for AI model providers.

```
ModelProvider (interface)
    ├── listModels()
    ├── stream(request) → AsyncIterable<ModelChunk>
    └── testConnection()

ProviderRegistry → register / get / list
StreamManager → normalize all provider streams
ErrorLayer → 6 canonical error types
```

Supports: OpenAI, DeepSeek, OpenRouter, Custom.

### 2. Project Runtime (`packages/project-runtime`)

**Purpose:** Open, index, and read local projects.

```
FileSystemAdapter (interface)
    ├── WebFileSystemAdapter (browser)
    ├── TauriFileSystemAdapter (desktop application platform layer)
    └── MockFileSystemAdapter (testing)

ProjectRuntime → open / close / read / select / deselect
TreeBuilder → build / expand / collapse / select
FileReader → readFile / readFiles / binary detection
ProjectIndexer → lightweight file index
IgnoreRules → .git, node_modules, dist, *.lock, *.db
```

The desktop application prefers Tauri's native directory dialog and filesystem
plugin when running in Tauri. The user-selected directory is added to the
runtime filesystem scope for that session; no whole-home or whole-disk scope is
configured. Browser development retains `showDirectoryPicker()` as a fallback.
Both adapters expose project-relative paths to `ProjectRuntime` and the model.

### 3. Context Engine (`packages/context-engine`)

**Purpose:** Assemble structured context from multiple sources.

```
ContextEngine.buildContext(request)
    ├── RulesLoader → qodex-config/rules.md
    ├── MemoryLoader → qodex-config/memory.md
    ├── SkillRuntime  → resolved skills (if available)
    ├── ProjectMetadataBuilder
    ├── FileContextBuilder
    └── TokenEstimator

Assembly order:
    === Project Rules ===
    === Session Memory ===
    === Skills ===
    === Project Metadata ===
    === Selected Files ===
    === Task ===
```

### 4. Agent Runtime (`packages/agent-runtime`)

**Purpose:** Orchestrate single-turn tasks and the bounded multi-turn Agent Mode lifecycle.

```
AgentRuntime
    ├── TaskStateMachine (7 states: Idle→Planning→...→Done)
    ├── EventBus (pub/sub for UI communication)
    ├── SessionStore (legacy single-turn, in-memory)
    └── TaskStore (legacy single-turn, in-memory)

Events: task.started, message.chunk, task.completed,
        patch.proposed, patch.applied, patch.rejected
```

`AgentLoopRuntime` is a separate explicit state machine for Agent Mode:

```
Planning → CallingModel → Streaming
  → ExecutingReadTool → ReturningToolResult → CallingModel
  → WaitingForPatchApproval → ApplyingPatch → CallingModel
  → WaitingForCommandApproval → RunningCommand → CallingModel
  → Done / Failed / Cancelled / LimitReached
```

Canonical provider history preserves assistant tool calls and tool results by
exact call ID. The minimal registry exposes only `search_files`, `read_file`,
`list_project_commands`, and `run_project_command`. Read tools are bounded and
project-relative. Source writes remain exclusively in the existing DiffEngine
approval path. Native commands resolve a catalog ID again in Rust, require a
session-authorized project root, run without a shell invocation, and have fixed
environment, timeout, output, and cancellation limits.

The Agent Loop emits facts through a narrow desktop adapter into Session
Runtime. Exact provider tool-call IDs, safe tool results, proposals, decisions,
execution receipts, and terminal states are recorded. React state remains a
live presentation layer; the append-only ledger is the durable history source.
For mutating Agent actions, the adapter is also an awaitable pre-dispatch
barrier: a fresh approval and `PATCH_STARTED` or `COMMAND_STARTED` receipt must
commit successfully before the Diff Engine writes or the native command runner
starts. Persistence failure therefore blocks dispatch rather than leaving an
unrecorded side effect. Once dispatch has begun, failure to persist the matching
settlement is a distinct `SettlementPersistenceError`: the in-memory task stops,
provider continuation is blocked, and the Session adapter records
`SESSION_INTERRUPTED` when persistence remains available. It does not report the
physical operation as an ordinary known failure.

### Session Runtime (`packages/session-runtime`)

**Purpose:** Universal, provider-neutral task evidence and restart recovery.

```
SessionRuntime
    ├── SessionStore (dependency-inverted persistence)
    ├── SessionRecorder (ordered append queue)
    ├── SessionProjector (deterministic active-path replay)
    ├── SessionRecoveryService (evidence-only restart mapping)
    └── SessionExportService (deterministic redacted JSON)
```

Session and entry records reserve `parentEntryId` and `activeLeafId` for future
tree histories, while v0.5 presents only the active path. Universal action and
artifact events can represent future managed-Python work through safe metadata
without storing script source, environment values, credentials, or native
handles.

Tauri owns a local SQLite database in the application-data directory. Schema
migrations are transactional and versioned; foreign keys, ordered retrieval,
transactional append, and cascade-isolated session deletion are enforced. A
separate project-binding table retains the private canonical root. Normal
session reads and redacted exports expose only its display name and fingerprint.
Browser development uses an in-memory adapter and labels that limitation.

Restart recovery reconstructs evidence, never live runtime objects. Completed,
failed, cancelled, and limit-reached outcomes remain terminal. Pending patch or
command decisions become `RecoveryRequired`, increment an explicit approval
generation, and invalidate earlier approval. The projector rejects approval,
start, completion, duplicate, mismatched-ID, and post-terminal sequences that
cannot form a valid action lifecycle. It also rejects a completed, failed,
cancelled, delivery-completed, or limit-reached Session terminal event while a
started action lacks matching settlement evidence. An unstarted pending action
may still be disposed by an appropriate terminal event.

Recovery scans the full active path for unmatched `ACTION_STARTED`,
`PATCH_STARTED`, or `COMMAND_STARTED` evidence before accepting a projected or
cached terminal status. An unmatched start becomes honestly `Interrupted` with
an unknown outcome and is never reapprovable, including for legacy malformed
ledgers where a later terminal event masked the start. If an exact settlement
append fails after dispatch, KerniQ attempts `SESSION_INTERRUPTED`; if that append
also fails, the durable unmatched started receipt remains the recovery signal.
Recovery never calls a provider, applies a patch, or starts a command
automatically.

The SQLite ledger cannot form one atomic transaction with an external filesystem
write or native process. KerniQ can prove that dispatch started, but when final
evidence cannot be persisted it does not invent whether the physical operation
completed.

All session titles, display metadata, entry payloads, and safe metadata pass
through one bounded local scanner before persistence. It removes sensitive
field names and redacts recognised credential and absolute-path patterns as a
defense-in-depth measure. A patch containing recognised sensitive text is
stored without old/new contents and marked non-recoverable. Export applies the
same rules again to session metadata, project display names, entries, and patch
summaries. This deterministic scanner intentionally does not claim to detect
every possible secret or private identifier.

### Universal Action Runtime (`packages/action-runtime`)

**Purpose:** Provider-neutral approval and dispatch contracts for future
non-coding capabilities.

`ActionProposal`, `ActionApproval`, `ActionDecision`, and `ActionOutcome` remain
separate records. Approval binds a canonical SHA-256 proposal digest and expiry.
Deny, hold, decision error, unknown action, stale approval, and dispatch-evidence
failure all block the physical handler. A successful decision creates no
outcome; only a dispatched handler can settle one.

The optional v0.6 proof maps lifecycle facts into existing Session Runtime
events without changing its schema. `ACTION_DECIDED` is committed independently
before `ACTION_STARTED`; generic Action start requires the matching durable
allow decision. A settlement persistence failure after dispatch produces
`Interrupted` with an unknown physical outcome and cannot replay the handler.
Patch and Command paths remain unchanged.

### Managed Python and AgentFuse

`packages/python-runtime` defines managed-runtime contracts and deterministic
manifest/protocol policies. Tauri owns provisioning below its private
application-data root, verifies pinned archive and installed-tree hashes,
rejects unsafe archive entries, promotes only verified profiles, and starts the
fixed interpreter without a shell under a cleared environment. Distribution,
AgentFuse source, and bridge tree truth comes from the compile-time embedded
manifest rather than the mutable installed profile record.

`packages/agentfuse-adapter` maps an exact Action proposal and approval to
`kerniq.agentfuse.bridge.v1`, then validates decision identity, policy/schema
versions, evidence, and the pinned canonical source revision. The Python bridge
loads canonical DHMS AgentFuse 3.6.0 source at commit
`ec4b5842339dccfba0db62df7541920759203bc9` and calls its public
`RuntimeGuard.evaluate()` decision-only API; TypeScript does not implement its
policy. The one-shot bridge process has one enforced 15-second session deadline.
The development proof is excluded unless its dedicated build flag is enabled.

The package version is independent of the preserved DHMS historical evidence
milestone `v3.5.2`; both continue using evidence schema
`agentfuse-evidence-schema-v0.1`.

This v0.6 foundation is merged and frozen. The bounded native Desktop v0.6.1
Project Command path now connects the reviewed boundaries while keeping KerniQ
as trusted catalog/risk/approval/native owner.
KerniQ Action Runtime validates proposal, digest, approval, expiry, generation,
and action identity. The bridge maps validated context into an AgentFuse
`ToolCallRequest`; AgentFuse evaluates configured policy and emits canonical
`allow|block` evidence; the KerniQ adapter validates and maps that response to
`allow|deny|error`. The canonical AgentFuse Project Command path does not emit
`hold`. The plan persists command-linked `ACTION_DECIDED` and retains
`COMMAND_STARTED` / `COMMAND_COMPLETED` as the single physical command
lifecycle. Rust catalog re-resolution and no-shell execution remain mandatory.
Real Tauri proof covers the allow and deny paths, decision/start persistence
barriers, settlement uncertainty, restart no-replay, stale authority
invalidation, and controlled duplicate approval. Patch, browser execution,
other KerniQ actions, and permanent global exactly-once behavior for arbitrary
direct IPC calls are not included.

The v0.6.1.6 implementation, real proof, and docs-only final freeze seal are
merged. The bounded v0.6.1 Project Command scope is frozen; the next
implementation milestone has not started.

Details:

- [`kerniq_project_command_action_runtime_adapter_planning_v0_6_1.md`](development/kerniq_project_command_action_runtime_adapter_planning_v0_6_1.md)
- [`kerniq_project_command_real_tauri_proof_v0_6_1_6.md`](development/kerniq_project_command_real_tauri_proof_v0_6_1_6.md)
- [`kerniq_v0_6_1_project_command_final_freeze.md`](development/kerniq_v0_6_1_project_command_final_freeze.md)
- [`ADR-021`](../qodex-config/adr/ADR-021-Project-Command-Action-Runtime-Adapter.md)

### Coding Pack v0.7

`@qodex/coding-pack-runtime` owns deterministic selection, exclusions,
source fingerprints, pack identity, and canonical portable manifests. Project
Runtime exposes a separate read-only exact-byte capability bound to an already
authorized project root. Browser access reads immutable `File` snapshots;
Tauri access reuses the existing containment and pre-read no-symlink checks,
checks metadata size, and reads through a bounded native file handle. These
checks reject symlinks and junctions observed before the path-based open; they
do not establish a race-free open-by-handle guarantee against concurrent local
replacement.

The Desktop v0.7.3 slice converts only explicitly selected paths into
path-only `explicit_selection` metadata. Coding Pack Runtime applies the same
shared pre-read classifier used by direct selection, so byte-independent
private and binary exclusions are recorded without reading those files.
Candidate count is rejected before the first read and cumulative eligible bytes
are bounded during reads. The runtime then completes selection from exactly the
planned reads, creates a manifest from the bound selection, and shows included
files, exclusions, totals, and portable identity. Its local preview binds
project, open generation, the selection's recomputed complete candidate-path
digest, purpose, source fingerprint, and manifest digest. Confirmation is
ephemeral, is invalidated by binding/selection/purpose/refresh changes, and does
not authorize export. Read-required source-byte changes are re-read on manual
refresh; there is no watcher.

v0.7.4.1 introduces `@qodex/coding-pack-store` as the dedicated versioned
lifecycle owner. Tauri persists `coding_pack_operations`,
`coding_pack_events`, and `coding_pack_destination_bindings` in the separate
`kerniq-coding-pack.sqlite3` database under schema
`kerniq.coding-pack.store.v2`; Session tables and events are unchanged. The
v1-to-v2 migration preserves proposed and confirmed records without advancing
them.
Browser development persists only serializable lifecycle records while keeping
the authorized directory handle in an in-memory capability map. Tauri keeps
the absolute destination path only in the private destination-binding table;
portable manifests and export proposals contain only opaque binding identity.
Destination bindings are immutable: repeat registration is accepted only when
the complete public identity and private native path are unchanged, and the
first creation timestamp remains authoritative. Operation, event, and
destination evidence is read as one adapter snapshot; Tauri performs that read
inside one SQLite transaction.

State derives from bounded, digest-verified `PACK_PROPOSED`, `PACK_CONFIRMED`,
and, in v0.7.4.2, exactly one `PACK_DECIDED` event. Preview confirmation
remains separate from export approval. `@qodex/coding-pack-agentfuse` builds a
digest-only trusted request from one live confirmed snapshot and maps canonical
AgentFuse allow/block/failure to durable allow/deny/error evidence. Durable
store and native boundaries recompute the request digest and require the
decision timestamp to remain inside the proposal and approval lifetime.
Decision does not start export or write files. Canonical identity uses
deterministic UTF-8 byte ordering and
well-formed Unicode, proposals and approvals cannot exceed 24 hours, native
writes independently recompute proposal and event digests and verify chronology,
and SQLite uses WAL with `synchronous=FULL`. These are SQLite and underlying
filesystem durability guarantees, not hardware-level persistence claims. A
later narrow native adapter may own staged, no-overwrite
physical export only after a durable AgentFuse decision. Session Runtime may
eventually reference a verified completed artifact but is not a competing
lifecycle owner.

Read-only deterministic selection uses project capability and privacy controls
without an AgentFuse decision. The separately versioned
`kerniq-coding-pack-export-v1` profile sees no absolute paths, source contents,
shell fields, or display labels and cannot select files, judge content, or
write. Automatic discovery, `.gitignore` parsing, content secret scanning,
physical export, Action Runtime export dispatch, `PACK_EXPORT_STARTED`, and
`PACK_EXPORT_COMPLETED` remain absent. The v0.6.1 Project Command freeze is
unchanged.

Details:

- [`kerniq_v0_7_coding_pack_product_integration_planning.md`](development/kerniq_v0_7_coding_pack_product_integration_planning.md)
- [`ADR-022`](../qodex-config/adr/ADR-022-Coding-Pack-Product-Integration.md)

### 5. Diff Engine (`packages/diff-engine`)

**Purpose:** Safe code modifications through patch proposals.

```
DiffEngine
    ├── DiffGenerator (unified diff format, pure TS)
    ├── PatchValidator (content match, file exists, not empty)
    ├── ApplyEngine (apply / reject / rollback)
    └── PatchParser (diff text ↔ PatchProposal)

PatchConflict types:
    file_not_found, content_mismatch, empty_patch
```

### 6. Git Runtime (`packages/git-runtime`)

**Purpose:** Local-only Git operations with user-friendly checkpoints.

```
GitRuntime
    ├── GitAdapter (interface)
    │   ├── MockGitAdapter (in-memory)
    │   └── SimpleGitAdapter (future: real git CLI)
    ├── CheckpointEngine (create/restore/list)
    ├── CommitEngine
    ├── BranchEngine
    └── StatusEngine
```

### 7. Skill Runtime (`packages/skill-runtime`)

**Purpose:** Domain-specific context injection via markdown skills.

```
SkillRuntime
    ├── SkillLoader (load/reload/cache)
    ├── SkillRegistry (register/get/list)
    ├── SkillResolver (keyword matching, no embeddings)
    └── Context injection: === Skills === section

Built-in: react-review, typescript-refactor, bug-hunter
```

### 8. MCP Runtime (`packages/mcp-runtime`)

**Purpose:** External tool discovery and permission-gated execution.

```
MCPRuntime
    ├── MCPRegistry (server/tool registration)
    ├── PermissionEngine (ask/allow_once/allow_session/deny)
    ├── MockTransport (mock handlers)
    └── MCPEventBus

Built-in servers: mock-filesystem, mock-git, mock-terminal
```

### 9. Multi-Agent Runtime (`packages/multi-agent-runtime`)

**Purpose:** Coordinated multi-agent task decomposition and execution.

```
MultiAgentRuntime
    ├── Coordinator (plan/dispatch/aggregate)
    ├── TaskPlanner (deterministic keyword decomposition)
    └── SpecialistFactory → Review, Refactor, Research, Testing

Output: AgentReport (summary + findings + recommendations)
```

---

## Data Flow Security

```
Permission Engine (MCP) → every tool call must pass
Diff-First Editing (Diff Engine) → no direct file writes
Checkpoint Recovery (Git Runtime) → all changes reversible
Separate Approval Boundaries → every patch and command requires its own decision
Bounded Agent Loop → model turns, tools, commands, patches, and duration have hard limits
Skills are Text-Only → no executable code in skills
```

Cataloged project scripts are not an OS sandbox and may have side effects.
Browser production mode never emulates native command success.

---

## Testing Strategy

- Each package tests independently with vitest
- Mock adapters for all external dependencies (providers, file system, git, MCP)
- Cross-package integration tests validate contracts
- Production reviews for each milestone
- 1,350+ tests total

---

## Development

```bash
pnpm -r test          # Run all tests
cd packages/<name>    # Work on a specific package
pnpm dev              # Start the desktop app (Vite)
```

See `docs/QUICK_START.md` for setup instructions.
