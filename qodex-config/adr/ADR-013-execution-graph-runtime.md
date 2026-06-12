# ADR-013 — Execution Graph Runtime

- **Status:** Accepted
- **Date:** 2026-06-12
- **Depends on:** ADR-012 — Planning & Execution Runtime

---

## Context

M11 introduced:

- Goal → Plan decomposition
- ExecutionGraph model (DAG of nodes and edges)
- GraphExecutor (sequential deterministic)
- Replanner (max depth=3)
- Serialization (exportGraph/importGraph)

The ExecutionGraph currently exists primarily as a planning artifact consumed by the GraphExecutor. Graph nodes are not yet first-class runtime entities with their own lifecycle, inspection surface, or persistence model.

The next milestone requires elevating the graph from a transient computational structure to a managed runtime artifact.

---

## Problem

Current execution model:

```
Goal → Plan → Sequential Execution → Result
```

This model works for simple, linear workflows. However, it does not support:

- **Graph visualization** — no navigable graph structure exposed to the UI
- **Graph persistence** — graphs live only in memory during execution
- **Graph inspection** — no ability to query node state mid-execution
- **Graph replay** — no capability to re-execute a prior graph or replay a path
- **Execution history** — no archive of past execution graphs
- **Node-level orchestration** — the GraphExecutor treats nodes as opaque work items
- **Future parallel execution** — the sequential-only design may obstruct concurrent node execution

A dedicated Execution Graph Runtime is required to manage the full lifecycle of execution graphs as first-class runtime entities.

---

## Decision

Introduce **Execution Graph Runtime** as a new package:

**Package:** `packages/execution-graph-runtime`

The Execution Graph Runtime sits between the Planning Runtime (which produces plans) and the Multi-Agent Runtime (which executes individual nodes). It manages the graph as a persistent, inspectable, replayable artifact.

---

## Responsibilities

### Execution Graph Runtime Owns ✅

| Concern | Description |
|---|---|
| **Graph lifecycle** | Create, validate, execute, complete, archive graphs |
| **Graph persistence model** | Serializable graph structure with versioning |
| **Graph validation** | DAG enforcement, cycle detection, orphan detection, dependency integrity |
| **Node orchestration** | Manage node readiness, dispatch, status transitions |
| **Graph traversal** | Topological sort, dependency-respecting walk |
| **Graph inspection** | Query node states, edge relationships, execution progress |
| **Graph replay** | Re-execute a prior graph or replay a specific path (observational only) |
| **Graph export/import** | Serialization round-trips for archiving and transfer |
| **Graph history** | Archive of completed/failed graphs with metadata |
| **Event emission** | Graph-level lifecycle events |

### Execution Graph Runtime Does NOT Own ❌

| Concern | Delegated To |
|---|---|
| Planning (goal → plan) | Planning Runtime (M11) |
| Agent execution | Agent Runtime → Multi-Agent Runtime |
| Provider calls | Provider SDK |
| Diff application | Diff Engine |
| Git operations | Git Runtime |
| MCP execution | MCP Runtime → Permission Engine |
| File writes | Diff Engine (proposal-gated) |
| Permission bypass | **NONE — forbidden at all layers** |

---

## Node Types

All 9 node types from M11 are supported:

| Node | Purpose |
|---|---|
| `goal` | Root — user's overall intent |
| `plan` | Structured plan decomposition |
| `task` | Work item delegated to an agent |
| `review` | Validation gate |
| `diff` | Patch proposal step |
| `checkpoint` | Git state snapshot |
| `approval` | User confirmation gate |
| `tool` | MCP tool call |
| `report` | Aggregation node |

Future node types may be added without breaking the DAG model.

---

## Graph Requirements

| Requirement | Description |
|---|---|
| **DAG-based** | All graphs must be acyclic; cycles rejected at construction |
| **Cycle detection** | DFS-based detection at validation time |
| **Orphan detection** | Nodes unreachable from root are flagged |
| **Serializable** | Full round-trip: graph → JSON → graph with zero loss |
| **Deterministic traversal** | Same graph produces same execution order every time |
| **Versioned** | Graphs carry a schema version for future compatibility |

---

## Replay

The Execution Graph Runtime may support:

- **Replay Graph** — re-create and observe the execution of a previously completed graph
- **Replay Node** — re-execute a single node in isolation for debugging
- **Replay Path** — re-execute a specific dependency chain within a graph

**Replay constraints:**

- ❌ Must never execute autonomously (requires explicit user action)
- ❌ Must never bypass permissions
- ❌ Must never auto-apply diffs or auto-commit
- ✅ Replay is **observational only** — the results inform the user but do not modify state without consent

---

## Persistence Strategy

M12 remains **in-memory** with serializable models. The graph model supports:

- `toJSON()` / `fromJSON()` round-trips
- Versioned schema for future migration
- Event-sourcing-friendly event stream

**Future persistence (M12+):**

- SQLite-backed graph storage
- Event sourcing for execution history
- Graph versioning and diff between graph versions

---

## Parallelism — Explicitly Deferred

M12 will remain **single-threaded and deterministic**. No concurrent execution. However, the graph model must not prevent future parallelism:

- Nodes declare explicit dependencies (not implicit ordering)
- Independent subgraphs are structurally detectable
- The execution model should accommodate a future `GraphScheduler` that could dispatch ready nodes in parallel

This is a design constraint, not an implementation deliverable for M12.

---

## Relationship to Existing Runtimes

```
Planning Runtime (M11)
    │
    │ Goal → Plan
    ↓
Execution Graph Runtime (M12)   ← THIS ADR
    │
    │ Plan → Graph Lifecycle
    ↓
Multi-Agent Runtime (M10)
    │
    │ Graph Node → Specialist Work
    ↓
Agent Runtime (M3)
    │
    │ Task execution
    ↓
Diff Engine + Git Runtime + MCP Runtime
```

The Execution Graph Runtime bridges the gap between planning and execution, making the graph a durable, inspectable artifact rather than a transient intermediate result.

---

## Safety Constraints

The Execution Graph Runtime **MUST NOT:**

- Execute shell commands
- Write files directly
- Apply diffs (delegated to Diff Engine)
- Commit to git (delegated to Git Runtime)
- Execute MCP tools (delegated to MCP Runtime → Permission Engine)
- Bypass user approval gates
- Execute autonomously (all execution requires explicit invocation)

---

## Consequences

### Benefits

- **Inspectable execution** — graph state queryable at any point
- **Replay support** — re-observe prior executions for debugging and audit
- **Graph visualization** — navigable DAG exposed to the desktop UI
- **Future persistence** — serialization model compatible with SQLite and event sourcing
- **Future automation** — graph scheduling, batching, and parallelization become feasible
- **Archival** — execution history preserved as versioned artifacts

### Tradeoffs

- **Additional runtime complexity** — another layer between planning and execution
- **Graph state management** — graphs become long-lived objects requiring lifecycle management
- **More events** — graph-level events add to the event surface
- **Package count increases** — 9 → 10 → 11 packages

---

## Related ADRs

- ADR-001 — Monorepo Architecture
- ADR-003 — Agent Runtime Orchestration
- ADR-012 — Planning & Execution Runtime

---

## Future Work

| Milestone | Description |
|---|---|
| M12 | Execution Graph Runtime (this ADR) |
| M13 | Internationalization |
| M14 | Marketplace Foundation |

---

## Decision Outcome

**Accepted.** Implemented in M12 — Execution Graph Runtime Foundation (78 tests, 78/78 passing, cross-package total 1070).
