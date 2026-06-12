# M12 Architecture Review — Execution Graph Runtime

**Date:** 2026-06-12  
**Status:** Pre-Implementation Review  
**Source:** ADR-013 — Execution Graph Runtime

---

## 1. Execution Graph Runtime Ownership

### Owns ✅

| Concern | Description |
|---|---|
| **Graph lifecycle** | Create → validate → ready → run → complete/fail → archive |
| **Graph state** | Per-node status tracking, graph-level status, dependency state |
| **Graph history** | Archive of completed/failed graphs with metadata and timestamps |
| **Graph inspection** | Query nodes, edges, statuses, execution progress at any point |
| **Graph traversal** | Topological sort, dependency-respecting forward/reverse walk |
| **Graph replay** | Re-observe prior execution; replay individual nodes or paths |
| **Graph export/import** | JSON round-trip with schema versioning |
| **Node orchestration** | Manage readiness, dispatch to Multi-Agent Runtime, collect results |
| **Event emission** | Graph-level lifecycle events + node dispatch/result events |
| **Graph visualization model** | DAG structure suitable for UI rendering |

### Does NOT Own ❌

| Concern | Delegated To |
|---|---|
| Planning (Goal → Plan) | Planning Runtime (M11) |
| Specialist execution | Multi-Agent Runtime (M10) |
| Provider/model calls | Agent Runtime → Provider SDK |
| Diff proposal/apply | Diff Engine |
| Git commit/restore | Git Runtime |
| MCP tool execution | MCP Runtime → Permission Engine |
| File writes | Diff Engine (proposal-gated) |
| Permission bypass | **NONE** |

---

## 2. Relationship With Planning Runtime

### Boundary

```
Planning Runtime (M11)              Execution Graph Runtime (M12)
──────────────────────              ─────────────────────────────
createPlan(goal) → Plan             accepts Plan
                                    buildGraph(plan) → managed graph
                                    run(graph) → lifecycle execution
                                    archive(graph) → history
```

### Interface

Planning Runtime produces a `Plan`. Execution Graph Runtime:
1. Accepts the `Plan` (or is constructed from it)
2. Builds/validates the `ExecutionGraph` 
3. Manages the full graph lifecycle
4. Produces `GraphArchive` records

Planning Runtime does **not** hold references to Execution Graph Runtime.

### Dependency Direction

```
Planning Runtime → (none)
Execution Graph Runtime → Planning Runtime (type-only imports of Plan, PlanStep)
```

**Type-only import:** `import type { Plan, PlanStep } from "@qodex/planning-runtime"`

No circular dependency. One-way: M12 depends on M11 types only.

---

## 3. Relationship With Multi-Agent Runtime

### Boundary

```
Execution Graph Runtime            Multi-Agent Runtime (M10)
─────────────────────────          ─────────────────────────
Graph node ready → dispatch        Receives node work item
Collect result → update node       Specialist executes → report
Graph-level aggregation            Returns AgentReport
```

### Ownership Split

| Concern | Owner |
|---|---|
| Node status (pending/ready/running/completed/failed) | Execution Graph Runtime |
| Execution result (AgentReport contents) | Multi-Agent Runtime |
| Report generation (graph summary) | Execution Graph Runtime |
| Specialist assignment (review/refactor/research/testing) | Multi-Agent Runtime |
| Node dependency resolution | Execution Graph Runtime |
| Task lifecycle within a node | Agent Runtime (via Multi-Agent) |

### Dispatch Pattern

```
Execution Graph Runtime
  → calls injected executor(nodeId, graphContext)
    → MultiAgentRuntime.executeNode(node)
      → AgentReport
  ← returns result to graph node
```

The executor is injected — Execution Graph Runtime does not import MultiAgentRuntime directly. This keeps the dependency graph clean and the runtime testable in isolation.

---

## 4. Graph History Model

### Data Structures

```typescript
interface GraphSnapshot {
  graphId: string;
  planId: string;
  version: number;
  status: GraphStatus;
  nodes: ExecutionNode[];
  edges: ExecutionEdge[];
  createdAt: number;
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
  action: 'created' | 'started' | 'node_dispatched' | 'node_completed' | 
          'node_failed' | 'completed' | 'failed' | 'archived';
  nodeId?: string;
  timestamp: number;
  details?: unknown;
}

interface GraphArchive {
  snapshots: GraphSnapshot[];
  records: ExecutionRecord[];
  replayCount: number;
  createdAt: number;
}
```

### Archive Triggers

| Trigger | What Gets Archived |
|---|---|
| Graph completed | Final snapshot + all execution records |
| Graph failed | Final snapshot + records up to failure |
| Graph cancelled | Snapshot + records up to cancellation |
| Graph replayed | New snapshot + replay metadata |
| User explicit export | Manual snapshot |

Archives are append-only. Snapshots are immutable once written.

---

## 5. Graph Lifecycle

### Statuses

```
created → validated → ready → running → completed
                                       → failed
                                       → cancelled
                              completed → archived
                              failed    → archived
```

### Legal Transitions

| From | To | Condition |
|---|---|---|
| `created` | `validated` | DAG validation passes |
| `created` | `failed` | Validation fails (cycles, orphans) |
| `validated` | `ready` | All prerequisites met |
| `ready` | `running` | User initiates execution |
| `running` | `completed` | All nodes reach terminal state, no failures |
| `running` | `failed` | Unrecoverable node failure |
| `running` | `cancelled` | User cancels |
| `completed` | `archived` | Auto or manual |
| `failed` | `archived` | Auto or manual |

### Illegal Transitions (prevented)

- `completed` → `running` (no re-execution without explicit replay)
- `archived` → any (archive is terminal)
- `validated` → `completed` (must pass through running)
- `failed` → `running` (requires new graph/replan)

---

## 6. Replay Design

### Replay Types

| Type | Description | Observational Only |
|---|---|---|
| `ReplayGraph` | Re-observe entire graph execution | ✅ Yes |
| `ReplayNode` | Re-observe a single node | ✅ Yes |
| `ReplayPath` | Re-observe a dependency chain | ✅ Yes |

### Constraints

- ❌ No automatic execution — user must explicitly initiate
- ❌ No permission bypass — all gates re-evaluated
- ❌ No state mutation — replay reads from archive, does not modify
- ❌ No diff application — even if original included diffs
- ✅ Read-only data flow: archive → graph snapshot → observable stream

### Data Flow

```
GraphArchive
    ↓
ReplayRequest (graphId, replayType, nodeId?)
    ↓
Load snapshot from archive
    ↓
Emit replay events (observable stream)
    ↓
UI renders replay timeline
```

---

## 7. Event Model — Graph Level

### Events

| Event | Emitted When |
|---|---|
| `graph.created` | New graph instantiated |
| `graph.validated` | DAG validation passes |
| `graph.started` | Execution begins |
| `graph.completed` | All nodes done, no failures |
| `graph.failed` | Execution halted by failure |
| `graph.cancelled` | User cancelled execution |
| `graph.archived` | Graph moved to archive |
| `graph.replayed` | Replay operation completed |
| `node.dispatched` | Node sent to Multi-Agent Runtime |
| `node.result` | Result received from Multi-Agent Runtime |
| `history.created` | New archive entry created |
| `replay.requested` | User initiates replay |
| `replay.completed` | Replay finishes |

### Event Schema

All events carry `type`, `graphId`, `timestamp` and typed payloads. Framework-agnostic. No React or DOM dependencies.

---

## 8. Persistence Strategy

**M12: in-memory with serializable archives.**

- `GraphArchive.toJSON()` / `GraphArchive.fromJSON()` for export
- Archives are JSON-serializable
- Schema version field for future migration
- No database dependency

**Future (M12+):**

- SQLite storage for archives
- Event sourcing: replay from `ExecutionRecord[]` stream
- Version migration paths

---

## 9. Visualization Compatibility

### Requirements for Future UI

The graph model must expose:

| For UI | Data |
|---|---|
| DAG diagram | `nodes[]`, `edges[]` with positions |
| Node state coloring | `node.status` (7 possible values) |
| Execution path highlight | Active/resolved dependency chain |
| Replay path | Historical node states |
| Progress indicator | `completedCount / totalCount` |
| Timeline | `ExecutionRecord[]` sorted by timestamp |

**No UI implementation in M12.** Only structural compatibility.

---

## 10. Risks

| Risk | Severity | Mitigation | Test Strategy |
|---|---|---|---|
| Graph state corruption | 🔴 High | Immutable snapshots; append-only archives | State transition test; concurrent access test |
| Archive unbounded growth | 🟡 Medium | Configurable max archives; manual purge API | Archive limit test |
| Replay misuse (auto-execution) | 🔴 High | Read-only replay; no side effects from replay | Replay isolation test |
| Event storm on large graphs | 🟢 Low | Batch emission; configurable debounce | 50-node graph event test |
| Runtime coupling to Planning Runtime | 🟡 Medium | Type-only imports; constructor injection | Dependency graph scan |
| Hidden execution paths | 🟡 Medium | All execution goes through explicit `run()` | Code audit for side-effect-free constructors |

---

## 11. Recommendation

### ✅ READY for M12 implementation

**Rationale:**

- M11 Planning Runtime is production-approved and stable
- Clear ownership split: Planning = what, Execution Graph = manage, Multi-Agent = execute
- Type-only import from planning-runtime prevents circular deps
- Injected executor pattern keeps Multi-Agent decoupled
- Archive/replay model is read-only by design — no safety risk
- All 9 existing packages unaffected — zero regression surface

---

*Architecture Review — 2026-06-12*
