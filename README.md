# KerniQ

<p align="center">
  <img src="docs/assets/kerniq-logo.png" alt="KerniQ" width="520">
</p>

**English** | [中文](README.zh-CN.md)

> Desktop-first, multi-model, skill-enabled, MCP-compatible, diff-first AI coding agent.

**Codex Workflow, Any Model, Skills Included.**

KerniQ was previously known as Qodex. Releases up to and including
v0.2.0-beta.1 may still reference the Qodex name.

![Beta](https://img.shields.io/badge/status-beta-blue)
![License](https://img.shields.io/badge/license-MIT-blue)
![Tests](https://img.shields.io/badge/tests-1210%20passing-green)
![Platform](https://img.shields.io/badge/platform-Desktop%20(Tauri)-purple)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)
[![CI](https://github.com/MkaliezZ/qodex/actions/workflows/ci.yml/badge.svg)](https://github.com/MkaliezZ/qodex/actions/workflows/ci.yml)
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
| **Diff Engine** | User-approved patches for selected local text files, with stale-content checks, verified writes, and session rollback |
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
│   ├── provider-sdk/         ← Model provider abstraction (35 tests)
│   ├── agent-runtime/        ← Task execution orchestration (50 tests)
│   ├── project-runtime/      ← File system access (41 tests)
│   ├── context-engine/       ← Context assembly pipeline (57 tests)
│   ├── diff-engine/          ← Patch generation & apply (95 tests)
│   ├── git-runtime/          ← Git operations & checkpoints (123 tests)
│   ├── planning-runtime/     ← Task planning & dependencies (105 tests)
│   ├── execution-graph-runtime/ ← Graph-based execution (78 tests)
│   ├── i18n-runtime/         ← Internationalization (35 tests)
│   ├── marketplace-runtime/  ← Skill marketplace & registry (85 tests)
│   ├── skill-runtime/        ← Skill loading & resolution (131 tests)
│   ├── mcp-runtime/          ← MCP tool management (160 tests)
│   └── multi-agent-runtime/  ← Multi-agent orchestration (195 tests)
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

**1,210+ tests** across 14 packages — all passing.

## Minimal Agent Loop v0.4

KerniQ can run a bounded multi-turn coding-agent loop with verified
OpenAI-compatible providers. Agent Mode can search eligible project text,
read bounded file ranges, propose existing-file patches, and return approved
project test results to the model for a limited failure-to-fix iteration.

Two separate approval boundaries remain mandatory:

- Source changes use `KERNIQ_PATCH_V1`, an exact Diff Viewer, explicit Apply or
  Reject, stale-content checks, and write readback verification.
- Project commands must come from the trusted `package.json` or Cargo catalog.
  Every execution displays the exact executable, arguments, relative working
  directory, and source before a one-time Approve or Deny decision.

Applied patches are retained in per-task memory so the latest patch or all task
patches can be rolled back in reverse order with conflict and readback checks.

Agent Mode is deliberately constrained. Cataloged project scripts are not an OS
sandbox and may have side effects. KerniQ does not provide an arbitrary terminal,
automatic approval, new-file creation, file deletion, automatic Git commits,
MCP tools, or persistent task history in v0.4. Native command execution is
desktop-only; browser mode keeps read tools, approved patches, and rollback but
returns an explicit unsupported result for commands. Tool-agent support is
limited to verified OpenAI-compatible providers and models.

## Real Patch Loop v0.3

KerniQ supports a first real model-to-file patch loop for selected existing local
text files. A configured model may return a versioned `KERNIQ_PATCH_V1` proposal;
KerniQ parses and validates it, shows the generated unified diff, and writes only
after explicit approval. Applied changes are re-read for verification and can be
rolled back to their exact original contents during the current app session.

This flow is approval-driven, not autonomous. It does not create or delete files
or persist rollback data across app restarts.

In Tauri desktop mode, KerniQ uses the native directory dialog and grants file
access only to the project directory selected for that session. Browser
development mode keeps the File System Access API fallback. Both modes replace
only selected existing text files through the same Diff Engine approval flow.
Project selection and rollback history are not persisted across restarts, and
installer artifacts are not yet published.

---

## Documentation

| Document | Description |
|:--|:--|
| [Quick Start](docs/QUICK_START.md) | Get running in 10 minutes |
| [Installation](docs/INSTALLATION.md) | Setup for macOS / Windows / Linux |
| [Architecture](docs/ARCHITECTURE.md) | Deep dive into all 14 packages |
| [Dev Log](docs/development/DEVLOG.md) | Complete development history |
| [ADR Records](qodex-config/adr/) | Architecture Decision Records |
| [Release Notes](docs/development/RELEASE_NOTES_v0.2.0-beta.2.md) | v0.2.0-beta.2 changelog |

---

## Roadmap

**Completed (M0–M15.2):**

Provider SDK · Project Runtime · Context Engine · Agent Runtime · Diff Engine · Git Runtime · Skill Runtime · MCP Runtime · Multi-Agent Runtime · Planning Runtime · Execution Graph Runtime · i18n Runtime · Marketplace Runtime · Brand Migration · CI Pipeline

**Next:** installer workflow, Stage 2 namespace cleanup, and v0.2.0-beta.3 / v0.3 planning.

---

> **Status note:** KerniQ was formerly Qodex. Brand migration, logo/icon assets, TypeScript build fixes, and GitHub Actions CI are complete. Installer/release artifact workflow is not yet configured. Stage 2 internal namespace rename is not included in this release.

---

## For Contributors

- Setup: `pnpm install && cd apps/desktop && pnpm dev`
- Tests: `pnpm -r test`
- ADRs: `qodex-config/adr/`
- See [CONTRIBUTING.md](CONTRIBUTING.md) for full details

---

## License

MIT — see [LICENSE](LICENSE).
