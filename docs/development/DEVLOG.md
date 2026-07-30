# KerniQ Development Log

> Desktop-first, multi-model, skill-enabled, MCP-compatible, diff-first AI coding agent.

---

## Project Overview

KerniQ is an AI coding agent that follows the **Codex workflow** philosophy while remaining **provider-agnostic**. Unlike tools locked to a single model provider, KerniQ supports OpenAI, DeepSeek, OpenRouter, and any OpenAI-compatible endpoint through a unified Provider SDK.

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

`9cce752` — `feat(planning-runtime): implement M11 planning and execution runtime foundation

---

## M14 — Marketplace Foundation

**Date:** 2026-06-12

**Status:** Completed ✅

### Motivation

12 core runtimes existed but users lacked an ecosystem layer. Skills were hardcoded, installation was unsupported, no manifest standard or version tracking existed.

### Goals

* Skill manifest schema (`skill.json`)
* Format detection: Qodex Native, OpenClaw, Claude Code
* Adapter architecture for cross-format compatibility
* Install/remove/update lifecycle with rollback
* Semantic versioning + compatibility checking
* Local-only installation (no remote registry)
* Zero code execution during import

### Packages

- `packages/marketplace-runtime` — 40 tests

### Delivered

- Schema: validateManifest/parseManifest with kebab-case, SemVer, compatibility checks
- Versioning: parseVersion, compareVersions, isUpdateAvailable, satisfiesCompatibility
- Adapters: QodexNative, OpenClaw, ClaudeCode with AdapterRegistry
- Installer: install/uninstall/update with backup, index persistence, path traversal guard
- Discoverer: directory scan with multi-skill directory support
- MarketplaceRuntime: unified API with 12 methods

### Adapter Support

| Format | Detection | Import |
|---|---|---|
| Qodex Native | ✅ | ✅ |
| OpenClaw | ✅ | ✅ |
| Claude Code | ✅ | ✅ |

### Validation

| Check | Result |
|:--|:--|
| Unit tests | 40/40 ✅ |
| Cross-package total | 1145 ✅ |
| Code execution during import | 0 |
| Regressions | 0 |

### Commit

`45f4032` — `feat(marketplace-runtime): implement M14 marketplace foundation`

---

*Generated: 2026-06-12*
*Updated: 2026-06-14 (M0–M15.2)*

---

### M15.2 — Desktop Visual Refactor

**Date:** 2026-06-14  |  **Status:** Completed — Visual Acceptance Passed

Completed the UI-only desktop visual refactor and visual acceptance. The AppShell, ProjectRail, Settings, Provider settings, Registry Sources, Marketplace, registry cards, and trust badges now share a polished dark-glass local-first agent workbench presentation. Runtime behavior, package boundaries, provider configuration behavior, and registry data flows remain unchanged.

#### Validation

- Visual acceptance passed.
- Marketplace runtime tests passed: 85/85.
- Desktop app smoke test passed.
- App starts successfully with no blank page.
- Marketplace, Settings, and Registry Sources navigation works.
- Browser console had no warnings or errors.
- `git diff --check` passed.
- Desktop typecheck caveat: no dedicated desktop typecheck script exists; fallback validation was blocked by existing runtime package type errors, and the M15.2 desktop UI files did not introduce observed type errors.
- Desktop E2E caveat: no dedicated desktop e2e script exists; fallback Playwright Chromium was blocked by environment `SIGTRAP`/`EPERM`.
- Result-state screenshots used temporary local preview data; preview data has been removed from final code.

---

### KerniQ Brand Migration

**Date:** 2026-06-15  |  **Status:** Product-facing rename completed

Renamed the current product-facing brand from Qodex to KerniQ across the desktop
UI, application metadata, current guides, contributor surfaces, and security
templates. Existing behavior and runtime boundaries remain unchanged.

Compatibility-sensitive legacy identifiers are intentionally retained,
including the `@qodex/*` package scope, `qodex-config/`, `qodexVersion`,
`qodex-native`, `.qodex`, `com.qodex.desktop`, Cargo crate names, and historical
release/spec records. See `BRAND_MIGRATION_KERNIQ.md` for the migration boundary.

---

### KerniQ Minimal Agent Loop v0.4

**Date:** 2026-07-22  |  **Status:** Implementation complete, final review pending

Added a bounded, provider-neutral multi-turn Agent Mode. Verified
OpenAI-compatible providers now preserve fragmented tool calls and exact call
IDs across assistant/tool history. The runtime exposes project-relative search,
bounded reads, a trusted command catalog, separate patch and command approvals,
command results returned to the model, hard iteration limits, cancellation, and
in-memory multi-patch rollback.

The Tauri native runner accepts only a catalog command ID for a root selected and
authorized in the current desktop session. It does not invoke a shell directly,
accept model environment variables, or accept raw executable/argv/cwd input.
Timeout, output truncation, separate stdout/stderr, exit status, cancellation,
and absolute-root sanitization are enforced. Browser production mode returns a
structured unsupported result rather than simulating command success.

Limitations remain explicit: project scripts are not an OS sandbox, commands may
have side effects, every command needs approval, files cannot be created or
deleted, task history is not persistent, and no automatic Git commit is made.

### KerniQ Agent State Safety v0.4.1

**Date:** 2026-07-22  |  **Status:** Implementation complete, final review pending

Hardened the v0.4 approval and rollback state machine. Stop now disposes pending
patch and command approvals, expired approvals cannot start writes or processes,
and Agent-owned proposals cannot fall back to the single-turn apply path.
Duplicate approvals and rollbacks are serialized, while rollback remains
unavailable until active provider, patch, command, and cancellation work has
settled. Native child cancellation remains best-effort and does not imply
process-tree sandboxing.

### KerniQ Universal Session Ledger and Restart Recovery v0.5

**Date:** 2026-07-23  |  **Status:** Implementation complete, final review pending

Added a universal append-only session ledger with deterministic projection,
redacted export, and evidence-only restart recovery. The pure TypeScript Session
Runtime supports in-memory tests and future non-coding actions, including safe
managed-Python metadata. Tauri persists sessions in a schema-versioned local
SQLite database and keeps private project roots in a separate binding table.

Agent Mode now records user/model messages, exact tool-call IDs, safe tool
results, patch and command proposals, approvals, execution receipts, and
terminal outcomes. Recovered pending actions require exact project
reauthorization and a fresh explicit approval. Stale patch content and changed
command catalog definitions are blocked. Work that was active during shutdown
is marked `Interrupted`; KerniQ does not claim live process recovery or automatic
continuation.

The Sessions surface now provides status filtering, reconstructed active-path
history, recovery guidance, redacted JSON export, and confirmation-gated local
history deletion. Browser development truthfully reports its memory-only
persistence limitation. Signed distribution, cloud sync, cross-device history,
Git checkpoint recovery, and automatic approvals remain out of scope.

### KerniQ Session Restart Safety, Ledger Integrity, and Privacy v0.5.1

**Date:** 2026-07-23  |  **Status:** Correction implemented, final review pending

Closed the v0.5 review findings around the crash window between approval and a
mutating side effect. Normal Agent and recovered patch/command paths now await a
durable started receipt before invoking the Diff Engine or command runner. If
persistence fails, dispatch is blocked. A started receipt without a matching
settled receipt recovers only as `Interrupted` and is never reapprovable.

The session projector now enforces explicit approval generations and matching
action, approval, and execution-receipt identities. It rejects missing
proposals, start-before-approval, completion-before-start, duplicate lifecycle
events, completion after denial, mismatches, and active-path appends after a
terminal outcome.

Session titles, messages, tool summaries, command evidence, metadata, and
exports now share bounded local scanning for recognised credential and
absolute-path patterns. Sensitive patch contents are omitted before persistence
and the patch is marked non-recoverable. Export re-sanitizes session metadata,
project display names, entries, and patch summaries as defense in depth. This
pattern-based protection is intentionally bounded and does not claim to detect
every possible secret.

### KerniQ Settlement Evidence Honesty v0.5.2

**Date:** 2026-07-23  |  **Status:** Correction implemented, final review pending

Strengthened the Session projector so an ordinary completed, failed, cancelled,
delivery-completed, or limit-reached event cannot hide a started action without
matching settlement evidence. Unstarted pending actions retain their existing
terminal-disposal semantics. Recovery now scans the full active path for
unmatched started evidence before accepting projected or cached terminal state,
including conservative repair of legacy malformed ledgers.

Normal and recovered Patch and Command execution now distinguish pre-dispatch
persistence failure from post-dispatch settlement persistence failure. The
former remains fail-closed before a filesystem write or process start. The
latter stops provider continuation and attempts `SESSION_INTERRUPTED` with an
unknown physical outcome; if that write also fails, the ledger deliberately
ends at the unmatched started receipt for restart recovery. Such actions are not
replayed or offered for reapproval.

This correction does not claim transactional atomicity between SQLite and an
external filesystem operation or native process. KerniQ can prove that dispatch
started, but it does not invent whether the physical operation completed when
final evidence cannot be persisted.

### KerniQ Desktop UI Product Polish v0.5.3

**Date:** 2026-07-23  |  **Status:** v0.5.3.1 correction complete, validation passed

Reframed the Desktop application as a restrained, high-density local workbench.
The shell now uses continuous graphite surfaces and dividers instead of animated
gradients, glass blur, radial glows, and floating panels. Navigation uses one
accessible icon system, the Agent timeline distinguishes ordinary activity from
high-risk decisions, the composer is integrated, and the context region reads
as a subordinate inspector.

Files, Skills, Git, Settings, Marketplace, Diff review, and Sessions were
refined into desktop list, form, inspector, and split-pane patterns. Command
approval is prioritized above history at compact widths so decision actions and
the prompt composer remain reachable. Existing safety copy, recovery states,
approval controls, test IDs, and runtime behavior are preserved.

The application root is viewport-bound so large native project trees use their
own scroll region instead of moving the workspace, inspector, or composer.

The v0.5.3.1 correction removes the legacy Dark Fluid Glass stylesheet from
production and replaces it with a small `base.css` foundation. Content is
selectable by default, while only the decorative project-tree chevron disables
selection. Directory expansion is view-only local state initialized from the
runtime tree; mouse, Enter, and Space toggles do not rescan or alter selected
files.

Model and Skill composer popovers now render through a viewport-clamped fixed
portal above their triggers. Below 1180px, the existing Context Inspector is
available through an accessible right-side dialog with close, backdrop,
Escape, focus-entry, and focus-return behavior. The wide fixed inspector is
unchanged.

Visual review covers Agent empty state, Command approval, Sessions, Settings,
project-tree expansion, the model popover, and the compact Inspector at
1440x900, 1280x800, and 1024x768. Durable evidence is stored under
`docs/assets/ui-review/v0.5.3.1/`.

Validation passed for the frozen install, full workspace build and tests,
Desktop unit tests (48), Desktop E2E (56 passed with four credential-gated
real-provider scenarios skipped), Rust formatting/check/tests (14 native
tests), debug Tauri build, fresh-browser console smoke, real macOS window smoke,
and `git diff --check`.

### KerniQ Managed Python and Universal Action Runtime v0.6.0

**Date:** 2026-07-24  |  **Status:** Merged and frozen through the v0.6.0.1 correction

Added provider-neutral Action contracts with exact proposal-digest approval,
pre-dispatch policy decisions, awaited durable dispatch evidence, at-most-once
handler dispatch, and separate physical outcomes. The optional desktop proof
records proposal, approval, decision, receipt, outcome, canonical source
revision, and policy/schema identities through existing Session events.

Added user-initiated private CPython provisioning in Tauri with an embedded
cross-platform manifest, fixed HTTPS artifacts, SHA-256 verification, safe
archive extraction, exclusive locks, interrupted-install recovery, verified
rename promotion, integrity checks, and removal. Managed Python starts without a
shell under a cleared allowlisted environment and does not use system Python,
global pip, or project environments.

The NDJSON bridge loads canonical DHMS AgentFuse source pinned to commit
`8c6ae9875b3618a529d5150c96385da7461099c2`. The TypeScript adapter validates
identity, revision, protocol, policy, schema, and evidence and fails closed.
Exactly one trusted in-memory counter proof is available behind
`VITE_KERNIQ_ENABLE_AGENTFUSE_PROOF=1`; ordinary production registration,
Patch integration, and Command integration are not included.

Local validation passed the frozen install, workspace build and 1,460 tests,
Desktop unit tests (54), Desktop E2E (56 passed, four credential-gated
scenarios skipped), canonical Python bridge tests (8), native Rust tests,
verified production archive extraction, debug Tauri build, and
`git diff --check`. A real isolated macOS x86_64 smoke installed the pinned
runtime, completed canonical self-check, proved allow dispatch once and deny
dispatch zero, persisted Session evidence, stopped without an orphan bridge,
and reverified after app restart. The system Python remained unchanged.

Draft PR CI run `30079631063` passed workspace build/test, canonical Python
bridge validation, Desktop E2E, and native Rust checks on macOS and Windows.

### KerniQ Decision Contract and Runtime Integrity Correction v0.6.0.1

**Date:** 2026-07-24  |  **Status:** Merged and frozen

The canonical Python package identity is corrected from the PR-only `3.5.1`
value to the SemVer-minor release identity `dhms-agentfuse 3.6.0`. Historical
DHMS evidence milestones `v3.5.1` and `v3.5.2` remain unchanged, as does
evidence schema `agentfuse-evidence-schema-v0.1`. Public decision behavior is
unchanged.

Added strict validators for approval, decision, started, and outcome records.
Malformed or duplicate allow decisions now become fail-closed decision errors
before an execution receipt or physical handler. Generic Action evidence now
persists `ACTION_DECIDED` independently before `ACTION_STARTED`; deny, hold,
and error settle without dispatch, while legacy `ACTION_DENIED` remains
readable. Patch and Command projection and execution behavior are unchanged.

Normal physical outcomes are committed to Action Runtime only after durable
settlement evidence succeeds. If settlement persistence fails after the handler
runs, the runtime returns `Interrupted/unknown_or_interrupted` with
`settlement_persistence_failed`, attempts durable interruption evidence, and
does not replay on duplicate execution. If that secondary append also fails,
restart recovery classifies the unmatched started receipt as Interrupted and
does not offer reapproval.

Managed runtime verification now compares full distribution, AgentFuse source,
and embedded bridge trees against compile-time manifest digests. Mutable
`installed-runtime.json` values are diagnostic metadata rather than trust
anchors. Source verification also requires AgentFuse package 3.6.0, the expected
evidence schema, and the public decision API before process launch.

The canonical pin advances to DHMS commit
`ec4b5842339dccfba0db62df7541920759203bc9`. The Python bridge calls public
`RuntimeGuard.evaluate()` and has no private policy resolver dependency. Its
one-shot hello/request/shutdown process enforces one 15-second bridge-session
deadline; separate startup and request deadlines are not claimed.

The verified canonical archive SHA-256 is
`1659d81d39aab382d550c33c3b6a42b24254f584055eb15d8168f17200e323c3`,
the promoted AgentFuse source tree SHA-256 is
`9a51121ec6a719bc7c79db428d522f3c4430d99d5f176b9e62a939bf004d32e9`,
and the normalized embedded bridge tree SHA-256 is
`52bd2dfd5fdd7eb183ed30d4fad56666cd19363fcce381a94ef77b3ac4a4a8dc`.

Local validation passed the frozen install, workspace build, 1,486 workspace
tests, Desktop unit tests (56), Desktop E2E (56 passed with four
credential-gated real-provider scenarios skipped), Action Runtime tests (35),
Session Runtime tests (73), Python Runtime tests (15), AgentFuse Adapter tests
(15), canonical bridge tests (8), and DHMS tests (89). Native validation passed
formatting, check, 35 Rust tests with two explicit maintenance tests ignored,
trusted-profile preparation from verified archives, and the debug Tauri build.
The workspace lint command completed successfully and reported that no selected
package defines a lint script. The private AgentFuse API source audit and
`git diff --check` both returned no matches or errors.

A real isolated macOS x86_64 Tauri smoke verified Ready state and canonical
self-check against AgentFuse commit
`ec4b5842339dccfba0db62df7541920759203bc9`. The allow proof durably wrote
`ACTION_DECIDED` before `ACTION_STARTED`, invoked and mutated exactly once, and
did not replay. Deny durably wrote `ACTION_DECIDED` with no start, handler, or
mutation. Injected settlement persistence failure left
`ACTION_COMPLETED` absent, returned `Interrupted/unknown_or_interrupted`, and
retained one invocation, one mutation, and zero replay. The SQLite ledger
retained the interrupted sequence and no replay occurred.

After stopping the bridge, the smoke modified canonical `runtime_guard.py` and
recalculated the mutable installed record. Restart still reported Broken and
withheld the proof dispatch surface. Two explicit Settings Repair attempts were
environment-blocked when the fixed CPython archive download was interrupted;
both left the Broken profile unchanged and promoted no temporary directory.
For restart verification, the single tampered file was restored from the
independently hash-verified DHMS archive whose extracted tree matched the
compile-time trusted source digest. The full app then reverified Ready and
passed canonical self-check. The initial user-initiated production install had
already completed against the same trusted manifest. Full app stop left zero
KerniQ or managed Python processes.

### KerniQ v0.6.0 Result Review and Freeze

**Date:** 2026-07-26  |  **Status:** Completed

DHMS PR #3 was merged first with merge commit
`e7ca9a0848497906b95047a0fe46640d27b32144`, followed by KerniQ PR #6 with
merge commit `3d333a30e4507e796aa97ddc0142606ad2e42587`. The pinned DHMS commit remains
`ec4b5842339dccfba0db62df7541920759203bc9`, package `3.6.0`, policy
`dhms-agentfuse-runtime-guard@3.6.0`, and schema
`agentfuse-evidence-schema-v0.1`.

Post-merge validation passed 89 DHMS tests, 1,486 KerniQ workspace tests, 35
Action Runtime tests, 73 Session Runtime tests, 15 Python Runtime tests, 15
AgentFuse Adapter tests, 8 Python bridge tests, 56 Desktop unit tests, 56
Desktop E2E scenarios with four credential-gated scenarios skipped, and 35
native Rust tests with two maintenance tests ignored. Ordinary and
proof-enabled debug Tauri builds passed. DHMS CI run `30191818461` and KerniQ
CI run `30192158944` passed.

A fresh isolated macOS Tauri smoke repeated user-initiated installation,
canonical self-check, allow, deny, settlement-fault, restart, and tamper
verification. The mutable installed record could not bless source tampering,
no temporary profile was promoted, and full shutdown left zero orphan
processes. Earlier environment-interrupted Repair attempts remain a documented
caveat; successful Repair under that interrupted network condition is not
claimed.

The final verdict is
`KERNIQ_V0_6_0_MANAGED_ACTION_RUNTIME_FOUNDATION_FROZEN`. v0.6.1 has not
started. Patch migration and Project Command migration have not started. The
full evidence record is
[`kerniq_v0_6_0_result_review_and_freeze.md`](kerniq_v0_6_0_result_review_and_freeze.md).

### KerniQ Project Command Action Runtime Adapter Planning v0.6.1

**Date:** 2026-07-26  |  **Status:** Planning ready for review; implementation not started

Audited the live Project Command path from provider tool declarations through
TypeScript catalog resolution, explicit Desktop approval, durable Session
receipts, Tauri invocation, Rust catalog re-resolution, direct no-shell process
execution, timeout/cancellation/output bounds, settlement persistence, and
restart recovery.

The proposed adapter keeps KerniQ as the trusted risk-classification, approval,
request/response identity, dispatch, and physical-execution owner. Action
Runtime validates the proposal, digest, approval, expiry, and generation. The
KerniQ bridge maps validated context into `ToolCallRequest`; AgentFuse evaluates
configured policy and returns canonical `allow|block` evidence; the KerniQ
adapter maps that response to `allow|deny|error`. The canonical Project Command
path does not support AgentFuse `hold`. Universal Action Runtime supplies
durable `ACTION_DECIDED`, dispatch gating, and duplicate prevention. Session
Runtime retains durable lifecycle, interruption, settlement uncertainty, and
restart no-replay.

The lifecycle decision is one physical command, one authoritative
`COMMAND_STARTED`, and one `COMMAND_COMPLETED` or `SESSION_INTERRUPTED`
settlement. Generic `ACTION_STARTED` / `ACTION_COMPLETED` are not planned for
the same command. Rust continues to independently resolve the command ID and
catalog digest and accepts no arbitrary executable, arguments, environment,
working directory, shell command, or caller-selected timeout.

The plan defines six future implementation slices, a 16-item threat model,
unit/integration/Desktop E2E coverage, and an isolated real Tauri proof.
Project Command migration, Patch migration, Session schema changes, managed
Python identity changes, and runtime implementation remain explicitly false.

Planning artifacts:

- [`kerniq_project_command_action_runtime_adapter_planning_v0_6_1.md`](kerniq_project_command_action_runtime_adapter_planning_v0_6_1.md)
- [`ADR-021`](../../qodex-config/adr/ADR-021-Project-Command-Action-Runtime-Adapter.md)

### KerniQ v0.6.1.1 Trusted Project Command Policy Contracts

**Date:** 2026-07-26  |  **Status:** Merged; not frozen

Added KerniQ-owned immutable policy metadata to every successfully discovered
trusted Project Command. The policy fixes action type
`kerniq.project-command.run`, risk `process`, approval `explicit_once`, maximum
timeout `120000`, and profile `kerniq-project-command-v1`. Project metadata,
model arguments, provider metadata, and command output cannot replace these
values.

Added a pure narrow `ProjectCommandActionParameters` contract and factory for
future Action proposal mapping. It carries only command ID, the unchanged
native catalog digest, command category, project binding ID, and project
fingerprint. It does not carry executable, arbitrary arguments, environment,
private root, cwd, caller timeout, model risk, or approval data.

This slice does not connect Action Runtime or AgentFuse, persist
`ACTION_DECIDED`, change `COMMAND_STARTED`, modify the native runner or Rust
catalog, change approval UI or Session schema, or migrate Project Command.
Project Command is not yet AgentFuse-protected. PR #9 merged through merge
commit `be32ca0caa764aa86e3de341557fedbc2acba0a5`.

### KerniQ v0.6.1.2 Project Command Proposal and Approval Mapping

**Date:** 2026-07-27  |  **Status:** Merged; not frozen

Added a pure Desktop integration mapper that creates one digest-bound
`ActionProposal` from a resolved trusted command, provider tool-call ID, Agent
task and Session identities, project binding, project fingerprint, and trusted
timestamp. The proposal binds the unchanged native catalog digest plus the
fixed policy profile and a SHA-256 digest of the exact deterministic
KerniQ-owned policy serialization.

Added explicit Session-to-Action approval-generation conversion. Session
generation `0` maps to Action generation `1`; invalid negative, fractional, or
unsafe generations fail closed. Before issuing an approval, the mapper
revalidates the proposal digest, exact Project Command action/risk/Session
identity, exact parameter keys, and fixed policy profile/digest through public
Action Runtime validation plus the Project Command validator.

This slice does not instantiate or mutate Action Runtime state, call
AgentFuse, persist `ACTION_DECIDED`, write Session events, invoke Tauri or the
native runner, change command dispatch, change `COMMAND_STARTED`, migrate
Project Command, or alter the Session schema. PR #10 merged through merge
commit `c201e32ec1dcb342e9b1fbbeace6315cb422bc99`.

### KerniQ v0.6.1.3 Project Command AgentFuse Decision Path

**Date:** 2026-07-27  |  **Status:** Merged through `ca005397b88534ba3663f1f19b0b539de0f94766`; not frozen

Added the fixed `kerniq-project-command-v1` bridge profile with policy digest
`sha256:9c01df377b0cfd8db8392dc8966a2f12b38ad1b2ab9c89780ac049ac0eed38ad`.
The managed Python bridge validates bounded proposal, approval, project, and
policy identity, maps only safe fields into `ToolCallRequest`, and calls public
`RuntimeGuard.evaluate()` without a handler. AgentFuse `allow|block` maps to
KerniQ `allow|deny`; bridge or validation failure maps to fail-closed `error`.
The canonical Project Command path does not support `hold`.

Because the managed bridge source is embedded and integrity-checked, its
trusted installed-tree SHA-256 advances from
`52bd2dfd5fdd7eb183ed30d4fad56666cd19363fcce381a94ef77b3ac4a4a8dc` to
`34e0633e303a0e2b5107832d42486503f7c1f55a0e717001d176345ecfbe9ef3`.
The managed Python runtime version, AgentFuse package/commit, bridge protocol,
and evidence schema remain unchanged.

Added a decision-only Desktop coordinator that validates proposal and approval,
requests one AgentFuse decision, validates it, and durably records one
command-linked `ACTION_DECIDED`. Session projection now binds that event to the
pending command's action, task, approval ID/generation, and proposal digest.
Allow remains decision-ready and unstarted; deny/error block start; duplicate,
mismatched, early, and hold decisions reject. Persistence or cancellation
failure returns no dispatchable in-memory allow.

This slice did not call `ActionRuntime.execute`, write `COMMAND_STARTED` or
`COMMAND_COMPLETED`, invoke Tauri or the native runner, modify Rust, migrate
SQLite, or change the Session schema version. Physical execution was
intentionally left to v0.6.1.4.

PR #11 was corrected to require the exact durable `COMMAND_APPROVED` identity
before the bridge, revalidate approval after AgentFuse, bound `decidedAt` to
the approval window, and avoid caching failed decisions. It merged through
merge commit `ca005397b88534ba3663f1f19b0b539de0f94766`.

### KerniQ v0.6.1.4 Live Project Command Decision Gate and Native Dispatch Binding

**Date:** 2026-07-27  |  **Status:** Merged; not frozen

Connected the real Desktop Project Command approval and recovery flows to the
merged decision coordinator. The live path creates the proposal from the exact
provider tool-call, task, Session, trusted resolved command, project binding,
project fingerprint, and trusted clock. A five-minute KerniQ-owned approval TTL
binds one fresh approval ID to the current Session approval generation.

The durable order is `COMMAND_PROPOSED`, `COMMAND_APPROVED`,
`ACTION_DECIDED allow`, `COMMAND_STARTED`, then the existing
`COMMAND_COMPLETED` or interruption lifecycle. Only the current persisted allow
can cross the start barrier. AgentFuse deny/error, approval expiry,
cancellation before start, approval/decision/start persistence failure, stale
identity, and duplicate approval produce no native dispatch. Human denial
remains `COMMAND_DENIED` and makes no AgentFuse request.

The existing native request remains `runId`, authorized project root,
`commandId`, and `catalogDigest`. Rust catalog re-resolution, digest and
authorized-root checks, direct no-shell spawn, cleared/allowlisted environment,
null stdin, timeout, cancellation, and bounded output are unchanged. No generic
`ACTION_STARTED` or `ACTION_COMPLETED` events were added.

The accurate product claim is limited to the bounded native Desktop Project
Command path. Other environments and Patch, Git, MCP, browser, file-write, and
arbitrary-shell actions are not claimed as AgentFuse-protected. Fault and
recovery hardening remained the next v0.6.1.5 slice at merge time.

PR #12 was corrected to bind `COMMAND_STARTED` to the exact durable allow
decision and immutable trusted command snapshot. It merged through merge commit
`a36503f198c016daa1f6c1c8f2af1d894c0e95ef`.

### KerniQ v0.6.1.5 Project Command Fault and Recovery Hardening

**Date:** 2026-07-27  |  **Status:** Merged through `c5e214a43f9102c23f9c0a973782d227606a5c2b`; not frozen

Added deterministic fault, cancellation, duplicate, restart, drift, timeout,
bounded-result, and cache-lifecycle coverage around the merged Project Command
path. Persistence failures before `COMMAND_STARTED` remain zero-dispatch.
Settlement persistence failure records interruption when possible and retains
started evidence as unknown or interrupted without automatic replay.

The tests exposed and corrected three bounded defects. Recovery now discards an
unstarted pre-restart allow so a fresh approval generation and AgentFuse
decision can be recorded. Terminal, denied, cancelled, and failed live command
paths release proposal and decision caches. Native runner rejection is reduced
to a generic model-visible failure instead of forwarding raw diagnostics.

The native Rust runner, managed Python bridge, package manifests, workflow,
lockfile, and Session schema version were unchanged. Timeout and output
properties remained unit-fixture and existing Rust-test evidence only at this
slice. PR #13 merged by merge commit after all five CI jobs and post-merge
validation passed.

### KerniQ v0.6.1.6 Project Command Real Tauri Proof

**Date:** 2026-07-29  |  **Status:** Merged through `4eb7c24c493b0fc135a750f07ed46cbb86ddd461`

Added a dual-gated development harness that drives the actual Tauri application,
native directory picker, SQLite Session store, managed Python bridge, pinned
AgentFuse source, public `RuntimeGuard.evaluate()`, `agentfuse_decide` IPC,
`run_project_command` IPC, Rust catalog re-resolution, and direct no-shell
fixture process. The ordinary build does not render the proof UI.

The isolated macOS x86_64 matrix proved one durable allow-to-completion
lifecycle; human deny with zero AgentFuse requests; a canonical proof-only block
with zero native dispatch; zero dispatch when `ACTION_DECIDED` or
`COMMAND_STARTED` persistence was rejected; honest interruption when
`COMMAND_COMPLETED` persistence was rejected after one physical execution; and
zero provider, policy, or native replay after a real restart.

An allowed-but-unstarted restart projected `RecoveryRequired`, incremented the
approval generation, and cleared the old approval and decision authority.
Nearly concurrent approval calls produced one approval, policy request,
decision, start, physical invocation, and completion. The actual runner
coalesced a same-identity active `runId` and rejected identity transfer.

The first real allow attempt exposed a bounded Tauri integration defect:
native request validation accepted only the older trusted proof fixture and
rejected the already merged frozen Project Command profile/digest before
Python. The correction admits exactly one trusted fixture or exactly the fixed
profile/digest pair and rejects unknown, incomplete, or ambiguous selection.
A Rust regression test covers the corrected boundary. AgentFuse source,
managed Python bridge, bridge digest, Session schema, command catalog, package
manifests, workflow, and lockfile remain unchanged.

The supported claim is limited to the controlled native Desktop Project Command
lifecycle. It does not cover browser execution, Patch, Git, MCP, Office,
provider actions, arbitrary shell, every project script, or permanent global
exactly-once behavior for arbitrary direct IPC callers. Evidence and freeze
preparation are recorded in:

- [`kerniq_project_command_real_tauri_proof_v0_6_1_6.md`](kerniq_project_command_real_tauri_proof_v0_6_1_6.md)
- [`kerniq_v0_6_1_project_command_result_review_and_freeze.md`](kerniq_v0_6_1_project_command_result_review_and_freeze.md)

Final branch validation passed frozen install, workspace build, all 1,605
workspace tests, focused Agent (100), Action (35), AgentFuse Adapter (25),
Session (88), and Desktop (139) suites, and Desktop E2E with 56 passed plus
four credential-gated skips. Python bridge validation passed 15 tests with two
canonical-source-gated skips and compileall. Cargo formatting/check passed;
native tests passed 35 with two explicit maintenance tests ignored. Ordinary
and proof-enabled Tauri debug builds passed, the ordinary artifact contained no
proof UI, and `git diff --check` plus privacy/secret scanning passed.

PR #14 was corrected with a docs-only evidence-anchor commit, reviewed at
`1d600e7eb4493c7f7e41b7f6fea22ba907c94d4e`, and merged with an exact-head
guard. Its corrected CI run `30389533518` and post-merge CI run `30389964085`
both passed all five jobs. The merge tree is identical to the reviewed head
tree.

### KerniQ v0.6.1 Project Command Final Freeze Activation

**Date:** 2026-07-29  |  **Status:** Active and merged through `7c594b05293e7d151c536a7b37f2f88b95135263`

Recorded the exact v0.6.1.1 through v0.6.1.6 merge chain, real proof execution
code head, frozen AgentFuse identity, bounded native Desktop Project Command
scope, and explicit non-claims in
[`kerniq_v0_6_1_project_command_final_freeze.md`](kerniq_v0_6_1_project_command_final_freeze.md).

PR #15 was reviewed at `1328f40cf9caef1bb8f452553afcc9b2e5a9258d`,
merged as `7c594b05293e7d151c536a7b37f2f88b95135263`, and passed post-merge
CI run `30431723082`. The active verdict is
`KERNIQ_V0_6_1_PROJECT_COMMAND_AGENTFUSE_GATE_FROZEN`. No next implementation
milestone has started.

The follow-up activation PR was reviewed at
`12bd8dfb618b03ce86b3b547427087f7fe7bc5e3`, merged as
`0486704d613ea203672d75bee455346cceafb225`, and passed post-merge CI run
`30432376199`. The merge tree matched the reviewed head.

### KerniQ v0.7 Coding Pack Product Integration Planning

**Date:** 2026-07-29  |  **Status:** Planning-only Draft PR; implementation not started

Audited Project Runtime, Context Engine, Desktop project access and UI, Action
Runtime, Session Runtime and SQLite persistence, and Git checkpoints. The only
direct Coding Pack implementation reference is the product roadmap; no
`CodingPack` contracts, generator, manifest, preview/export UI, durable pack
store, staleness check, receipt, or pack tests exist.

The planning result is `CURRENT_CODING_PACK_STATE=PLANNED_ONLY`. The
[v0.7 plan](kerniq_v0_7_coding_pack_product_integration_planning.md) and
[ADR-022](../../qodex-config/adr/ADR-022-Coding-Pack-Product-Integration.md)
define a deterministic manifest, explicit write/export authorization, a
dedicated authoritative export lifecycle, privacy controls, 31-threat model,
six bounded implementation slices, and real Desktop proof plan. The portable
manifest excludes local binding and private-root-derived identity; read-only
selection uses ordinary project/privacy controls, while future physical export
requires a durable, separately versioned AgentFuse decision before start and
same-filesystem atomic promotion.

No v0.7 implementation, Session schema, workflow, package, test, runtime,
Project Command freeze, Patch, Git, MCP, browser-native access, or arbitrary
shell behavior changed. The GitHub Actions Node 20 deprecation annotation is
recorded for a separate maintenance PR.

### KerniQ v0.7.1 Coding Pack Contracts and Deterministic Portable Manifest

PR #17 planning merged through merge commit
`46ae1d405a5519477de7da3d1eba51c7e0ae5640`. PR #18 merged v0.7.1 through merge
commit `d01ad3b71a83efe906c262fa466417d325969946` as the browser-safe,
zero-runtime-dependency `@qodex/coding-pack-runtime` package.

The slice adds portable and local identity type separation, strict
project-relative path contracts, fatal UTF-8 validation, exact-byte SHA-256
source evidence, fixed selection limits, UTF-8-byte-ordered canonical JSON,
deterministic `sourceFingerprint` and `packId`, instance `manifestDigest`,
deep-frozen manifests, canonical serialization, and verification that
recomputes identity and bounds. Portable exclusion details reject absolute
paths, local binding IDs, private-root fingerprints, and destination identity.
Before merge, the portable source contract was corrected from unrestricted
`inclusionReason` text to the machine-readable `inclusionReasonCode`; selection
rules versions and exclusion reason codes use the same portable metadata
privacy boundary. All externally supplied portable strings reject ill-formed
UTF-16 before UTF-8 comparison, hashing, or serialization, and RFC 3339
`-00:00` is rejected because it does not identify a known offset.

The package has 126 focused tests including
privacy sentinels, order independence, root/label separation, malformed paths,
valid non-BMP ordering, malformed UTF-16, CRLF/LF identity, zero-byte input,
caller immutability, bounds, and tampering.

```text
PRE_MERGE_CONTRACT_CORRECTION=true
BACKWARD_COMPATIBILITY_REQUIRED=false
PORTABLE_INCLUSION_REASON_FREE_TEXT=false
INCLUSION_REASON_MACHINE_CODE=true
SELECTION_RULES_VERSION_PORTABLE_IDENTIFIER=true
ILL_FORMED_UTF16_ACCEPTED=false
PROJECT_LABEL_AUTOMATIC_LOCAL_COPY=false
```

This slice performs no filesystem discovery, `.gitignore` parsing, secret
scanning, UI, persistence, export, native command, Action Runtime, AgentFuse,
Session, network, or Project Command work. The v0.6.1 Project Command freeze
and GitHub workflows are unchanged.

### KerniQ v0.7.2 Deterministic Selection and Privacy Classification Core

v0.7.2 is implemented for review in a Draft PR as a pure extension of
`@qodex/coding-pack-runtime`. `selectCodingPackSources` accepts only an explicit
caller-supplied array of project-relative paths and exact `Uint8Array` bytes.
It validates candidate identities without eagerly copying bytes, rejects
duplicate and conservatively cross-platform-colliding paths, sorts by exact
UTF-8 bytes, applies non-overridable private, credential, generated, vendor,
binary, explicit, and fixed `project_ignore` rules before decoding, then
enforces per-file, 5,000-candidate, 50 MiB eligible-input, file-count, and
aggregate-pack budgets. Oversized files are not decoded. Invalid UTF-8 is an
exclusion; unexpected contract errors fail the selection.

The result binds purpose, selection-rules version, `sourceFingerprint`, and
`packId` to deep-frozen manifest-compatible evidence, exclusions, empty bounded
warnings, and aggregate totals. `createCodingPackManifestFromSelection`
runtime-verifies that complete result and prevents independent purpose or rules
substitution. The same internal canonical identity implementation serves
selection, manifest creation, and both verification paths.

Portable paths use structural field separation rather than rejecting English
identity keywords in legitimate relative filenames. Every segment rejects
Windows-forbidden characters, reserved device names, trailing dots/spaces, and
more than 255 UTF-8 bytes. Case collision checks are a conservative ECMAScript
Unicode casing heuristic, not a universal filesystem-equivalence proof.

The package now has 205 focused tests covering selection/manifest identity
binding, result verification and tampering, fixed ignore provenance, safe
keyword filenames, Windows-portable segments, bounded candidate work,
oversized no-decode behavior, order independence, collisions, UTF-8, deep
immutability, privacy sentinels, and deterministic budget overflow.

```text
V0_7_1_MERGED=true
CODING_PACK_SELECTION_CORE_IMPLEMENTED=true
SELECTION_PURPOSE_BOUND=true
SELECTION_RULES_VERSION_BOUND=true
SELECTION_SOURCE_IDENTITY_BOUND=true
PROJECT_IGNORE_REASON_CALLER_CONTROLLED=false
SAFE_RELATIVE_FILENAME_KEYWORDS_ALLOWED=true
CANDIDATE_COUNT_BOUNDED=true
ELIGIBLE_CANDIDATE_BYTES_BOUNDED=true
ALL_CANDIDATE_BYTES_EAGERLY_COPIED=false
OVERSIZED_FILE_DECODED=false
AUTHORIZED_PROJECT_DISCOVERY_CONNECTED=false
GITIGNORE_PARSER_IMPLEMENTED=false
CONTENT_SECRET_SCANNING_IMPLEMENTED=false
PATH_BASED_PRIVACY_CLASSIFICATION_IMPLEMENTED=true
SECRET_ABSENCE_PROVEN=false
CODING_PACK_UI_IMPLEMENTED=false
CODING_PACK_STORE_IMPLEMENTED=false
CODING_PACK_EXPORT_IMPLEMENTED=false
ACTION_RUNTIME_CONNECTED=false
AGENTFUSE_CONNECTED=false
SESSION_SCHEMA_CHANGED=false
PROJECT_COMMAND_FREEZE_CHANGED=false
PATCH_MIGRATED=false
ARBITRARY_FILE_READ_ADDED=false
ARBITRARY_FILE_WRITE_ADDED=false
ARBITRARY_SHELL_ADDED=false
WORKFLOW_CHANGED=false
```
