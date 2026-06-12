# M11 Architecture Review — Planning & Execution Runtime

**Date:** 2026-06-12  
**Status:** Pre-Implementation Review  
**Source:** ADR-012 — Planning & Execution Runtime

---

## 1. Planning Runtime Responsibility

### Owns ✅

| Concern | Description |
|---|---|
| **Goal decomposition** | Break user intent (natural language or structured goal) into sub-goals and leaf tasks |
| **Plan generation** | Produce a structured plan document with task ordering, dependencies, and resource estimates |
| **Execution graph creation** | Build a DAG from the plan, validating acyclicity and connectivity |
| **Dependency tracking** | Maintain readiness state per node; determine which nodes are unblocked |
| **Execution state** | Track node-level lifecycle: pending → ready → running → completed/failed/blocked |
| **Replanning request handling** | Accept replan triggers, re-evaluate graph state, emit revised plan |
| **Event emission** | Publish lifecycle events to a framework-agnostic event bus |

### Does NOT Own ❌

| Concern | Delegated To |
|---|---|
| Model provider calls | Agent Runtime → Provider SDK |
| Direct file writes | Diff Engine (proposal-based only) |
| Diff application | Diff Engine → user review gate |
| Git commits | Git Runtime (user-explicit) |
| MCP tool execution | MCP Runtime → Permission Engine |
| Skill resolution | Skill Runtime |
| Permission bypass | **NONE — forbidden at all layers** |
| Desktop UI rendering | Desktop shell (React) |

### Boundary Rule

The Planning Runtime is a **coordinator**, not an executor. It describes *what* should happen and *in what order*. Other runtimes own *how* each step is executed.

---

## 2. Relationship With Multi-Agent Runtime

### Clarified Boundary

```
Planning Runtime                     Multi-Agent Runtime
─────────────────                    ────────────────────
Goal → Plan → Execution Graph        Graph Node → Specialist → Report
         │                                    ↑
         └──────── dispatches ────────────────┘
```

**How they communicate:**

1. Planning Runtime creates an `ExecutionGraph`
2. When a `task` node becomes `ready`, Planning Runtime dispatches it to the Multi-Agent Runtime
3. Planning Runtime calls: `multiAgentRuntime.executeNode(node)` — passing the node's description, context scope, and any dependencies
4. Multi-Agent Runtime delegates to Coordinator → Specialists → returns an `AgentReport`
5. Planning Runtime marks the node `completed` and re-evaluates downstream dependencies

**Dependency direction:**
```
Planning Runtime → Multi-Agent Runtime  (unidirectional)
```
Multi-Agent Runtime has **zero knowledge** of the Planning Runtime. It receives work items and returns reports, nothing more.

**No circular dependency.** Planning Runtime imports types from multi-agent-runtime; multi-agent-runtime never imports from planning-runtime.

---

## 3. Relationship With Agent Runtime

### Clarified Boundary

```
Planning Runtime                     Agent Runtime
─────────────────                    ─────────────
Schedules tasks                      Executes tasks
Tracks execution state               Manages task lifecycle
Coordinates retries                  Handles provider streaming
                                     Emits task events
```

**How they communicate:**

Planning Runtime does **not** call Agent Runtime directly. It dispatches through Multi-Agent Runtime, which internally uses Agent Runtime. This keeps the Planning Runtime at one level of indirection from the raw Agent Runtime, preventing vertical coupling.

**If direct scheduling is needed in M11:**
- Planning Runtime may _optionally_ call `agentRuntime.createTask()` + `agentRuntime.runTask()` for simple single-agent tasks
- This would require a dependency on `@qodex/agent-runtime` types only (no implementation coupling)

**Constraint:** Planning Runtime must never bypass Multi-Agent Runtime for multi-agent work. Direct Agent Runtime usage is reserved for single-step, single-agent tasks that do not require coordination.

---

## 4. Relationship With Diff Engine

### Clarified Boundary

```
Planning Runtime                     Diff Engine
─────────────────                    ───────────
Requests patch-producing steps       Generates patches
Tracks diff node status              Validates patches
                                     Proposes to user
                                     Applies on user approval
```

**How they communicate:**

- Planning Runtime marks a `diff` node in the DAG, specifying which files and what change intent
- The executing agent (via Multi-Agent Runtime) calls `diffEngine.createProposal()`
- The patch appears in the Diff Viewer — **not auto-applied**
- After user approval, `diffEngine.apply()` is called by the UI layer, not by Planning Runtime
- Planning Runtime observes the `diff` node outcome and proceeds

**Forbidden:**
- ❌ Planning Runtime calling `diffEngine.apply()` directly
- ❌ Planning Runtime bypassing Diff Viewer
- ❌ Planning Runtime auto-approving changes

---

## 5. Relationship With Git Runtime

### Clarified Boundary

```
Planning Runtime                     Git Runtime
─────────────────                    ───────────
Requests checkpoint nodes            Creates checkpoints
Tracks checkpoint status             Commits (user-explicit)
                                     Restores (user-explicit)
```

**How they communicate:**

- Planning Runtime may insert `checkpoint` nodes in the execution graph at strategic points (before file modifications, after batch completions)
- Checkpoint execution is delegated to Git Runtime via the agent that handles the checkpoint node
- The Git Runtime commits or restores only on **explicit user action**

**Forbidden:**
- ❌ Planning Runtime calling `gitRuntime.commit()` directly
- ❌ Planning Runtime calling `gitRuntime.restore()` without user approval
- ❌ Automatic checkpoint commits between every diff node (noise)

---

## 6. Relationship With MCP Runtime

### Clarified Boundary

```
Planning Runtime                     MCP Runtime
─────────────────                    ───────────
Includes tool-call nodes             Permission Engine (gate)
Tracks tool call status              Tool registry discovery
                                     Mock transport (dev)
                                     StdioTransport (prod)
```

**How they communicate:**

- Planning Runtime may include `tool` nodes in the execution graph
- Tool execution is delegated through the agent → MCP Runtime → Permission Engine
- Planning Runtime observes the permission outcome and continues or blocks

**Forbidden:**
- ❌ Planning Runtime bypassing Permission Engine
- ❌ Direct tool execution (no raw shell, no raw HTTP)
- ❌ Executing MCP tools without user-visible permission prompt

---

## 7. Event Model

### Required Events (framework-agnostic)

| Event | Emitted When |
|---|---|
| `plan.created` | A new plan is produced from a goal |
| `plan.updated` | An existing plan is revised (replan) |
| `graph.created` | The execution graph is built from a plan |
| `node.ready` | All node dependencies are satisfied |
| `node.started` | Node execution begins |
| `node.completed` | Node execution succeeds |
| `node.failed` | Node execution fails |
| `node.blocked` | Node cannot proceed due to unmet dependencies |
| `replan.requested` | User or system triggers replanning |
| `replan.completed` | Replanning produces a revised graph |
| `report.generated` | Final execution report ready |

All events are plain objects with `type`, `timestamp`, and typed `payload`. No React dependency. No DOM dependency.

---

## 8. Execution Graph Design

### Node Types

| Type | Purpose | Output |
|---|---|---|
| `goal` | Root — the user's overall intent | Decomposed into plan |
| `plan` | Structured task list | Execution graph |
| `task` | Work delegated to an agent | Agent report |
| `review` | Validation gate | Pass / fail / revisions |
| `diff` | Patch proposal step | PatchProposal |
| `checkpoint` | Git state snapshot | Checkpoint ID |
| `approval` | Blocking user gate | Approved / rejected |
| `tool` | MCP tool call | Tool result |
| `report` | Aggregation node | Final report |

### Node Statuses

| Status | Meaning |
|---|---|
| `pending` | Initial state; dependencies not met |
| `ready` | All dependencies satisfied; can execute |
| `running` | Currently being executed |
| `blocked` | Cannot proceed (dependency failed, approval needed) |
| `completed` | Execution succeeded |
| `failed` | Execution failed |
| `cancelled` | User cancelled before or during execution |

### Dependency Rules

- A node becomes `ready` when **all** upstream dependency nodes are `completed`
- If **any** upstream node is `failed`, downstream nodes become `blocked`
- `approval` nodes block all downstream nodes until explicitly approved
- `report` nodes wait for all non-report siblings to reach terminal state
- Circular dependencies are rejected at graph-validation time

### Completion Rules

- Graph is `completed` when the `report` node (or all leaf nodes) reach `completed`
- Graph is `failed` when any non-recoverable node reaches `failed`
- Graph is `cancelled` when user cancels and all running nodes stop

---

## 9. Replanning Design

### Allowed Triggers

| Trigger | Example |
|---|---|
| Execution failure | A `task` node fails and blocks the graph |
| Dependency change | File selection changes mid-execution |
| User explicit request | User clicks "Revise Plan" |

### Forbidden Behaviors

- ❌ Autonomous background replanning
- ❌ Recursive replanning loops (max depth: 3)
- ❌ Hidden plan mutation (all changes must emit `plan.updated`)
- ❌ Replanning while nodes are still `running` (must wait or cancel)

### Replan Data Model

```typescript
interface ReplanRequest {
  graphId: string;
  reason: ReplanReason;       // 'failure' | 'dependency_change' | 'user_request'
  failedNodeIds?: string[];   // nodes that triggered the replan
  userInput?: string;         // optional user guidance
  timestamp: number;
}

interface ReplanResult {
  originalGraphId: string;
  newGraphId: string;
  changes: NodeChange[];      // added / removed / modified nodes
  reason: ReplanReason;
  timestamp: number;
}
```

---

## 10. Persistence Strategy (M11)

**Decision:** In-memory runtime with serializable graph models.

- All graph models implement `toJSON()` / `fromJSON()` for future persistence
- No database dependency in M11
- `ExecutionGraph`, `ExecutionNode`, and `ExecutionEdge` are plain-serializable
- Future M12+ can add SQLite persistence without breaking the serialization contract

---

## 11. Package Structure

```
packages/planning-runtime/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts                  # Public exports
│   ├── runtime/
│   │   └── runtime.ts            # PlanningRuntime main class
│   ├── planner/
│   │   └── planner.ts            # Goal decomposition + plan generation
│   ├── graph/
│   │   ├── graph.ts              # ExecutionGraph + validation
│   │   ├── node.ts               # ExecutionNode
│   │   └── edge.ts               # ExecutionEdge
│   ├── execution/
│   │   └── executor.ts           # Node dispatch + state machine
│   ├── replanning/
│   │   └── replanner.ts          # Replan logic
│   ├── events/
│   │   └── bus.ts                # Planning event bus
│   └── models/
│       ├── plan.ts               # Plan, PlanStep
│       ├── graph.ts              # ExecutionGraph serialization
│       └── events.ts             # Event type definitions
└── tests/
    ├── planner.test.ts
    ├── graph.test.ts
    ├── executor.test.ts
    ├── replanner.test.ts
    ├── events.test.ts
    ├── integration.test.ts
    ├── edge.test.ts
    └── production-review.test.ts
```

---

## 12. Package Dependencies

```
@qodex/planning-runtime
├── (zero runtime dependencies in M11)
├── May import TYPES from:
│   ├── @qodex/multi-agent-runtime  (AgentReport, SubTask type)
│   ├── @qodex/agent-runtime        (AgentTask type)
│   ├── @qodex/diff-engine          (PatchProposal type)
│   ├── @qodex/git-runtime          (GitCheckpoint type)
│   └── @qodex/mcp-runtime          (MCPCallResult type)
└── Does NOT import implementation classes
```

**Critical rule:** Planning Runtime only imports **types** from other packages, never runtime implementations. This prevents circular dependencies and keeps the planning runtime testable in isolation.

---

## 13. Risks

| Risk | Severity | Mitigation | Test Strategy |
|---|---|---|---|
| Circular dependencies | 🔴 High | Type-only imports from other packages; no implementation imports | Dependency graph validation in CI |
| Autonomous execution creep | 🟡 Medium | Explicit user gates; no auto-replan; max replan depth=3 | Replan loop test; autonomous-gate test |
| MCP permission bypass | 🔴 High | All tool calls go through Permission Engine; Planning Runtime has no MCP methods | Permission gate test with mock transport |
| Diff auto-apply risk | 🔴 High | apply() reserved for UI layer; Planning Runtime only observes diff outcomes | Diff boundary test; apply-forbidden test |
| Graph state corruption | 🟡 Medium | Immutable state transitions; deterministic node evaluation | State machine test; concurrent-node test |
| Event storming | 🟢 Low | Batched event emission; configurable debounce | Event count test under 100-node graphs |
| Over-coupling to desktop UI | 🟡 Medium | Framework-agnostic event model; no React imports | Run package tests without React |

---

## 14. Acceptance Criteria (Pre-Implementation)

Before M11 coding begins, the following must be true:

- [ ] ADR-012 reviewed and accepted
- [ ] This architecture review accepted
- [ ] Implementation plan accepted
- [ ] All boundary rules documented
- [ ] Test plan defined with minimum 50 unit tests
- [ ] No implementation code written yet

---

## Recommendation

### ✅ READY for M11 implementation

**Rationale:**

- All 9 existing runtimes have clean, well-tested interfaces
- Planning Runtime's boundaries are sharply defined — it coordinates, it does not execute
- No circular dependency risk (type-only imports from downstream packages)
- Safety constraints align with existing architecture (diff-approval gate, permission engine, user review)
- ADR-012 provides sufficient architectural guidance

**One precondition:** The "type-only import" rule must be enforced from the first commit.

---

*Architecture Review — 2026-06-12*
