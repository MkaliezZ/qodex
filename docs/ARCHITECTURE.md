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
unrecorded side effect.

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
cannot form a valid action lifecycle. Any unmatched `ACTION_STARTED`,
`PATCH_STARTED`, or `COMMAND_STARTED` receipt on the full active path becomes
honestly `Interrupted` with an unknown outcome and is never reapprovable.
Recovery never calls a provider, applies a patch, or starts a command
automatically.

All session titles, display metadata, entry payloads, and safe metadata pass
through one bounded local scanner before persistence. It removes sensitive
field names and redacts recognised credential and absolute-path patterns as a
defense-in-depth measure. A patch containing recognised sensitive text is
stored without old/new contents and marked non-recoverable. Export applies the
same rules again to session metadata, project display names, entries, and patch
summaries. This deterministic scanner intentionally does not claim to detect
every possible secret or private identifier.

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
