# Qodex V4 Implementation Spec

## Purpose

This document defines implementation-level standards for Qodex.

Unlike PRD and Architecture documents, this specification is intended to be used directly by coding agents.

---

# 1. Repository Structure

```text
qodex/
├── apps/
│   └── desktop/
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
├── docs/
└── tests/
```

---

# 2. Coding Standards

## TypeScript

Strict mode required.

```json
{
  "strict": true,
  "noImplicitAny": true
}
```

Rules:

- No any
- No business logic in UI
- Dependency injection preferred
- Functional core, imperative shell

---

# 3. Provider SDK Standard

Every provider must implement:

```ts
interface ModelProvider {
  listModels(): Promise<ModelInfo[]>
  stream(request: ModelRequest): AsyncIterable<ModelChunk>
  testConnection(): Promise<boolean>
}
```

Required providers:

- OpenAI
- DeepSeek
- OpenRouter
- Custom OpenAI Compatible

Phase 2:

- Claude
- Gemini
- Qwen
- GLM
- MiniMax
- MiMo
- Kimi

---

# 4. Context Engine Algorithm

Priority Score:

```text
40% Explicit File Mention
20% Recent Edit
15% Git Diff
10% Import Graph
10% Semantic Similarity
5% Skill Requirement
```

Budget Allocation:

```text
System Prompt      10%
Skill Context      10%
Conversation       20%
Project Summary    10%
Retrieved Files    50%
```

---

# 5. Skill DSL

Structure:

```text
skill.json
SKILL.md
resources/
scripts/
```

Permissions:

```json
{
  "file_read": true,
  "file_write": false,
  "shell": false,
  "network": false
}
```

Skill activation:

```text
$seo
$review
$freight
```

---

# 6. Diff Engine

Workflow:

```text
Model Output
↓
Patch Validation
↓
Diff Rendering
↓
User Approval
↓
Apply Patch
↓
Audit Log
```

Rules:

- Never write without approval
- Never write outside project root
- Validate patch before render

---

# 7. Tool Runtime

Risk Levels:

Low:
- Read File
- Search File

Medium:
- Run Tests

High:
- Write File
- Shell
- Git Commit
- Network

High-risk actions require confirmation.

---

# 8. Permission Modes

Safe Mode:
- Read Only

Review Mode:
- Diff Approval

Agent Mode:
- Approved Automation

Default:

```text
Review Mode
```

---

# 9. Database Rules

SQLite + Drizzle.

Required tables:

- projects
- sessions
- messages
- tasks
- providers
- skills
- tool_calls
- patches
- audit_logs

---

# 10. UI Standards

Layout:

```text
Left Rail
Center Workspace
Right Context Panel
```

Components:

- ProjectRail
- AgentTimeline
- PromptBar
- ModelSwitcher
- SkillDrawer
- DiffViewer
- ContextPanel

Style:

- Glassmorphism
- Dark Theme First
- Framer Motion
- Rounded Corners
- Soft Shadows

---

# 11. MVP Acceptance Criteria

The MVP is complete when:

- User can open a project
- User can chat with agent
- User can switch models
- OpenAI works
- DeepSeek works
- OpenRouter works
- Skills load correctly
- Diff viewer works
- Patch application works
- Settings persist
- Audit logs persist

---

# 12. Agent Development Instructions

Development order:

1. Monorepo
2. Database
3. Provider SDK
4. Chat Runtime
5. Context Engine
6. Diff Engine
7. Skill Engine
8. Permission Layer
9. Git Runtime
10. MCP Runtime

Rule:

Do not build features outside MVP until all MVP acceptance criteria pass.
