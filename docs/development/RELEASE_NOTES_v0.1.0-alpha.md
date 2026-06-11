# Qodex v0.1.0-alpha — Release Notes

**Release Date:** 2026-06-12
**Version:** 0.1.0-alpha
**Status:** Alpha Release Freeze

---

## Overview

Qodex is a desktop-first, multi-model, skill-enabled, MCP-compatible, diff-first AI coding agent. This alpha release marks the completion of all 10 foundational milestones (M0–M10).

**Core philosophy:** Codex Workflow, Any Model, Skills Included.

---

## Milestones Completed

| # | Milestone | Key Delivery |
|:--:|:--|:--|
| M0 | Repository Bootstrap | Monorepo structure, docs organization |
| M1 | Desktop Shell | Tauri + React 3-column UI, dark glassmorphism |
| M2 | Provider SDK | ModelProvider abstraction, 4 providers |
| M3 | Agent Runtime | Task state machine, event bus |
| M4 | Project Runtime | File tree, read, index, select |
| M5 | Context Engine | Rules → Memory → Skills → Metadata → Files → Task |
| M6 | Diff Engine | Patch proposal, apply/reject/rollback |
| M7 | Git Runtime | Checkpoints, commits, branches, restore |
| M8 | Skill Runtime | Loader, registry, keyword resolver, context injection |
| M9 | MCP Runtime | Tool registry, permission engine, mock transport |
| M10 | Multi-Agent Runtime | Coordinator, planner, 4 specialists, report aggregation |

---

## Packages

| Package | Path | Tests | Purpose |
|:--|:--|:--:|:--|
| `provider-sdk` | `packages/provider-sdk` | 35 | Model provider abstraction |
| `project-runtime` | `packages/project-runtime` | 41 | File system access |
| `context-engine` | `packages/context-engine` | 57 | Context assembly pipeline |
| `agent-runtime` | `packages/agent-runtime` | 50 | Task execution orchestration |
| `diff-engine` | `packages/diff-engine` | 95 | Patch generation & apply |
| `git-runtime` | `packages/git-runtime` | 123 | Git operations & checkpoints |
| `skill-runtime` | `packages/skill-runtime` | 131 | Skill loading & resolution |
| `mcp-runtime` | `packages/mcp-runtime` | 160 | MCP tool management |
| `multi-agent-runtime` | `packages/multi-agent-runtime` | 195 | Multi-agent orchestration |

**Desktop app:** `apps/desktop` (Tauri + React)

---

## Test Results

| Suite | Tests | Status |
|:--|:--:|:--:|
| Unit tests (9 packages) | 860 | ✅ |
| Production reviews (M5–M10) | 6 | ✅ All passed |
| Alpha integration tests | 27 | ✅ |
| **Total** | **887** | **✅ ALL PASS** |

**Known defects:** 0

---

## Architecture Diagram

```
User Input → ContextEngine → MultiAgentRuntime → AgentRuntime → Provider SDK
                ↓                  ↓                   ↓
              Skills             Planner           ModelProvider
              Memory         Review/Refactor/    Streaming Output
              Metadata       Research/Testing       ↓
              Files          Agents              DiffEngine
                                  ↓              Apply/Reject
                              Aggregated             ↓
                                Report           GitRuntime
                                                 Checkpoint
```

---

## Key Features

- **Provider-agnostic**: OpenAI, DeepSeek, OpenRouter, Custom (all via unified SDK)
- **Multi-agent**: Coordinator + 4 specialists (Review, Refactor, Research, Testing)
- **Safe editing**: Diff-first — model never writes files directly
- **Recoverable**: Git checkpoints with full restore
- **Extensible**: Skills (markdown-based) and MCP tools (permission-gated)
- **Local-first**: All data stays on machine — no cloud dependency
- **Dark glassmorphism UI**: Professional, text-first design

---

## Known Limitations

| Area | Limitation | 
|:--|:--|
| **Provider integration** | All provider tests use mock responses; no real API calls |
| **File system writes** | Diff apply is in-memory in browser dev mode; needs Tauri backend |
| **Git CLI** | MockGitAdapter only; no real `git` subprocess |
| **Skill loader** | Built-in skills only; no file system skill reader |
| **MCP transport** | MockTransport only; StdioTransport throws in browser |
| **Multi-agent** | Agents use mock outputs; no real AI model integration |
| **UI E2E tests** | No Playwright/Cypress tests for browser UI |
| **Persistence** | All stores are in-memory; no SQLite database yet |

---

## Next Milestone

**M11 — Planning & Execution Runtime**

Planned features:
- Real provider integration with actual API calls
- File system write path via Tauri
- Git CLI adapter for real repositories
- AI-powered task decomposition
- UI end-to-end test suite
- Persistent storage with SQLite

---

## Release Artifacts

```
docs/development/
├── DEVLOG.md                          — Full development log
├── ALPHA_INTEGRATION_REVIEW.md        — Alpha review results
└── RELEASE_NOTES_v0.1.0-alpha.md      — This file

qodex-config/
├── rules.md                           — AI agent rules
├── memory.md                          — Session memory
├── adr/ADR-001.md  ...  ADR-010.md   — Architecture Decision Records
└── skills/                            — Built-in skills (3)
```

---

*Qodex v0.1.0-alpha — Copyright © 2026. All rights reserved.*
