# Qodex Monorepo Setup

## Package Manager

Use pnpm.

## Create Project

```bash
pnpm create tauri-app qodex
```

Recommended structure:

```text
qodex/
├── apps/desktop
├── packages/agent-runtime
├── packages/context-engine
├── packages/provider-sdk
├── packages/skill-engine
├── packages/tool-runtime
├── packages/diff-engine
├── packages/database
├── packages/ui
└── docs
```

## Root package.json

```json
{
  "name": "qodex",
  "private": true,
  "scripts": {
    "dev": "pnpm --filter @qodex/desktop dev",
    "build": "pnpm -r build",
    "lint": "pnpm -r lint",
    "test": "pnpm -r test"
  },
  "packageManager": "pnpm@9.0.0"
}
```

## Environment

Use local encrypted storage for API keys.

Never store keys directly in plain SQLite.
