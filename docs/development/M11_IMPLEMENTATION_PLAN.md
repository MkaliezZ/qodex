# M11 Implementation Plan — Planning & Execution Runtime

**Date:** 2026-06-12  
**Status:** Pre-Implementation  
**Depends On:** ADR-012, M11 Architecture Review

---

## 1. Package Structure

```
packages/planning-runtime/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts
│   ├── runtime/
│   │   └── runtime.ts
│   ├── planner/
│   │   └── planner.ts
│   ├── graph/
│   │   ├── graph.ts
│   │   ├── node.ts
│   │   └── edge.ts
│   ├── execution/
│   │   └── executor.ts
│   ├── replanning/
│   │   └── replanner.ts
│   ├── events/
│   │   └── bus.ts
│   └── models/
│       ├── plan.ts
│       ├── graph.ts
│       └── events.ts
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

## 2. Core Interfaces

### 2.1 Primary Entry Point

```typescript
// packages/planning-runtime/src/index.ts

export { PlanningRuntime } from "./runtime/runtime.js";
export type { PlanningRuntimeOptions } from "./runtime/runtime.js";

export { Planner } from "./planner/planner.js";
export { ExecutionGraph } from "./graph/graph.js";
export { GraphExecutor } from "./execution/executor.js";
export { Replanner } from "./replanning/replanner.js";
export { PlanningEventBus } from "./events/bus.js";

export type {
  Plan,
  PlanStep,
  Goal,
  GoalDecomposition,
} from "./models/plan.js";

export type {
  ExecutionGraphModel,
  ExecutionNode,
  ExecutionEdge,
  NodeType,
  NodeStatus,
  GraphStatus,
  DependencyRule,
} from "./models/graph.js";

export type {
  PlanningEvent,
  PlanningEventType,
  PlanCreatedEvent,
  PlanUpdatedEvent,
  GraphCreatedEvent,
  NodeReadyEvent,
  NodeStartedEvent,
  NodeCompletedEvent,
  NodeFailedEvent,
  NodeBlockedEvent,
  ReplanRequestedEvent,
  ReplanCompletedEvent,
  ReportGeneratedEvent,
} from "./models/events.js";
```

### 2.2 PlanningRuntime

```typescript
interface PlanningRuntime {
  // Lifecycle
  createPlan(goal: Goal): Promise<Plan>;
  startExecution(plan: Plan): Promise<ExecutionGraph>;
  cancelExecution(graphId: string): Promise<void>;

  // State queries
  getGraph(graphId: string): ExecutionGraph | null;
  getNodeStatus(graphId: string, nodeId: string): NodeStatus;
  getGraphStatus(graphId: string): GraphStatus;

  // Replanning
  requestReplan(request: ReplanRequest): Promise<ReplanResult>;

  // Events
  subscribe(handler: (event: PlanningEvent) => void): () => void;

  // Serialization (future persistence)
  exportGraph(graphId: string): ExecutionGraphModel;
  importGraph(model: ExecutionGraphModel): ExecutionGraph;
}
```

### 2.3 Plan Model

```typescript
interface Goal {
  id: string;
  description: string;          // Natural language goal
  constraints?: string[];       // e.g., "must not modify package.json"
  context?: {
    selectedFiles: string[];    // File paths in scope
    projectName: string;
  };
  timestamp: number;
}

interface Plan {
  id: string;
  goalId: string;
  steps: PlanStep[];
  createdAt: number;
}

interface PlanStep {
  id: string;
  order: number;
  type: NodeType;               // task | review | diff | checkpoint | approval | tool
  description: string;          // Human-readable step description
  dependencies: string[];       // IDs of steps this depends on
  agentRole?: AgentRole;        // review | refactor | research | testing
  estimatedComplexity?: number; // 1-5
}
```

### 2.4 Graph Model

```typescript
interface ExecutionNode {
  id: string;
  type: NodeType;
  status: NodeStatus;
  description: string;
  dependencies: string[];       // Node IDs
  dependents: string[];         // Reverse: nodes that depend on this
  result?: NodeResult;
  startedAt?: number;
  completedAt?: number;
  retryCount: number;
  maxRetries: number;
}

interface ExecutionEdge {
  id: string;
  from: string;                 // Source node ID
  to: string;                   // Target node ID
  type: 'depends_on' | 'produces_for' | 'reports_to';
}

interface ExecutionGraphModel {
  id: string;
  planId: string;
  nodes: ExecutionNode[];
  edges: ExecutionEdge[];
  rootNodeId: string;
  status: GraphStatus;
  createdAt: number;
  updatedAt: number;
}

type NodeType = 'goal' | 'plan' | 'task' | 'review' | 'diff' | 'checkpoint' | 'approval' | 'tool' | 'report';

type NodeStatus = 'pending' | 'ready' | 'running' | 'blocked' | 'completed' | 'failed' | 'cancelled';

type GraphStatus = 'building' | 'ready' | 'running' | 'completed' | 'failed' | 'cancelled';
```

### 2.5 Replan Model

```typescript
interface ReplanRequest {
  graphId: string;
  reason: ReplanReason;
  failedNodeIds?: string[];
  userInput?: string;
  timestamp: number;
}

interface ReplanResult {
  originalGraphId: string;
  newGraphId: string;
  changes: NodeChange[];
  reason: ReplanReason;
  timestamp: number;
}

type ReplanReason = 'failure' | 'dependency_change' | 'user_request';

interface NodeChange {
  type: 'added' | 'removed' | 'modified';
  nodeId: string;
  previousState?: Partial<ExecutionNode>;
}
```

---

## 3. Integration Points

### 3.1 With Multi-Agent Runtime

```
PlanningRuntime.startExecution(plan)
  → GraphExecutor.readies node
    → Calls external executor (injected)
      → MultiAgentRuntime.executeNode(node)
        → Returns AgentReport
  → GraphExecutor marks node completed
  → GraphExecutor evaluates downstream readiness
```

**Dependency:** Type-only import of `AgentReport` from `@qodex/multi-agent-runtime`.

### 3.2 With Desktop UI

```
Desktop UI
  → PlanningRuntime.createPlan(goal)
  → Renders ExecutionGraph as timeline
  → User clicks "Approve" on approval nodes
  → User clicks "Revise Plan" for replanning
  → Renders ReplanResult diff
```

**No runtime import of React** — events are plain objects consumable by any UI framework.

### 3.3 With Diff Engine

Planning Runtime does NOT call Diff Engine. It creates `diff` graph nodes. The executing agent calls Diff Engine. The Planning Runtime observes the outcome via the Multi-Agent Runtime's report.

---

## 4. Test Plan

### Unit Tests (minimum 50)

| Suite | Tests | Focus |
|---|---|---|
| `planner.test.ts` | 8 | Goal decomposition, plan generation, dependency ordering, complexity estimation |
| `graph.test.ts` | 10 | DAG construction, acyclicity validation, node readiness, dependency resolution, serialization |
| `executor.test.ts` | 12 | State machine transitions, node dispatch, completion detection, cancellation, retry |
| `replanner.test.ts` | 8 | Failure-trigger replan, user-request replan, max depth enforcement, graph diff |
| `events.test.ts` | 8 | Event emission order, payload correctness, subscription lifecycle |
| `edge.test.ts` | 4 | Circular dependency rejection, orphan node detection, empty graph |
| **Subtotal** | **50** | |

### Integration Tests

| Suite | Tests | Focus |
|---|---|---|
| `integration.test.ts` | 8 | End-to-end: goal → plan → graph → mock execution → completion |
| `production-review.test.ts` | 12 | Full lifecycle, error scenarios, concurrent graphs, replan cycles |

### Total: ~70 tests

---

## 5. Forbidden Changes (M11 Must NOT)

- ❌ Modify existing packages (multi-agent-runtime, agent-runtime, diff-engine, git-runtime, mcp-runtime, context-engine, project-runtime, provider-sdk, skill-runtime)
- ❌ Modify desktop UI
- ❌ Add `planning-runtime` imports to any existing package (only desktop may import it)
- ❌ Create circular dependencies
- ❌ Bypass Diff Engine approval gate
- ❌ Bypass MCP Permission Engine
- ❌ Execute shell commands
- ❌ Write files directly
- ❌ Auto-commit to git
- ❌ Auto-apply diffs

### What M11 MAY Do

- ✅ Create new `packages/planning-runtime/`
- ✅ Define types, interfaces, and models
- ✅ Implement event bus
- ✅ Write tests (50+ unit, 20+ integration)
- ✅ Document the package
- ✅ Update DEVLOG

---

## 6. Acceptance Criteria

| # | Criterion |
|---|---|
| 1 | `PlanningRuntime` creates a `Plan` from a `Goal` with correct dependency ordering |
| 2 | `ExecutionGraph` is a valid DAG (no cycles) |
| 3 | Node readiness is correctly computed from dependencies |
| 4 | State machine transitions are correct for all 7 statuses |
| 5 | Failed nodes block downstream nodes |
| 6 | Replanning produces a valid revised graph |
| 7 | Replanning depth limit (3) is enforced |
| 8 | All events are emitted in correct order |
| 9 | `exportGraph()` + `importGraph()` round-trip correctly |
| 10 | Zero imports of implementation classes from other packages (type-only) |
| 11 | 50+ unit tests passing |
| 12 | 8+ integration tests passing |
| 13 | Production review passing |
| 14 | No regressions in existing 887 tests |

---

## 7. Milestone Exit Criteria

M11 is complete when:

- [ ] Package `packages/planning-runtime/` exists with full test suite
- [ ] All acceptance criteria met
- [ ] Architecture review validated (no boundary violations)
- [ ] DEVLOG updated
- [ ] ADR-012 status updated to "Accepted"
- [ ] PR merged to main
- [ ] No regressions

---

*Implementation Plan — 2026-06-12*
