import { describe, it, expect } from "vitest";
import { TaskStateMachine } from "../src/state/machine.js";
import { TaskStatus, canTransition } from "../src/types/task.js";

describe("TaskStateMachine", () => {
  it("starts at Idle by default", () => {
    const sm = new TaskStateMachine();
    expect(sm.status).toBe(TaskStatus.Idle);
  });

  it("transitions Idle → Planning", () => {
    const sm = new TaskStateMachine();
    sm.transition(TaskStatus.Planning);
    expect(sm.status).toBe(TaskStatus.Planning);
  });

  it("transitions through the happy path", () => {
    const sm = new TaskStateMachine();
    sm.transition(TaskStatus.Planning);
    sm.transition(TaskStatus.CallingModel);
    sm.transition(TaskStatus.Streaming);
    sm.transition(TaskStatus.Done);
    expect(sm.status).toBe(TaskStatus.Done);
  });

  it("throws on invalid transition", () => {
    const sm = new TaskStateMachine();
    expect(() => sm.transition(TaskStatus.Done)).toThrow(
      "Invalid state transition: Idle → Done",
    );
  });

  it("tryTransition returns false on invalid", () => {
    const sm = new TaskStateMachine();
    expect(sm.tryTransition(TaskStatus.Done)).toBe(false);
    expect(sm.status).toBe(TaskStatus.Idle); // unchanged
  });

  it("isTerminal returns true for Done", () => {
    const sm = new TaskStateMachine(TaskStatus.Done);
    expect(sm.isTerminal()).toBe(true);
  });

  it("isTerminal returns true for Failed", () => {
    const sm = new TaskStateMachine(TaskStatus.Failed);
    expect(sm.isTerminal()).toBe(true);
  });

  it("isTerminal returns false for non-terminal states", () => {
    const sm = new TaskStateMachine(TaskStatus.Streaming);
    expect(sm.isTerminal()).toBe(false);
  });

  it("reset goes back to Idle", () => {
    const sm = new TaskStateMachine(TaskStatus.Done);
    sm.reset();
    expect(sm.status).toBe(TaskStatus.Idle);
  });

  it("canTransition utility works", () => {
    expect(canTransition(TaskStatus.Idle, TaskStatus.Planning)).toBe(true);
    expect(canTransition(TaskStatus.Idle, TaskStatus.Failed)).toBe(true);
    expect(canTransition(TaskStatus.Idle, TaskStatus.Done)).toBe(false);
  });
});
