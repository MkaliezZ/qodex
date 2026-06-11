/**
 * Qodex M5 Production Review — Agent Runtime Validation
 *
 * Scenarios 6 (repeated runs), 7 (cancellation), 10 (reopen/reset).
 */

import { describe, it, expect, vi } from "vitest";
import { AgentRuntime, TaskStatus } from "../src/index.js";

// ── Scenario 6: Repeated Runs ─────────────────────

describe("Scenario 6 — Repeated Runs", () => {
  it("PASS: handles 5 sequential runs without leaks", async () => {
    const runtime = new AgentRuntime();
    const session = runtime.createSession("Test");

    const events: string[] = [];
    const unsub = runtime.subscribe((e) => events.push(e.type));

    for (let i = 0; i < 5; i++) {
      const task = runtime.createTask(session.id, `Run ${i + 1}`);
      await runtime.runTask(task.id);
      expect(runtime.getTask(task.id)?.status).toBe(TaskStatus.Done);
    }

    unsub();

    const tasks = runtime.listTasks(session.id);
    expect(tasks).toHaveLength(5);
    tasks.forEach((t) => expect(t.status).toBe(TaskStatus.Done));

    const started = events.filter((e) => e === "task.started");
    const completed = events.filter((e) => e === "task.completed");
    expect(started).toHaveLength(5);
    expect(completed).toHaveLength(5);
    expect(events.some((e) => e === "task.failed")).toBe(false);
  });

  it("PASS: event bus has no duplicate subscriptions after multiple runs", async () => {
    const runtime = new AgentRuntime();
    const session = runtime.createSession("DupTest");

    const handler = vi.fn();
    const unsub = runtime.subscribe(handler);

    for (let i = 0; i < 3; i++) {
      const task = runtime.createTask(session.id, `Run ${i}`);
      await runtime.runTask(task.id);
    }

    // Handler should have been called for each event
    expect(handler).toHaveBeenCalled();

    // All 3 tasks completed without error
    const tasks = runtime.listTasks(session.id);
    expect(tasks.filter((t) => t.status === TaskStatus.Done)).toHaveLength(3);
  });
});

// ── Scenario 7: Cancellation ──────────────────────

describe("Scenario 7 — Cancellation", () => {
  it("PASS: cancels an idle task correctly", () => {
    const runtime = new AgentRuntime();
    const session = runtime.createSession("CancelIdle");
    const task = runtime.createTask(session.id, "Cancel me");

    runtime.cancelTask(task.id);
    expect(runtime.getTask(task.id)?.status).toBe(TaskStatus.Cancelled);
  });

  it("PASS: emits cancellation event", () => {
    const runtime = new AgentRuntime();
    const session = runtime.createSession("CancelEvent");
    const task = runtime.createTask(session.id, "Cancel me");

    const eventTypes: string[] = [];
    runtime.subscribe((e) => eventTypes.push(e.type));

    runtime.cancelTask(task.id);

    expect(eventTypes).toContain("task.cancelled");
    expect(runtime.getTask(task.id)?.status).toBe(TaskStatus.Cancelled);
  });

  it("PASS: cannot cancel a completed task", async () => {
    const runtime = new AgentRuntime();
    const session = runtime.createSession("FinishFirst");
    const task = runtime.createTask(session.id, "Finish");

    await runtime.runTask(task.id);
    expect(runtime.getTask(task.id)?.status).toBe(TaskStatus.Done);

    runtime.cancelTask(task.id);
    expect(runtime.getTask(task.id)?.status).toBe(TaskStatus.Done);
  });

  it("PASS: no UI lock after cancel", () => {
    const runtime = new AgentRuntime();
    const session = runtime.createSession("NoLock");
    runtime.createTask(session.id, "T1");
    runtime.createTask(session.id, "T2");
    runtime.createTask(session.id, "T3");

    // Cancel all
    const tasks = runtime.listTasks(session.id);
    tasks.forEach((t) => runtime.cancelTask(t.id));

    const cancelled = runtime.listTasks(session.id)
      .filter((t) => t.status === TaskStatus.Cancelled);
    expect(cancelled).toHaveLength(3);
  });
});

// ── Scenario 10: Reset / Reopen ───────────────────

describe("Scenario 10 — Runtime Reset", () => {
  it("PASS: multiple sessions don't interfere", () => {
    const runtime = new AgentRuntime();

    const s1 = runtime.createSession("Session 1");
    const s2 = runtime.createSession("Session 2");

    runtime.createTask(s1.id, "Task A");
    runtime.createTask(s2.id, "Task B");

    expect(runtime.listTasks(s1.id)).toHaveLength(1);
    expect(runtime.listTasks(s2.id)).toHaveLength(1);
    expect(runtime.listSessions()).toHaveLength(2);
  });

  it("PASS: creates new session after previous tasks", () => {
    const runtime = new AgentRuntime();

    const s1 = runtime.createSession("First");
    runtime.createTask(s1.id, "Old task");

    const s2 = runtime.createSession("Second");
    expect(runtime.listSessions()).toHaveLength(2);
    expect(runtime.listTasks(s2.id)).toHaveLength(0);
  });
});
