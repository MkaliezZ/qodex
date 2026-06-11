import { describe, it, expect } from "vitest";
import { InMemoryTaskStore } from "../src/tasks/store.js";
import { TaskStatus } from "../src/types/task.js";

describe("InMemoryTaskStore", () => {
  it("creates a task", () => {
    const store = new InMemoryTaskStore();
    const task = store.create("s1", "Hello", "mock-model-1");
    expect(task.sessionId).toBe("s1");
    expect(task.prompt).toBe("Hello");
    expect(task.status).toBe(TaskStatus.Idle);
    expect(task.id).toBeTruthy();
  });

  it("retrieves a task by id", () => {
    const store = new InMemoryTaskStore();
    const task = store.create("s1", "Hi", "m1");
    expect(store.get(task.id)).toBeDefined();
  });

  it("updates task status", () => {
    const store = new InMemoryTaskStore();
    const task = store.create("s1", "Hi", "m1");
    store.updateStatus(task.id, TaskStatus.Planning);
    expect(store.get(task.id)!.status).toBe(TaskStatus.Planning);
  });

  it("appends output text", () => {
    const store = new InMemoryTaskStore();
    const task = store.create("s1", "Hi", "m1");
    store.appendOutput(task.id, "Hello");
    store.appendOutput(task.id, " World");
    expect(store.get(task.id)!.output).toBe("Hello World");
  });

  it("lists tasks filtered by session", () => {
    const store = new InMemoryTaskStore();
    store.create("s1", "A", "m1");
    store.create("s1", "B", "m1");
    store.create("s2", "C", "m1");
    expect(store.list("s1")).toHaveLength(2);
    expect(store.list("s2")).toHaveLength(1);
  });

  it("returns undefined for unknown task when updating status", () => {
    const store = new InMemoryTaskStore();
    expect(store.updateStatus("ghost", TaskStatus.Done)).toBeUndefined();
  });
});
