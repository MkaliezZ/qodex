
# Multi-Agent Protocol

Roles:
- Planner
- Coder
- Reviewer
- Tool Executor

Message Schema:
```json
{
  "task_id":"...",
  "agent_role":"planner",
  "objective":"...",
  "artifacts":[]
}
```

Workflow:
Planner -> Coder -> Reviewer -> Diff Engine
