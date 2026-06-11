# Qodex Development Log

> Desktop-first, multi-model, skill-enabled, MCP-compatible, diff-first AI coding agent.

---

## Project Overview

Qodex is an AI coding agent that follows the **Codex workflow** philosophy while remaining **provider-agnostic**. Unlike tools locked to a single model provider, Qodex supports OpenAI, DeepSeek, OpenRouter, and any OpenAI-compatible endpoint through a unified Provider SDK.

The architecture follows a strict milestone-based development plan (M0-M9), each building on the previous one without deviation. Every milestone includes production-grade testing and a formal production review before proceeding.

**Core philosophy:** Codex Workflow, Any Model, Skills Included.

**Tech stack:** Tauri + React + TypeScript + SQLite + Drizzle ORM + pnpm Workspace

---

## Milestone Timeline

| Milestone | Date | Description | Packages | Tests |
|:--|:--:|:--|:--:|:--:|
| M0 | 2026-06-11 | Repository Bootstrap & Organization | — | — |
| M1 | 2026-06-11 | Desktop Shell (Tauri + React UI) | `@qodex/desktop` | — |
| M1.1 | 2026-06-11 | UI Polish (dark glassmorphism) | — | — |
| M2 | 2026-06-12 | Provider SDK Foundation | `@qodex/provider-sdk` | 35 |
| M3 | 2026-06-12 | Agent Runtime Skeleton | `@qodex/agent-runtime` | 50 |
| M4 | 2026-06-12 | Project Runtime | `@qodex/project-runtime` | 41 |
| M5 | 2026-06-12 | Context Engine Foundation | `@qodex/context-engine` | 57 |
| M6 | 2026-06-12 | Diff Engine Foundation | `@qodex/diff-engine` | 95 |
| M7 | 2026-06-12 | Git Runtime Foundation | `@qodex/git-runtime` | 123 |
| M8 | 2026-06-12 | Skill Runtime Foundation | `@qodex/skill-runtime` | 131 |
| M9 | 2026-06-12 | MCP Runtime Foundation | `@qodex/mcp-runtime` | 160 |

**Total packages:** 8  
**Total tests:** 692  
**Production reviews passed:** 6 (M5-M9)  
**Known defects:** 0

---

## Package Timeline

| Package | Created In | Purpose | Test Count |
|:--|:--:|:--|:--:|
| `apps/desktop` | M1 | Tauri + React UI shell | — |
| `packages/provider-sdk` | M2 | Unified model provider abstraction | 35 |
| `packages/agent-runtime` | M3 | Task lifecycle & event bus orchestration | 50 |
| `packages/project-runtime` | M4 | File system access & project indexing | 41 |
| `packages/context-engine` | M5 | Context assembly pipeline | 57 |
| `packages/diff-engine` | M6 | Patch generation & safe apply/rollback | 95 |
| `packages/git-runtime` | M7 | Local git operations & checkpoints | 123 |
| `packages/skill-runtime` | M8 | Skill loading, validation & resolution | 131 |
| `packages/mcp-runtime` | M9 | MCP tool discovery & permission-gated execution | 160 |

---

## Architecture Evolution

```
M0:  Repo structure + docs organization
M1:  Tauri + React + 3-column glassmorphism UI
M2:  Provider SDK — ModelProvider interface, registry, streaming
M3:  AgentRuntime — task lifecycle, event bus, mock provider
     ↓
M4:  ProjectRuntime — open project, file tree, file reading
     ↓
M5:  ContextEngine — rules + memory + metadata + files assembly
     ↓
M6:  DiffEngine — patch generation, validation, apply/rollback
     ↓
M7:  GitRuntime — checkpoints, commits, branches, status
     ↓
M8:  SkillRuntime — skill loading, registry, keyword resolver, context injection
     ↓
M9:  MCPRuntime — server/tool registry, permission engine, mock transport
```

The data flow after M9:

```
User Prompt → ContextEngine (Rules+Memory+Skills+Metadata+Files)
           → AgentRuntime
           → Provider (via ProviderSDK)
           → Streaming Output
           → DiffEngine (patch proposal)
           → Apply / Reject
           → GitRuntime (checkpoint/commit)
           → MCPRuntime (external tool calls with permission gating)
```

---

## Current Status

```
✅ M0 — Repository organized
✅ M1 — Desktop shell with dark glassmorphism UI
✅ M2 — 4 providers (OpenAI, DeepSeek, OpenRouter, Custom)
✅ M3 — Agent runtime with event bus and state machine
✅ M4 — Project reading with file tree and ignore rules
✅ M5 — Context assembly with rules, memory, metadata, files
✅ M6 — Diff generation, validation, apply, rollback, conflict detection
✅ M7 — Git checkpoints, commits, branches, status
✅ M8 — Skill loading, validation, keyword resolution, context injection
✅ M9 — MCP server/tool registry, permission engine, mock transport

All production reviews: PASSED
All test suites: 692/692 passing
Known defects: NOT FOUND
```

---

## Next Milestone Roadmap

| Milestone | Description | Status |
|:--|:--|:--:|
| M10 | Multi-Agent Runtime Foundation | ⬜ Future |
| M11 | Cloud Sync & Remote State | ⬜ Future |
| M12 | Marketplace & Skill Distribution | ⬜ Future |

M10 will introduce multi-agent coordination protocols, planner/coder/reviewer role management, and inter-agent communication.

---

*Generated: 2026-06-12*
