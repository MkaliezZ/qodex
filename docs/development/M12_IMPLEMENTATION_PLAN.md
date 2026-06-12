# M12 Implementation Plan — Execution Graph Runtime

**Date:** 2026-06-12  
**Status:** Pre-Implementation  
**Depends On:** ADR-013, M12 Architecture Review

---

## 1. Package Structure

```
packages/execution-graph-runtime/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts
│   ├── runtime/
│   │   └── runtime.ts              # ExecutionGraphRuntime
│   ├── lifecycle/
│   │   └── lifecycle.ts            # Graph lifecycle state machine
│   ├── archive/
│   │   └── archive.ts              # GraphArchive, GraphSnapshot
│   ├── replay/
│   │   └── replay.ts               # ReplayGraph, ReplayNode, ReplayPath
│   ├── inspection/
│   │   └── inspector.ts            # Query interface for graph state
│   ├── traversal/
│   │   └── traverser.ts            # Topological sort, dependency walk
│   ├── orchestration/
│   │   └── orchestrator.ts         # Node dispatch, result collection
│   ├── events/
│   │   └── bus.ts                  # Graph-level event bus
│   └── models/
│       ├── graph.ts                # GraphLifecycle, GraphStatus
│       ├── archive.ts              # GraphSnapshot, ExecutionRecord, GraphArchive
│       ├── replay.ts               # ReplayRequest, ReplayResult
│       └── events.ts               # Graph event type definitions
└── tests/
    ├── lifecycle.test.ts
    ├── archive.test.ts
    ├── replay.test.ts
    ├── inspector.test.ts
    ├── traverser.test.ts
    ├── orchestrator.test.ts
    ├── events.test.ts
    ├── serialization.test.ts
    ├── runtime.test.ts
    ├── integration.test.ts
    ├── edge.test.ts
    └── production-review.test.ts
```

---

## 2. Core Interfaces

### 2.1 Primary Entry Point

```typescript
export { ExecutionGraphRuntime } from "./runtime/runtime.js";
export type { ExecutionGraphRuntimeOptions } from "./runtime/runtime.js";

export { GraphLifecycle } from "./lifecycle/lifecycle.js";
export { GraphArchive } from "./archive/archive.js";
export { ReplayEngine } from "./replay/replay.js";
export { GraphInspector } from "./inspection/inspector.js";
export { GraphTraverser } from "./traversal/traverser.js";
export { NodeOrchestrator } from "./orchestration/orchestrator.js";
export { GraphEventBus } from "./events/bus.js";

export type { GraphSnapshot, ExecutionRecord } from "./models/archive.js";
export type { ReplayRequest, ReplayResult, ReplayType } from "./models/replay.js";
export type { GraphEvent, GraphEventType } from "./models/events.js";
```

### 2.2 ExecutionGraphRuntime

```typescript
interface ExecutionGraphRuntime {
  // Lifecycle
  buildGraph(plan: Plan): GraphLifecycle;
  start(graph: GraphLifecycle): Promise<GraphLifecycle>;
  cancel(graphId: string): Promise<void>;

  // Inspection
  getGraph(graphId: string): GraphLifecycle | null;
  getNodeState(graphId: string, nodeId: string): NodeState | null;
  listGraphs(): GraphLifecycle[];

  // Archive
  archive(graphId: string): GraphArchive;
  listArchives(): GraphArchive[];

  // Replay
  replayGraph(archiveId: string): Promise<ReplayResult>;
  replayNode(archiveId: string, nodeId: string): Promise<ReplayResult>;
  replayPath(archiveId: string, nodeIds: string[]): Promise<ReplayResult>;

  // Events
  subscribe(handler: (e: GraphEvent) => void): () => void;

  // Serialization
  exportArchive(archiveId: string): object;
  importArchive(data: object): GraphArchive;
}
```

### 2.3 GraphLifecycle

```typescript
type GraphLifecycleStatus = 
  'created' | 'validated' | 'ready' | 'running' | 
  'completed' | 'failed' | 'cancelled' | 'archived';

interface NodeState {
  nodeId: string;
  type: NodeType;
  status: NodeStatus;
  result?: unknown;
  startedAt?: number;
  completedAt?: number;
}

interface GraphLifecycle {
  readonly id: string;
  readonly planId: string;
  status: GraphLifecycleStatus;
  nodes: Map<string, ExecutionNode>;
  edges: ExecutionEdge[];
  rootNodeId: string;
  readonly createdAt: number;
  startedAt?: number;
  completedAt?: number;

  // Queries
  getReadyNodes(): ExecutionNode[];
  getNode(nodeId: string): ExecutionNode | null;
  getProgress(): { completed: number; total: number; failed: number };

  // Lifecycle transitions
  validate(): { valid: boolean; cycles?: string[][]; orphans?: string[] };
  markReady(): void;
  markRunning(): void;
  markCompleted(): void;
  markFailed(): void;
  markCancelled(): void;
  markArchived(): void;
}
```

### 2.4 Archive Model

```typescript
interface GraphSnapshot {
  graphId: string;
  planId: string;
  version: number;
  status: GraphLifecycleStatus;
  nodes: ExecutionNode[];
  edges: ExecutionEdge[];
  rootNodeId: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  metadata: {
    nodeCount: number;
    completedCount: number;
    failedCount: number;
    durationMs?: number;
  };
}

interface ExecutionRecord {
  id: string;
  graphId: string;
  graphVersion: number;
  action: string;
  nodeId?: string;
  timestamp: number;
  details?: unknown;
}

interface GraphArchive {
  id: string;
  snapshots: GraphSnapshot[];
  records: ExecutionRecord[];
  replayCount: number;
  createdAt: number;
}
```

### 2.5 Replay Model

```typescript
type ReplayType = 'graph' | 'node' | 'path';

interface ReplayRequest {
  archiveId: string;
  type: ReplayType;
  nodeId?: string;
  nodeIds?: string[];
}

interface ReplayResult {
  archiveId: string;
  type: ReplayType;
  events: ExecutionRecord[];
  durationMs: number;
  timestamp: number;
}
```

---

## 3. Integration Points

### 3.1 With Planning Runtime (M11)

```
ExecutionGraphRuntime.buildGraph(plan) ← Plan from Planning Runtime
  - Imports type Plan from @qodex/planning-runtime (type-only)
  - Converts PlanSteps to ExecutionNodes
  - Validates DAG
```

### 3.2 With Multi-Agent Runtime (M10)

Node orchestration via injected executor (no direct import):
```
NodeOrchestrator → calls injected dispatch(executor)
  → executor sends node to Multi-Agent Runtime
  → returns AgentReport
→ NodeOrchestrator updates node state, emits events
```

---

## 4. Test Plan

### Minimum: 80 tests  |  Target: 100+

| Suite | Tests | Focus |
|---|---|---|
| `lifecycle.test.ts` | 12 | Status transitions, legal/illegal, validation |
| `archive.test.ts` | 10 | Snapshot creation, record accumulation, export/import |
| `replay.test.ts` | 10 | Graph/node/path replay, read-only enforcement |
| `inspector.test.ts` | 8 | Node queries, progress, graph listing |
| `traverser.test.ts` | 8 | Topological sort, dependency walk, all 9 node types |
| `orchestrator.test.ts` | 10 | Dispatch, result collection, dependency chain |
| `events.test.ts` | 8 | All 13 graph-level event types |
| `serialization.test.ts` | 8 | Round-trip, version compatibility |
| `runtime.test.ts` | 12 | Full lifecycle, archive, replay, query |
| `integration.test.ts` | 8 | End-to-end: plan → graph → run → archive → replay |
| `edge.test.ts` | 8 | Empty graph, large graph, invalid transitions |
| `production-review.test.ts` | 12 | 10+ scenarios |
| **Total** | **114** | |

---

## 5. Forbidden Changes (M12 Must NOT)

- ❌ Modify Planning Runtime (M11)
- ❌ Modify Multi-Agent Runtime (M10)  
- ❌ Modify any M0-M11 package
- ❌ Import implementation from any @qodex/* package
- ❌ Execute shell commands
- ❌ Write files directly
- ❌ Apply diffs
- ❌ Commit to git
- ❌ Execute MCP tools
- ❌ Bypass user approval
- ❌ Auto-execute replay

### What M12 MAY Do

- ✅ Import `type` from `@qodex/planning-runtime` (Plan, PlanStep only)
- ✅ Create new `packages/execution-graph-runtime/`
- ✅ Define graph lifecycle, archive, replay models
- ✅ Implement graph event bus
- ✅ Inject executor for Multi-Agent dispatch
- ✅ Write tests (114 target)

---

## 6. Acceptance Criteria

| # | Criterion |
|---|---|
| 1 | `GraphLifecycle` enforces all legal/illegal state transitions |
| 2 | `buildGraph(plan)` produces valid DAG from PlanStep[] |
| 3 | Graph validation rejects cycles and orphans |
| 4 | `NodeOrchestrator` dispatches nodes in dependency order |
| 5 | `GraphArchive` captures complete execution history |
| 6 | `ReplayEngine` replays graphs without side effects |
| 7 | Replay cannot auto-execute or bypass permissions |
| 8 | All 13 graph-level events emitted correctly |
| 9 | `exportArchive/importArchive` round-trip with zero loss |
| 10 | Type-only import from planning-runtime (no implementation import) |
| 11 | 80+ tests passing (114 target) |
| 12 | No regressions in existing 992 tests |

---

## 7. Milestone Exit Criteria

M12 is complete when:

- [ ] Package `packages/execution-graph-runtime/` exists with full test suite
- [ ] All acceptance criteria met
- [ ] Architecture review validated
- [ ] DEVLOG updated
- [ ] ADR-013 status updated to "Accepted"
- [ ] Production review passes
- [ ] PR merged to main
- [ ] No regressions in 992 existing tests

---

*Implementation Plan — 2026-06-12*
