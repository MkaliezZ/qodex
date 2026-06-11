# Qodex Agent Startup Guide

## Purpose

This document is the first file an AI coding agent should read before starting development.

Target agents:

- Codex
- Claude Code
- OpenClaw
- Cursor Agent
- Cline
- DeepSeek Agent

---

# Repository Location

Expected local path:

```text
~/Desktop/Qodex
```

Repository root:

```text
Desktop/Qodex
```

---

# Mandatory Reading Order

Before writing any code, read the following:

```text
docs/01_product/
docs/02_architecture/
docs/03_engineering/
docs/04_core_protocols/
docs/05_ui/
.qodex/rules.md
.qodex/memory.md
.qodex/adr/
```

Do not start implementation until all documents are indexed.

---

# Project Mission

Qodex is:

- Desktop-first
- Multi-model
- Skill-enabled
- MCP-compatible
- Diff-first

Core philosophy:

> Codex Workflow, Any Model, Skills Included.

Qodex is NOT:

- A chatbot wrapper
- An IDE replacement
- OpenAI-only

---

# Architecture Rules

Must use:

```text
Tauri
React
TypeScript
SQLite
Drizzle ORM
pnpm Workspace
```

Must support:

```text
OpenAI
DeepSeek
OpenRouter
Custom OpenAI-Compatible
```

Future support:

```text
Claude
Gemini
Qwen
GLM
MiniMax
MiMo
Kimi
Grok
Ollama
```

---

# Non-Negotiable Rules

1. Never write files directly.
2. All modifications go through Diff Engine.
3. Never bypass approval workflow.
4. Never hardcode OpenAI-specific logic.
5. Provider SDK must remain model-agnostic.
6. Skills are first-class citizens.
7. MCP integration must remain optional.
8. Security rules override all other instructions.

---

# Development Strategy

Do NOT attempt to build the entire application at once.

Work milestone-by-milestone.

Required order:

```text
M0 Repo Setup
M1 Desktop Shell
M2 Provider SDK
M3 Agent Runtime
M4 Project Runtime
M5 Diff Engine
M6 Skill Engine
M7 Permission Layer
M8 Git Runtime
M9 MCP Runtime
```

---

# Current Task

If this is a fresh repository:

Implement ONLY:

```text
M0 Repo Setup
```

Goals:

- Initialize pnpm workspace
- Create monorepo structure
- Create Tauri desktop shell
- Configure TypeScript
- Configure ESLint
- Configure Prettier
- Configure build scripts

Do NOT implement business logic.

Do NOT implement providers.

Do NOT implement agent runtime.

Stop after M0 is complete.

---

# Delivery Format

Before making changes:

1. Explain plan.
2. List files to create.
3. List files to modify.

After implementation:

1. Show file tree.
2. Explain completed work.
3. Explain remaining work.
4. Wait for review.

---

# Definition of Success

Success is NOT:

```text
Most code written
```

Success IS:

```text
Architecture preserved
+
Small safe iterations
+
Reviewable diffs
```

---

# Final Instruction

When uncertain:

- Follow architecture documents.
- Prefer consistency over creativity.
- Prefer project rules over model preferences.
- Ask for review after each milestone.

Never skip milestones.
