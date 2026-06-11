# Qodex Architecture

## Overview

Qodex is a modular AI coding agent built as a pnpm monorepo. Each subsystem is an independent package with its own interfaces, tests, and lifecycle. All packages communicate through well-defined TypeScript interfaces — no runtime coupling.

---

## Core Flow

```
User Input → ContextEngine → MultiAgentRuntime → AgentRuntime → Provider SDK
                ↓                  ↓                   ↓
              Skills             Planner            Streaming
              Memory         Specialists               ↓
              Metadata        Aggregation          DiffEngine
              Files                                   ↓
                                                  Patch Proposal
                                                       ↓
                                                  Apply/Reject
                                                       ↓
                                                  Git Checkpoint
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
    └── MockFileSystemAdapter (testing)

ProjectRuntime → open / close / read / select / deselect
TreeBuilder → build / expand / collapse / select
FileReader → readFile / readFiles / binary detection
ProjectIndexer → lightweight file index
IgnoreRules → .git, node_modules, dist, *.lock, *.db
```

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

**Purpose:** Orchestrate task execution lifecycle.

```
AgentRuntime
    ├── TaskStateMachine (7 states: Idle→Planning→...→Done)
    ├── EventBus (pub/sub for UI communication)
    ├── SessionStore (in-memory)
    └── TaskStore (in-memory)

Events: task.started, message.chunk, task.completed,
        patch.proposed, patch.applied, patch.rejected
```

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
No Autonomous Execution → user must approve every action
Skills are Text-Only → no executable code in skills
```

---

## Testing Strategy

- Each package tests independently with vitest
- Mock adapters for all external dependencies (providers, file system, git, MCP)
- Cross-package integration tests validate contracts
- Production reviews for each milestone
- 887+ tests total

---

## Development

```bash
pnpm -r test          # Run all tests
cd packages/<name>    # Work on a specific package
pnpm dev              # Start the desktop app (Vite)
```

See `docs/QUICK_START.md` for setup instructions.
