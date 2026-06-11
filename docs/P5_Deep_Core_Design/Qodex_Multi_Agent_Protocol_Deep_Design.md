# Qodex Multi-Agent Protocol Deep Design

## 1. Purpose

The Multi-Agent Protocol allows Qodex to coordinate multiple models safely.

Example:

```text
Claude -> plan architecture
DeepSeek -> implement code
GPT -> review final diff
```

This is central to Qodex because the product supports many models.

---

## 2. Agent Roles

### Planner

Responsible for:

- understanding task
- deciding affected files
- producing implementation plan
- identifying risks

### Coder

Responsible for:

- implementing patch
- following project rules
- minimizing scope

### Reviewer

Responsible for:

- reviewing diff
- checking consistency
- finding risky changes
- recommending accept/reject

### Tool Executor

Responsible for:

- running approved tools
- returning structured results
- logging tool calls

---

## 3. Shared Task Object

```ts
interface SharedAgentTask {
  id: string;
  projectId: string;
  objective: string;
  constraints: string[];
  selectedFiles: string[];
  activeSkills: string[];
  artifacts: AgentArtifact[];
  status: AgentTaskStatus;
}
```

---

## 4. Artifact Types

```ts
type AgentArtifact =
  | PlanArtifact
  | ContextArtifact
  | PatchArtifact
  | ReviewArtifact
  | ToolResultArtifact;

interface PlanArtifact {
  type: "plan";
  author: "planner";
  steps: string[];
  risks: string[];
  affectedFiles: string[];
}

interface PatchArtifact {
  type: "patch";
  author: "coder";
  patchText: string;
  changedFiles: string[];
  summary: string;
}

interface ReviewArtifact {
  type: "review";
  author: "reviewer";
  verdict: "approve" | "request_changes" | "reject";
  issues: ReviewIssue[];
}
```

---

## 5. Message Protocol

All agent-to-agent handoff messages must be structured.

```json
{
  "task_id": "task_123",
  "from": "planner",
  "to": "coder",
  "handoff_type": "implementation_request",
  "objective": "Implement provider SDK",
  "constraints": [
    "Do not modify UI",
    "Follow provider interface"
  ],
  "required_artifacts": ["patch"],
  "context_refs": ["ctx_001"]
}
```

---

## 6. Workflow

### Standard Coding Workflow

```text
User
↓
Planner
↓
Context Engine
↓
Coder
↓
Diff Engine
↓
Reviewer
↓
User Approval
↓
Apply Patch
```

### Fast Workflow

```text
User
↓
Coder
↓
Diff Engine
↓
User Approval
```

### High-Risk Workflow

```text
User
↓
Planner
↓
Coder
↓
Reviewer
↓
Security Review
↓
User Approval
```

---

## 7. Model Assignment Strategy

Default:

```text
Planner: strongest reasoning model
Coder: cost-effective coding model
Reviewer: strongest reliable model
```

Example:

```text
Planner: Claude / GPT
Coder: DeepSeek / Qwen / MiniMax / MiMo
Reviewer: GPT / Claude
```

---

## 8. Consistency Rules

All agents receive:

- project rules
- architecture memory
- active skills
- selected context
- constraints from previous agents

Coder must not ignore Planner constraints.

Reviewer must check:

- scope creep
- architecture violations
- style drift
- unsafe operations
- schema changes
- public API changes

---

## 9. Review Verdicts

### Approve

Patch can be shown to user.

### Request Changes

Coder must revise.

### Reject

Patch is unsafe or violates constraints.

---

## 10. Failure Recovery

### Planner fails

Fallback to single-agent mode.

### Coder fails

Retry with same model once, then offer model switch.

### Reviewer rejects

Return issues to coder.

### Patch invalid

Ask coder to regenerate patch.

---

## 11. Audit

Every handoff is logged.

```ts
interface AgentHandoffLog {
  id: string;
  taskId: string;
  fromRole: string;
  toRole: string;
  payloadJson: string;
  createdAt: string;
}
```

---

## 12. MVP Implementation

MVP can simulate multi-agent with one model.

Phase 1:

- single agent
- structured plan
- structured patch

Phase 2:

- separate reviewer model

Phase 3:

- separate planner/coder/reviewer

Phase 4:

- parallel agents

---

## 13. Acceptance Criteria

Multi-Agent Protocol is acceptable when:

- Planner output is structured.
- Coder receives constraints.
- Reviewer can approve/reject.
- Handoffs are logged.
- User can see which model did what.
- Failed agent can be replaced.
