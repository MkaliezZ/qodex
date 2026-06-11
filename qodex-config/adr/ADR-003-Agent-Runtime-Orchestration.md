# ADR-003

**Status:** Accepted
**Date:** 2026-06-12

## Context

Qodex needs to manage task execution across multiple providers, handle streaming responses, support cancellation, and integrate with the UI. The orchestration layer must be testable without a browser, decoupled from React, and extensible for future features (patches, checkpoints, skills).

## Decision

Use an event-driven runtime architecture with a formal state machine:

```
AgentRuntime
    ├── TaskStateMachine     — 7 states with validated transitions
    ├── EventBus             — pub/sub for runtime→UI communication
    ├── SessionStore         — in-memory session management
    └── TaskStore            — in-memory task management
```

**State machine:**
```
Idle → Planning → CallingModel → Streaming → Done
↓        ↓           ↓               ↓
Failed  Cancelled   Cancelled       Cancelled/Failed
```

**Event types:**
- `task.started` — Task begins execution
- `task.status_changed` — State transition occurred
- `message.chunk` — Streaming text delta
- `task.completed` — Task finished successfully
- `task.failed` — Task encountered an error
- `task.cancelled` — Task was cancelled by user
- `patch.proposed` — Patch proposal created (M6)
- `patch.applied` — Patch applied (M6)
- `patch.rejected` — Patch rejected (M6)

All runtime-to-UI communication flows through events. The runtime has zero React imports.

## Consequences

**Positive:**
- Runtime is fully testable without a browser or React
- UI subscribes to events and renders reactively
- New event types can be added without modifying existing handlers
- State machine prevents illegal state transitions at the type level

**Negative:**
- Event-based architecture means debugging requires tracing event flow
- In-memory stores mean data is lost on page refresh (database planned for later)

## Alternatives Considered

1. **Promise-based orchestration**: Rejected — cancellation and streaming require more than a single promise chain.
2. **Observable pattern (RxJS)**: Rejected — EventBus is simpler and sufficient for the current scale.
3. **Direct React state management (Redux/Zustand)**: Rejected — runtime must be framework-agnostic.
