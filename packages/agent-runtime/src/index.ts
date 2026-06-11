/**
 * Qodex Agent Runtime — Entry Point
 *
 * Re-exports all public interfaces and classes.
 * Consumers import from this single module:
 *
 *   import { AgentRuntime, TaskStatus } from "@qodex/agent-runtime";
 */

// ── Types ────────────────────────────────────────────
export {
  TaskStatus,
  canTransition,
} from "./types/task.js";
export type { AgentTask } from "./types/task.js";
export type { AgentSession } from "./types/session.js";
export type {
  AgentEventType,
  AgentEvent,
  TaskStartedEvent,
  TaskStatusChangedEvent,
  MessageChunkEvent,
  TaskCompletedEvent,
  TaskFailedEvent,
  TaskCancelledEvent,
  PatchProposedEvent,
  PatchAppliedEvent,
  PatchRejectedEvent,
  AnyAgentEvent,
  EventHandler,
} from "./types/event.js";

// ── Runtime ─────────────────────────────────────────
export { AgentRuntime } from "./runtime.js";
export type { AgentRuntimeOptions } from "./runtime.js";

// ── Event Bus ────────────────────────────────────────
export { EventBus } from "./events/bus.js";

// ── Stores ───────────────────────────────────────────
export { InMemorySessionStore } from "./sessions/store.js";
export { InMemoryTaskStore } from "./tasks/store.js";

// ── State Machine ────────────────────────────────────
export { TaskStateMachine } from "./state/machine.js";

// ── Mock Provider ────────────────────────────────────
export { MockStreamingProvider } from "./providers/mock.js";
export type { MockProviderOptions } from "./providers/mock.js";
