# Qodex System Architecture

## Top-Level Architecture

```text
Qodex Desktop
├── React UI
├── Tauri Commands
├── Agent Runtime
├── Context Engine
├── Provider SDK
├── Skill Engine
├── Tool Runtime
├── Diff Engine
├── Git Runtime
├── MCP Runtime
├── Permission Layer
└── SQLite Storage
```

## Runtime Flow

```text
User Prompt
↓
Prompt Parser
↓
Skill Resolver
↓
Context Engine
↓
Agent Planner
↓
Provider SDK
↓
Tool Runtime
↓
Patch Generator
↓
Diff Viewer
↓
Approval
↓
Apply Patch
↓
Audit Log
```

## Recommended Monorepo

```text
qodex/
├── apps/
│   └── desktop/
│       ├── src/
│       ├── src-tauri/
│       └── package.json
├── packages/
│   ├── agent-runtime/
│   ├── context-engine/
│   ├── provider-sdk/
│   ├── skill-engine/
│   ├── tool-runtime/
│   ├── diff-engine/
│   ├── git-runtime/
│   ├── mcp-runtime/
│   ├── database/
│   ├── shared/
│   └── ui/
├── examples/
│   └── skills/
├── docs/
└── package.json
```

## Module Boundaries

### UI Layer

Only handles:

- Rendering
- User input
- State visualization
- Approval prompts

Never directly:

- Writes files
- Executes shell
- Calls model APIs without runtime layer

### Agent Runtime

Handles:

- Task state machine
- Planning
- Tool orchestration
- Review loop
- Error recovery

### Provider SDK

Normalizes all models into one interface.

### Context Engine

Selects and compresses context.

### Skill Engine

Loads and injects skill instructions.

### Tool Runtime

Executes file, shell, git, browser, and MCP tools under permission rules.

### Diff Engine

Creates, displays, validates, and applies patches.

### Database

Persists settings, tasks, sessions, providers, skills, patches, and audit logs.
