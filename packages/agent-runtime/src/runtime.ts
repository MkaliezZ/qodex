/**
 * Qodex Agent Runtime — Core Runtime
 *
 * Orchestrates the end-to-end execution flow:
 *   Prompt → Provider → Streamed Output → Events
 *
 * No UI code. No React. No Tauri. Pure runtime logic.
 */

import type { ModelProvider } from "@qodex/provider-sdk";
import type { AgentSession } from "./types/session.js";
import type { AgentTask } from "./types/task.js";
import { TaskStatus } from "./types/task.js";
import type { AnyAgentEvent, EventHandler } from "./types/event.js";

import { EventBus } from "./events/bus.js";
import { InMemorySessionStore } from "./sessions/store.js";
import { InMemoryTaskStore } from "./tasks/store.js";
import { TaskStateMachine } from "./state/machine.js";
import { MockStreamingProvider } from "./providers/mock.js";

export interface AgentRuntimeOptions {
  /** Pre-configured provider registry */
  providers?: Map<string, ModelProvider>;
  /** Default provider ID for task execution */
  defaultProviderId?: string;
  /** Default model ID for task execution */
  defaultModelId?: string;
}

/**
 * AgentRuntime — the central orchestration layer.
 *
 * Usage:
 * ```ts
 * const runtime = new AgentRuntime();
 * const session = runtime.createSession("My Session");
 *
 * runtime.subscribe((event) => {
 *   if (event.type === "message.chunk") console.log(event.payload.text);
 * });
 *
 * await runtime.runTask(session.id, "Hello!");
 * ```
 */
export class AgentRuntime {
  readonly eventBus: EventBus;
  readonly sessions: InMemorySessionStore;
  readonly tasks: InMemoryTaskStore;

  private providers = new Map<string, ModelProvider>();
  private defaultProviderId: string;
  private defaultModelId: string;

  constructor(options: AgentRuntimeOptions = {}) {
    this.eventBus = new EventBus();
    this.sessions = new InMemorySessionStore();
    this.tasks = new InMemoryTaskStore();

    this.providers = options.providers ?? new Map();
    this.defaultProviderId = options.defaultProviderId ?? "mock";
    this.defaultModelId = options.defaultModelId ?? "mock-model-1";

    // Register mock provider by default (fast for tests)
    if (!this.providers.has("mock")) {
      this.registerProvider(new MockStreamingProvider({ chunkDelayMs: 10 }));
    }
  }

  // ── Provider Management ─────────────────────────────

  registerProvider(provider: ModelProvider): void {
    this.providers.set(provider.id, provider);
  }

  getProvider(id: string): ModelProvider | undefined {
    return this.providers.get(id);
  }

  // ── Session Management ───────────────────────────────

  createSession(title: string = "Default Session"): AgentSession {
    return this.sessions.create(title);
  }

  getSession(id: string): AgentSession | undefined {
    return this.sessions.get(id);
  }

  listSessions(): AgentSession[] {
    return this.sessions.list();
  }

  // ── Task Management ──────────────────────────────────

  createTask(sessionId: string, prompt: string, modelId?: string): AgentTask {
    return this.tasks.create(sessionId, prompt, modelId ?? this.defaultModelId);
  }

  getTask(id: string): AgentTask | undefined {
    return this.tasks.get(id);
  }

  listTasks(sessionId?: string): AgentTask[] {
    return this.tasks.list(sessionId);
  }

  // ── Execution ────────────────────────────────────────

  /**
   * Run a task end-to-end:
   *   Idle → Planning → CallingModel → Streaming → Done
   *
   * Publishes events throughout the lifecycle for the UI to consume.
   */
  async runTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      this.publish({
        type: "task.failed",
        taskId,
        sessionId: "",
        timestamp: new Date().toISOString(),
        payload: { error: "Task not found" },
      });
      return;
    }

    const machine = new TaskStateMachine(task.status);

    try {
      // Publish task started
      this.publish({
        type: "task.started",
        taskId: task.id,
        sessionId: task.sessionId,
        timestamp: new Date().toISOString(),
        payload: { task },
      });

      // Idle → Planning
      this.transitionTask(task.id, machine, TaskStatus.Planning);
      await sleep(50);

      // Planning → CallingModel
      this.transitionTask(task.id, machine, TaskStatus.CallingModel);

      // Get the provider
      const providerId = this.defaultProviderId;
      const provider = this.providers.get(providerId);
      if (!provider) {
        throw new Error(`Provider "${providerId}" is not registered`);
      }

      // CallingModel → Streaming
      this.transitionTask(task.id, machine, TaskStatus.Streaming);

      // Stream the response
      const stream = provider.stream({
        model: task.modelId,
        messages: [{ role: "user", content: task.prompt }],
      });

      for await (const chunk of stream) {
        if (chunk.type === "text") {
          this.tasks.appendOutput(task.id, chunk.text);
          this.publish({
            type: "message.chunk",
            taskId: task.id,
            sessionId: task.sessionId,
            timestamp: new Date().toISOString(),
            payload: { text: chunk.text },
          });
        }
      }

      // Streaming → Done
      this.transitionTask(task.id, machine, TaskStatus.Done);

      const updatedTask = this.tasks.get(task.id)!;
      this.publish({
        type: "task.completed",
        taskId: task.id,
        sessionId: task.sessionId,
        timestamp: new Date().toISOString(),
        payload: { task: updatedTask },
      });

    } catch (err) {
      // → Failed
      this.transitionTask(task.id, machine, TaskStatus.Failed);
      this.publish({
        type: "task.failed",
        taskId: task.id,
        sessionId: task.sessionId,
        timestamp: new Date().toISOString(),
        payload: { error: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  /**
   * Cancel a running task.
   */
  cancelTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const machine = new TaskStateMachine(task.status);
    if (machine.tryTransition(TaskStatus.Cancelled)) {
      this.tasks.updateStatus(taskId, TaskStatus.Cancelled);
      this.publish({
        type: "task.cancelled",
        taskId,
        sessionId: task.sessionId,
        timestamp: new Date().toISOString(),
        payload: { task: this.tasks.get(taskId)! },
      });
    }
  }

  // ── Event Subscription ───────────────────────────────

  subscribe(handler: EventHandler): () => void {
    return this.eventBus.subscribeAll(handler);
  }

  unsubscribe(handler: EventHandler): void {
    this.eventBus.unsubscribe("*" as any, handler);
  }

  // ── Internal ─────────────────────────────────────────

  private publish(event: AnyAgentEvent): void {
    this.eventBus.publish(event);
  }

  private transitionTask(
    taskId: string,
    machine: TaskStateMachine,
    to: TaskStatus,
  ): void {
    const previous = machine.status;
    machine.transition(to);
    this.tasks.updateStatus(taskId, to);
    this.publish({
      type: "task.status_changed",
      taskId,
      sessionId: this.tasks.get(taskId)?.sessionId ?? "",
      timestamp: new Date().toISOString(),
      payload: { status: to, previousStatus: previous },
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
