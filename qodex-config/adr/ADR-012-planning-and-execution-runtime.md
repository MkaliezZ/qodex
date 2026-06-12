# ADR-012 — Planning & Execution Runtime

- **Status:** Proposed
- **Date:** 2026-06-12
- **Decided by:** Qodex Team

---

## Context

Qodex currently contains:

- Provider SDK
- Project Runtime
- Context Engine
- Agent Runtime
- Diff Engine
- Git Runtime
- Skill Runtime
- MCP Runtime
- Multi-Agent Runtime

The system can:

- load context
- execute agents
- produce diffs
- manage checkpoints
- coordinate specialists

However, the system lacks a planning layer. Tasks are executed directly from prompts with no execution graph, no plan lifecycle, and no replanning capability.

---

## Problem

Current flow:

```
User Prompt → Context → Agent Runtime → Result
```

This model works for short, single-task interactions. It does not scale well for:

- multi-step work requiring sequential or parallel execution
- long-running tasks spanning multiple agent invocations
- agent coordination across specialist roles
- checkpointed execution with state persistence
- recovery after partial failure

A dedicated planning runtime is required to bridge single-prompt execution to structured, multi-step workflows.

---

## Decision

Introduce **Planning & Execution Runtime** as a new package:

**Proposed package:** `packages/planning-runtime`

The planning runtime sits between user intent and agent execution, decomposing goals into structured plans and managing execution state across the runtime stack.

---

## Responsibilities

**Planning Runtime owns:**

- goal decomposition (breaking user intent into sub-tasks)
- task planning (ordering, dependencies, constraints)
- execution graph generation (DAG of execution nodes)
- dependency tracking (node readiness, blocking conditions)
- execution state (pending / running / completed / failed)
- re-planning (revising plans when execution diverges)

**Planning Runtime does NOT own:**

- model execution (delegated to Agent Runtime via Provider SDK)
- diff generation (delegated to Diff Engine)
- git operations (delegated to Git Runtime)
- MCP execution (delegated to MCP Runtime)
- skill resolution (delegated to Skill Runtime)

All concerns remain delegated — the planning runtime coordinates, it does not execute.

---

## High-Level Flow

```
User Goal
    ↓
Planning Runtime (decompose, plan, graph)
    ↓
Execution Graph (DAG)
    ↓
Multi-Agent Runtime (coordinate specialists)
    ↓
Agent Runtime (execute tasks)
    ↓
Diff Engine (generate patches)
    ↓
Git Runtime (checkpoint)
    ↓
Result
```

---

## Execution Graph

Work is represented as a Directed Acyclic Graph (DAG).

**Node Types:**

| Node | Purpose |
|:--|:--|
| `plan` | Root node representing the overall goal |
| `task` | A discrete unit of work delegated to an agent |
| `review` | Validation gate requiring human or automated review |
| `diff` | Patch proposal from the Diff Engine |
| `checkpoint` | Git state snapshot |
| `approval` | Blocking gate requiring explicit user confirmation |

**Edges** define execution dependencies between nodes. Execution is deterministic — given the same input and state, the same execution graph and outcomes are produced.

---

## Replanning

The Planning Runtime may create a revised plan when:

- a node fails and the graph cannot proceed
- dependencies change during execution
- the user explicitly requests plan revision

Replanning must require explicit invocation; the runtime must not autonomously replan without user direction. This preserves user control and prevents unbounded autonomous behavior.

---

## Safety Constraints

The Planning Runtime **MUST NOT:**

- execute shell commands
- bypass the permission layer
- modify files directly
- apply diffs without user review
- create or destroy git history autonomously

All modifications continue through the established pipeline:

```
Diff Engine → User Review → Apply
```

The planning runtime describes *what* should happen; other runtimes execute *how*.

---

## Consequences

### Benefits

- **Scalable task execution:** structured decomposition enables arbitrary work depth
- **Deterministic workflows:** DAG-based plans are reproducible and auditable
- **Recovery surface:** explicit execution state enables partial retry
- **Future automation:** execution graphs enable scheduling, batching, and persistence
- **Visibility:** plans expose execution intent before work begins

### Tradeoffs

- **Increased complexity:** an additional coordination layer with its own state model
- **Additional runtime package:** new package to test, document, and maintain
- **State management:** execution graph requires in-memory state tracking
- **Constraints on agent freedom:** structured plans may feel less fluid than direct execution

---

## Related ADRs

- ADR-001 — Monorepo Architecture
- ADR-003 — Agent Runtime Orchestration
- ADR-004 — Context Assembly Pipeline

---

## Future Work

| Milestone | Description |
|:--|:--|
| M11 | Planning Runtime Foundation |
| M12 | Execution Graph Runtime |
| M13 | Internationalization |
| M14 | Marketplace Foundation |

---

## Decision Outcome

**Proposed.** Pending implementation in M11 — Planning & Execution Runtime.
