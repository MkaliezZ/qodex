# ADR-001

**Status:** Accepted
**Date:** 2026-06-11

## Context

Qodex is a desktop-first AI coding agent with multiple sub-systems (provider abstraction, runtime orchestration, context assembly, diff engine, git integration, skill management, MCP tools). Each subsystem has distinct dependencies, testing requirements, and release cadences. A monolithic structure would create coupling between unrelated modules and slow down development.

## Decision

Use a pnpm monorepo with the following structure:

```
Qodex/
├── apps/
│   └── desktop/              # Tauri + React UI
├── packages/
│   ├── provider-sdk/         # Model provider abstraction
│   ├── agent-runtime/        # Task execution orchestration
│   ├── project-runtime/      # File system access
│   ├── context-engine/       # Context assembly pipeline
│   ├── diff-engine/          # Patch generation & apply
│   ├── git-runtime/          # Git operations & checkpoints
│   ├── skill-runtime/        # Skill loading & resolution
│   └── mcp-runtime/          # MCP tool management
├── docs/                     # Specification documents
└── qodex-config/             # AI agent workspace
```

Each package:
- Has its own `package.json` with workspace protocol dependencies
- Has its own `tsconfig.json` with strict mode
- Maintains independent test suites using vitest
- Exports a single entry point via `src/index.ts`
- Is semantically versioned with the `@qodex/` scope

Root `pnpm-workspace.yaml` defines `apps/*` and `packages/*` as workspace packages.

## Consequences

**Positive:**
- Clear separation of concerns — each package has a single responsibility
- Independent testing — `pnpm -r test` runs all package suites
- Independent type-checking — each package has its own tsconfig
- Workspace protocol (`workspace:*`) ensures compatible versions across packages
- Future packages (multi-agent, cloud sync) can be added without modifying existing code

**Negative:**
- Cross-package refactors require changes to workspace versions
- New developers must understand the monorepo tooling
- Build tooling (Vite aliases) needed for browser dev to resolve workspace packages

## Alternatives Considered

1. **Single package**: Rejected — would create tight coupling between unrelated modules and slow iteration.
2. **npm workspaces**: Rejected — pnpm provides stricter dependency isolation and faster installs.
3. **Turborepo**: Considered but deferred — pnpm's built-in workspace support is sufficient for the current scale.
4. **Separate repositories**: Rejected — would make cross-package refactors prohibitively expensive.
