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

## M10 — Multi-Agent Runtime Foundation

**Date:** 2026-06-12

**Status:** Completed ✅

### Goals

* Coordinator-Agent architecture with 4 specialists
* Planner for task decomposition
* Aggregated report generation
* Integration with all existing runtimes

### Packages

- `packages/multi-agent-runtime` — 195 tests

### Delivered

- Coordinator: manages planning → delegation → aggregation
- Specialist agents: Review, Refactor, Research, Testing
- Planner: task decomposition with plan execution tracking
- Report: aggregated results from all specialist agents
- Alpha integration test suite (27 integration tests)
- Production review (46 tests)
- Scenario tests including error handling and long-running sessions

### Validation

| Suite | Count | Status |
|:--|:--:|:--:|
| Unit tests | 195 | ✅ |
| Alpha integration | 27 | ✅ |
| Production review | 46 | ✅ |

---

## M10.5 — UX Audit & Interaction Completion

**Date:** 2026-06-12

**Status:** Completed ✅

### Motivation

Public alpha user feedback identified multiple false affordances in the desktop UI. Several navigation items appeared interactive but had no behavior attached. This milestone focused on interaction completion and UX consistency with zero runtime architecture changes.

### Goals

* Eliminate false affordances across the desktop shell
* Complete navigation interactions (Files, Sessions, Skills, Git, Settings)
* Improve empty states and discoverability
* Refine Context Panel hierarchy and readability
* Validate desktop usability before M11

### Navigation

Implemented active view routing (`activeView` state in `AppShell`) with six views:

| View | Behavior |
|:--|:--|
| Agent (default) | AgentTimeline + PromptBar |
| Files | Project tree or "No project opened" empty state |
| Sessions | "Session history coming soon" placeholder |
| Skills | Loaded skills list with enabled/disabled status |
| Git | Branch, checkpoints, repository status |
| Settings | Model provider, theme, language, version (v0.1.0-alpha) |

### New Files

- `apps/desktop/src/views/FilesView.tsx`
- `apps/desktop/src/views/SessionsView.tsx`
- `apps/desktop/src/views/SkillsView.tsx`
- `apps/desktop/src/views/GitView.tsx`
- `apps/desktop/src/views/SettingsView.tsx`
- `docs/development/UX_AUDIT.md`

### Interaction Fixes

| Before | After |
|:--|:--|
| Sessions nav — dead button | ✅ Switches to SessionsView |
| Skills nav — dead button | ✅ Switches to SkillsView |
| Git nav — dead button | ✅ Switches to GitView |
| Settings nav — dead button | ✅ Switches to SettingsView |
| Model badge ▼ — no onClick | ✅ Popover with info message |
| Skill / button — decorative | ✅ Popover with skill list + "Manage skills →" |
| ⊕ Attach button — no onClick | ✅ Placeholder feedback |
| ⊞ Context button — no onClick | ✅ Placeholder feedback |

### Context Panel Refinements

- Added `SectionDivider` between every section
- Extracted `SectionLabel`, `SectionValue`, `SectionValueMuted` components
- Reduced visual noise; no cards, no emojis, no colored blocks
- Consistent 14px/11px hierarchy with clear spacing

### UX Audit Results

| Category | Count |
|:--|:--:|
| KEEP | 14 |
| FIX | 8 |
| REMOVE | 0 |

### Validation

| Check | Result |
|:--|:--|
| Full test suite | 887/887 passing ✅ |
| Desktop TypeScript | Zero new errors ✅ |
| UX smoke test | 7/7 interactions ✅ |
| Runtime smoke test | Context + Agent + Diff ✅ |
| Dead navigation | None ✅ |
| Console errors | None ✅ |
| Regression count | 0 ✅ |

### Outcome

Qodex desktop UX is now suitable for public alpha evaluation. All false affordances removed. Every visible interactive element either works or clearly communicates its status.

### Commit

`6f5959c` — `feat(ui): complete navigation interactions and remove false affordances`

---

*Generated: 2026-06-12*
*Updated: 2026-06-12 (M10 + M10.5 + M11 + M12 + M13)*

---

## M13 — Internationalization Runtime & Localization System

**Date:** 2026-06-12

**Status:** Completed ✅

### Motivation

The desktop UI, skill metadata, and runtime messages were all hardcoded in English with manual Chinese synchronization. This did not scale for future locales and caused translation drift.

### Goals

* Centralized locale registry (en, zh-CN)
* Deterministic locale resolution (user → project → system → default)
* Fallback chain: region → language → default (zh-TW → zh → en)
* Per-key fallback (missing key in target → en value)
* Translation key system replacing hardcoded strings
* Skill metadata localization
* Bundle validation (missing key detection)
* Zero network loading, zero eval

### Packages

- `packages/i18n-runtime` — 35 tests
- `locales/en/` + `locales/zh-CN/` — 6 JSON files

### Delivered

- LocaleRegistry: add/get/remove/list with default locale
- LocaleResolver: deterministic user→project→system→default chain
- FallbackEngine: zh-TW→zh→en, per-key fallback, nested key resolution
- Validation: bundle validation + missing key detection
- I18nRuntime: t(), setLocale(), loadBundle(), onChange(), export/import
- Skill metadata: getLocalizedName/getLocalizedDescription per locale
- I18nEventBus: locale:changed + bundle:loaded events

### Translation Coverage

| Namespace | en | zh-CN | Keys |
|---|---:|---:|
| app.json | ✅ | ✅ | 56 |
| runtime.json | ✅ | ✅ | 9 |
| skills.json | ✅ | ✅ | 3 |

### Validation

| Check | Result |
|:--|:--|
| Unit tests (4 suites) | 35/35 ✅ |
| Cross-package total | 1105 ✅ |
| Network loading | Zero ✅ |
| Eval/dynamic execution | Zero ✅ |
| Regressions | 0 |

### Commit

`03043dd` — `feat(i18n-runtime): implement M13 internationalization runtime and localization system`

---

## M12 — Execution Graph Runtime Foundation

**Date:** 2026-06-12

**Status:** Completed ✅

### Motivation

The ExecutionGraph existed only as a transient computational artifact during M11's GraphExecutor runs. Graph nodes lacked their own lifecycle, persistence model, inspection surface, and replay capability.

### Goals

* Elevate graphs to first-class runtime entities with full lifecycle
* Archive execution history with immutable snapshots
* Replay graphs/nodes/paths in read-only mode
* Graph traversal (topological sort, dependency walk)
* Node orchestration with injected executor pattern
* Framework-agnostic graph-level event bus

### Packages

- `packages/execution-graph-runtime` — 78 tests

### Architecture

```
Planning Runtime (M11) → Plan
    ↓
Execution Graph Runtime (M12) → Build → Validate → Run → Archive → Replay
    ↓
Multi-Agent Runtime (M10) → Execute nodes (injected)
```

### Delivered

- GraphLifecycle: 8 statuses with legal/illegal transition enforcement
- ArchiveManager: immutable GraphSnapshot + ExecutionRecord, append-only
- ReplayEngine: graph/node/path replay, read-only, no side effects
- GraphTraverser: topological sort, dependency walk, reverse walk, all paths
- GraphInspector: query graphs, nodes, progress, archives, history
- NodeOrchestrator: dispatch with retry/blocking, executor injection
- GraphEventBus: 13 graph-level event types
- ExecutionGraphRuntime: full lifecycle API (build → start → archive → replay)

### Validation

| Check | Result |
|:--|:--|
| Unit tests (12 suites) | 78/78 ✅ |
| Cross-package total | 1070 ✅ |
| Cross-package imports | 0 (zero @qodex/* imports) |
| Archived immutable | ✅ |
| Replay read-only | ✅ |
| No regressions | 992 existing green ✅ |

### Commit

`e3fd6c3` — `feat(execution-graph-runtime): implement M12 execution graph runtime foundation`

---

## M11 — Planning & Execution Runtime Foundation

**Date:** 2026-06-12

**Status:** Completed ✅

### Motivation

The system could load context, execute agents, produce diffs, and coordinate specialists, but lacked a planning layer. Tasks were executed directly from prompts with no execution graph, no plan lifecycle, and no replanning capability.

### Goals

* Goal decomposition into structured plans
* Execution graph as a Directed Acyclic Graph (DAG)
* Deterministic sequential execution engine
* Replanning on failure, dependency change, or user request
* Framework-agnostic event system
* Type-only imports from other packages (no circular deps)

### Packages

- `packages/planning-runtime` — 105 tests

### Architecture

```
User Goal
    ↓
Planner (goal → plan decomposition)
    ↓
ExecutionGraph (DAG of nodes)
    ↓
GraphExecutor (sequential node execution)
    ↓
Multi-Agent Runtime (delegated execution)
    ↓
Result
```

### Delivered

- Planner: deterministic goal-to-plan decomposition with 5 keyword workflows + default
- ExecutionGraph: DAG construction, cycle detection, orphan detection, readiness calculation
- GraphExecutor: sequential deterministic exec with retry, blocking, cancellation
- Replanner: failure/dependency_change/user_request triggers, max depth=3
- PlanningEventBus: 11 typed events, framework-agnostic, no React/dom dependencies
- PlanningRuntime: full lifecycle (createPlan → startExecution → replan → serialization)
- Serialization: exportGraph/importGraph round-trip with zero information loss

### Safety Constraints

- ❌ No file writes (delegated to Diff Engine)
- ❌ No diff auto-apply (UI layer exclusive)
- ❌ No git operations (delegated to Git Runtime)
- ❌ No MCP execution (delegated to MCP Runtime + Permission Engine)
- ❌ No shell execution
- ❌ No permission bypass
- ✅ Coordinates only, never executes

### Validation

| Check | Result |
|:--|:--|
| Unit tests (11 suites) | 105/105 ✅ |
| Cross-package total | 992 ✅ |
| Circular dependencies | 0 ✅ |
| Architecture compliance | Boundary enforced ✅ |
| No regressions | 887 existing tests green ✅ |
| Production review | 13 scenarios PASS ✅ |

### Commit

`9cce752` — `feat(planning-runtime): implement M11 planning and execution runtime foundation`
