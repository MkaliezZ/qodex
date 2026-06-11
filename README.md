# Qodex

> Desktop-first, multi-model, skill-enabled, MCP-compatible, diff-first AI coding agent.

**Codex Workflow, Any Model, Skills Included.**

Qodex is an AI coding agent that follows the Codex workflow philosophy while remaining **provider-agnostic**. Unlike tools locked to a single model vendor, Qodex supports OpenAI, DeepSeek, OpenRouter, and any OpenAI-compatible endpoint through a unified Provider SDK.

---

## Features

| Feature | Description |
|:--|:--|
| **Provider SDK** | Unified interface for OpenAI, DeepSeek, OpenRouter, Custom — all models through one API |
| **Context Engine** | Structured prompt assembly: Rules → Memory → Skills → Metadata → Files → Task |
| **Agent Runtime** | Task lifecycle management with streaming, cancellation, and event bus |
| **Diff Engine** | Safe patch-based editing — model never writes files directly |
| **Git Runtime** | Checkpoints, commits, branches, restore — no Git knowledge required |
| **Skill Runtime** | Domain-specific guidelines via markdown skills with deterministic keyword resolution |
| **MCP Runtime** | External tool discovery and permission-gated execution |
| **Multi-Agent Runtime** | Coordinator + 4 specialists (Review, Refactor, Research, Testing) with report aggregation |
| **Project Runtime** | Open local projects, build file trees, read and select files |

---

## Architecture Diagram

```
User Input
    │
    ▼
ContextEngine
  Rules → Memory → Skills → Metadata → Files → Task
    │
    ▼
MultiAgentRuntime
  Coordinator → Planner → Review/Refactor/Research/Testing
    │
    ▼
AgentRuntime (Task State Machine + Event Bus)
    │
    ▼
Provider SDK → Model (OpenAI / DeepSeek / etc.)
    │
    ▼
DiffEngine → PatchProposal → Apply / Reject / Rollback
    │
    ▼
GitRuntime → Checkpoint → Commit → Restore
```

---

## Repository Structure

```
Qodex/
├── apps/desktop/           ← Tauri + React desktop UI
├── packages/
│   ├── provider-sdk/       ← Model provider abstraction
│   ├── agent-runtime/      ← Task execution orchestration
│   ├── project-runtime/    ← File system access
│   ├── context-engine/     ← Context assembly pipeline
│   ├── diff-engine/        ← Patch generation & apply
│   ├── git-runtime/        ← Git operations & checkpoints
│   ├── skill-runtime/      ← Skill loading & resolution
│   ├── mcp-runtime/        ← MCP tool management
│   └── multi-agent-runtime/ ← Multi-agent orchestration
├── docs/                   ← Specifications & development logs
└── qodex-config/           ← AI agent workspace
```

---

## Quick Start

```bash
# Requirements: Node.js 18+, pnpm 9+
pnpm install
cd apps/desktop && pnpm dev
```

Open http://localhost:1420 in your browser.

Full guide: `docs/QUICK_START.md`

---

## Test Suite

```bash
pnpm -r test
```

887+ tests across 9 packages.

---

## Status

**Alpha release — v0.1.0-alpha**

10 milestones complete. 9 packages. 887 tests. Zero defects.

Full history: `docs/development/DEVLOG.md`

---

## License

MIT — see `LICENSE` file.

---

## Contributing

See `CONTRIBUTING.md`.
