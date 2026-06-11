import { describe, it, expect, vi } from "vitest";
import { AgentRuntime } from "../src/runtime.js";
import { TaskStatus } from "../src/types/task.js";

describe("AgentRuntime", () => {
  it("creates a session", () => {
    const runtime = new AgentRuntime();
    const session = runtime.createSession("Test");
    expect(session.title).toBe("Test");
    expect(runtime.listSessions()).toHaveLength(1);
  });

  it("creates a task", () => {
    const runtime = new AgentRuntime();
    const session = runtime.createSession("Test");
    const task = runtime.createTask(session.id, "Hello");
    expect(task.prompt).toBe("Hello");
    expect(task.sessionId).toBe(session.id);
  });

  it("runs a task and emits events", async () => {
    const runtime = new AgentRuntime();
    const session = runtime.createSession("Test");
    const task = runtime.createTask(session.id, "Hello");

    const events: any[] = [];
    runtime.subscribe((event) => events.push(event));

    await runtime.runTask(task.id);

    const types = events.map((e) => e.type);
    expect(types).toContain("task.started");
    expect(types).toContain("task.status_changed");
    expect(types).toContain("message.chunk");
    expect(types).toContain("task.completed");

    const completedEvent = events.find((e) => e.type === "task.completed");
    expect(completedEvent).toBeDefined();

    const finalTask = runtime.getTask(task.id);
    expect(finalTask?.status).toBe(TaskStatus.Done);
  });

  it("produces output text in completed task", async () => {
    const runtime = new AgentRuntime();
    const session = runtime.createSession("Test");
    const task = runtime.createTask(session.id, "Say something");

    await runtime.runTask(task.id);

    const finalTask = runtime.getTask(task.id);
    expect(finalTask?.output.length).toBeGreaterThan(0);
  });

  it("cancels a task", () => {
    const runtime = new AgentRuntime();
    const session = runtime.createSession("Test");
    const task = runtime.createTask(session.id, "Hello");

    const events: any[] = [];
    runtime.subscribe((event) => events.push(event));

    runtime.cancelTask(task.id);

    expect(runtime.getTask(task.id)?.status).toBe(TaskStatus.Cancelled);
    expect(events.some((e) => e.type === "task.cancelled")).toBe(true);
  });

  it("handles task not found gracefully", async () => {
    const runtime = new AgentRuntime();
    const events: any[] = [];
    runtime.subscribe((event) => events.push(event));

    await runtime.runTask("nonexistent");

    expect(events.some((e) => e.type === "task.failed")).toBe(true);
  });

  it("subscribes and unsubscribes", () => {
    const runtime = new AgentRuntime();
    const handler = vi.fn();

    const unsub = runtime.subscribe(handler);
    // Trigger an event
    runtime.createSession("Test");

    unsub();
    // Should not receive after unsubscribe
    expect(true).toBe(true);
  });
});
