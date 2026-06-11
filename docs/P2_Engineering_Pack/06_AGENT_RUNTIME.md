# Qodex Agent Runtime

## State Machine

```text
Idle
↓
Planning
↓
SelectingContext
↓
CallingModel
↓
ExecutingTools
↓
GeneratingPatch
↓
ReviewingDiff
↓
ApplyingPatch
↓
Done
```

Failure states:

```text
ModelError
ToolError
PatchError
PermissionDenied
UserCancelled
```

## Agent Roles

### Planner

Determines steps and required context.

### Coder

Generates implementation.

### Reviewer

Reviews proposed diff.

### Tool Executor

Runs approved tools.

## Task Interface

```ts
export interface AgentTask {
  id: string;
  projectId: string;
  sessionId: string;
  prompt: string;
  status:
    | "idle"
    | "planning"
    | "selecting_context"
    | "calling_model"
    | "executing_tools"
    | "generating_patch"
    | "reviewing_diff"
    | "applying_patch"
    | "done"
    | "failed";
  activeModelId: string;
  selectedSkills: string[];
}
```

## MVP Runtime Loop

1. Parse user prompt
2. Load selected project
3. Load active skills
4. Select context files
5. Call model
6. Ask model for plan
7. Generate patch
8. Show diff
9. Apply after approval

## Multi-Model Future

Example:

```text
Claude -> planning
DeepSeek -> coding
GPT -> review
```

This should be implemented as a post-MVP workflow.
