# Qodex Final Engineering Pack

Qodex is a desktop-first, model-agnostic coding agent inspired by Codex-style workflows.

Core value:

> Codex-like workflow + Any model + Skills + MCP + Diff-first safety.

This engineering pack is designed to be handed directly to coding agents such as Codex, Claude Code, DeepSeek Reasoner, OpenClaw, Cline, or Cursor Agent.

## Build Target

Desktop app:

- Tauri
- React
- TypeScript
- Rust
- SQLite
- Drizzle ORM
- Monaco Editor
- Tailwind CSS
- shadcn/ui
- Framer Motion

## MVP Goal

The MVP must support:

1. Open local project
2. Chat with agent
3. Model switcher
4. OpenAI provider
5. DeepSeek provider
6. OpenRouter provider
7. Custom OpenAI-compatible provider
8. Read project files
9. Generate diff
10. Approve and apply patch
11. Basic Skills through `.qodex/skills/<skill>/SKILL.md`
12. Local SQLite persistence
13. Permission model

## Recommended Development Order

1. Scaffold Tauri monorepo
2. Implement database schema
3. Implement provider SDK
4. Implement chat streaming
5. Implement project file indexing
6. Implement context selector
7. Implement patch generation
8. Implement diff viewer
9. Implement apply patch
10. Implement skill loader
11. Implement permission prompts
12. Implement Git integration

## Main Principle

Do not build an IDE.

Build a coding-agent cockpit.
