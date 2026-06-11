# Agent Runtime Sequence Diagram

## Purpose

This document defines the runtime behavior for Qodex tasks.

---

# MVP Task Sequence

```mermaid
sequenceDiagram
  participant User
  participant UI
  participant AgentRuntime
  participant SkillEngine
  participant ContextEngine
  participant ProviderSDK
  participant DiffEngine
  participant PermissionLayer
  participant FileSystem
  participant DB

  User->>UI: Submit prompt
  UI->>AgentRuntime: createTask(prompt, model, skills)
  AgentRuntime->>DB: persist task
  AgentRuntime->>SkillEngine: resolve skills
  SkillEngine-->>AgentRuntime: skill context
  AgentRuntime->>ContextEngine: select context
  ContextEngine->>FileSystem: read selected files
  FileSystem-->>ContextEngine: file contents
  ContextEngine-->>AgentRuntime: context bundle
  AgentRuntime->>ProviderSDK: stream model request
  ProviderSDK-->>UI: stream text chunks
  ProviderSDK-->>AgentRuntime: proposed patch
  AgentRuntime->>DiffEngine: validate patch
  DiffEngine-->>AgentRuntime: patch object
  AgentRuntime->>DB: persist patch
  AgentRuntime-->>UI: show diff
  User->>UI: approve patch
  UI->>PermissionLayer: request file write approval
  PermissionLayer-->>UI: approved
  UI->>DiffEngine: apply patch
  DiffEngine->>FileSystem: write changes
  DiffEngine->>DB: audit applied patch
  DiffEngine-->>UI: apply result
```

---

# State Machine

```mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Planning
  Planning --> SelectingContext
  SelectingContext --> CallingModel
  CallingModel --> GeneratingPatch
  GeneratingPatch --> ReviewingDiff
  ReviewingDiff --> ApplyingPatch
  ApplyingPatch --> Done

  Planning --> Failed
  SelectingContext --> Failed
  CallingModel --> Failed
  GeneratingPatch --> Failed
  ApplyingPatch --> Failed

  ReviewingDiff --> Cancelled
  Failed --> Idle
  Done --> [*]
```

---

# Tool Call Sequence

```mermaid
sequenceDiagram
  participant AgentRuntime
  participant ToolRuntime
  participant PermissionLayer
  participant Tool
  participant AuditLog

  AgentRuntime->>ToolRuntime: request tool call
  ToolRuntime->>PermissionLayer: check risk
  alt approval required
    PermissionLayer-->>AgentRuntime: pending approval
    AgentRuntime-->>ToolRuntime: user approved
  end
  ToolRuntime->>Tool: execute
  Tool-->>ToolRuntime: result
  ToolRuntime->>AuditLog: log tool call
  ToolRuntime-->>AgentRuntime: result
```

---

# Multi-Model Sequence

```mermaid
sequenceDiagram
  participant AgentRuntime
  participant PlannerModel
  participant CodingModel
  participant ReviewModel
  participant DiffEngine

  AgentRuntime->>PlannerModel: create plan
  PlannerModel-->>AgentRuntime: plan
  AgentRuntime->>CodingModel: implement patch
  CodingModel-->>AgentRuntime: patch
  AgentRuntime->>ReviewModel: review patch
  ReviewModel-->>AgentRuntime: review result
  AgentRuntime->>DiffEngine: validate final patch
```

---

# Error Recovery

## Model Error

```text
retry once
↓
if fail, show error
↓
allow switch model
↓
resume task
```

## Patch Error

```text
show invalid patch
↓
ask model to regenerate patch
↓
validate again
```

## Permission Denied

```text
mark tool call denied
↓
continue with safe alternative if possible
```
