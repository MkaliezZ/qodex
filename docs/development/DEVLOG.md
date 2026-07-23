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

**Date:** 2026-07-24  |  **Status:** Implementation complete, final review and CI pending

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
