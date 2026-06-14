# KerniQ

**English** | [中文](README.zh-CN.md)

> Desktop-first, multi-model, skill-enabled, MCP-compatible, diff-first AI coding agent.

**Codex Workflow, Any Model, Skills Included.**

KerniQ was previously known as Qodex. Releases up to and including
v0.2.0-beta.1 may still reference the Qodex name.

![Beta](https://img.shields.io/badge/status-beta-blue)
![License](https://img.shields.io/badge/license-MIT-blue)
![Tests](https://img.shields.io/badge/tests-887%20passing-green)
![Platform](https://img.shields.io/badge/platform-Desktop%20(Tauri)-purple)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)
![Built With](https://img.shields.io/badge/built%20with-Tauri%20%7C%20React-cyan)

---

## What is KerniQ?

KerniQ is an AI coding agent that follows the Codex workflow philosophy while remaining **provider-agnostic**. Unlike tools locked to a single model vendor, KerniQ supports OpenAI, DeepSeek, OpenRouter, and any OpenAI-compatible endpoint through a unified Provider SDK.

**Why KerniQ?** Existing AI coding tools (Codex, Cursor, Claude Code) are typically tied to specific models. KerniQ decouples the coding workflow from any single provider — you can switch models without changing your workflow.

**Key architectural differences:**

| vs Codex | vs Cursor | vs Claude Code |
|:--|:--|:--|
| Multi-provider SDK | Modular 9-package architecture | Permissive MIT license |
| Independent Skill Runtime | Dedicated MCP Runtime | Multi-Agent orchestration |
| Formal Context Engine | Diff Engine with rollback | Git Checkpoint system |

---

## Features

| Feature | Description |
|:--|:--|
| **Provider SDK** | Unified interface for OpenAI, DeepSeek, OpenRouter, and custom endpoints |
| **Context Engine** | Structured prompt assembly: Rules → Memory → Skills → Metadata → Files → Task |
| **Agent Runtime** | Task lifecycle with streaming, cancellation, and event bus |
| **Diff Engine** | Safe patch-based editing — model never writes files directly |
| **Git Runtime** | Checkpoints, commits, branches, restore — no Git knowledge required |
| **Skill Runtime** | Domain-specific guidelines via markdown skills, keyword resolution |
| **MCP Runtime** | External tool discovery with permission-gated execution |
| **Multi-Agent Runtime** | Coordinator + 4 specialists (Review, Refactor, Research, Testing) |
| **Project Runtime** | Open local projects, build file trees, read and select files |

---

## Architecture

```
User Input → ContextEngine → MultiAgentRuntime → AgentRuntime → Provider SDK
               ↓                  ↓                   ↓
             Skills             Planner            Streaming
             Memory          Review/Refactor/         ↓
            Metadata       Research/Testing       DiffEngine
              Files            Agents            Patch Proposal
                                 ↓                   ↓
                             Aggregated          Apply/Reject
                               Report                ↓
                                                  Git Checkpoint
```

---

## Repository Structure

```
qodex/                  ← legacy repository name
├── apps/desktop/           ← Tauri + React desktop UI
├── packages/
│   ├── provider-sdk/       ← Model provider abstraction (35 tests)
│   ├── agent-runtime/      ← Task execution orchestration (50 tests)
│   ├── project-runtime/    ← File system access (41 tests)
│   ├── context-engine/     ← Context assembly pipeline (57 tests)
│   ├── diff-engine/        ← Patch generation & apply (95 tests)
│   ├── git-runtime/        ← Git operations & checkpoints (123 tests)
│   ├── skill-runtime/      ← Skill loading & resolution (131 tests)
│   ├── mcp-runtime/        ← MCP tool management (160 tests)
│   └── multi-agent-runtime/ ← Multi-agent orchestration (195 tests)
├── docs/                   ← Specifications, guides, development logs
└── qodex-config/           ← AI agent workspace (rules, memory, ADRs, skills)
```

> **Legacy compatibility:** The `@qodex/*` package scope, `qodex-config/`, and
> related persisted identifiers remain unchanged during the KerniQ brand
> migration to avoid breaking existing integrations and local data.

---

## Quick Start

```bash
# Requirements: Node.js 18+, pnpm 9+
pnpm install
cd apps/desktop && pnpm dev
```

Open http://localhost:1420.

Full guide: [QUICK_START.md](docs/QUICK_START.md)

---

## Test Suite

```bash
pnpm -r test
```

**887+ tests** across 9 packages — all passing.

---

## Documentation

| Document | Description |
|:--|:--|
| [Quick Start](docs/QUICK_START.md) | Get running in 10 minutes |
| [Installation](docs/INSTALLATION.md) | Setup for macOS / Windows / Linux |
| [Architecture](docs/ARCHITECTURE.md) | Deep dive into all 9 packages |
| [Dev Log](docs/development/DEVLOG.md) | Complete development history |
| [ADR Records](qodex-config/adr/) | Architecture Decision Records |
| [Release Notes](docs/development/RELEASE_NOTES_v0.2.0-beta.1.md) | v0.2.0-beta.1 changelog |

---

## Roadmap

**Completed (M0–M10):**

Provider SDK · Project Runtime · Context Engine · Agent Runtime · Diff Engine · Git Runtime · Skill Runtime · MCP Runtime · Multi-Agent Runtime

**Planned:**

| Milestone | Description | Status |
|:--|:--|:--:|
| M11 | Planning & Execution Runtime | ⬜ Tentative |
| M12 | Execution Graph | ⬜ Tentative |
| M13 | Internationalization | ⬜ Tentative |
| M14 | Marketplace Foundation | ⬜ Tentative |

---

## For Contributors

- Setup: `pnpm install && cd apps/desktop && pnpm dev`
- Tests: `pnpm -r test`
- ADRs: `qodex-config/adr/`
- See [CONTRIBUTING.md](CONTRIBUTING.md) for full details

---

## License

MIT — see [LICENSE](LICENSE).
