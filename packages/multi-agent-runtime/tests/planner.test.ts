import { describe, it, expect } from "vitest";
import { TaskPlanner } from "../src/index.js";

describe("TaskPlanner", () => {
  const p = new TaskPlanner();

  it("creates plan for review prompt", () => {
    const plan = p.createPlan("Review the codebase");
    expect(plan.subTasks.length).toBeGreaterThan(0);
    expect(plan.subTasks.some((s) => s.agentRole === "review")).toBe(true);
  });

  it("creates plan for refactor prompt", () => {
    const plan = p.createPlan("Refactor the main module");
    expect(plan.subTasks.some((s) => s.agentRole === "refactor")).toBe(true);
  });

  it("creates plan for research prompt", () => {
    const plan = p.createPlan("Analyze project dependencies");
    expect(plan.subTasks.some((s) => s.agentRole === "research")).toBe(true);
  });

  it("creates plan for testing prompt", () => {
    const plan = p.createPlan("Add unit tests for core");
    expect(plan.subTasks.some((s) => s.agentRole === "testing")).toBe(true);
  });

  it("default plan for unrelated prompt", () => {
    const plan = p.createPlan("Hello world");
    expect(plan.subTasks.length).toBeGreaterThanOrEqual(1);
  });

  it("marks subtask as working", () => {
    const plan = p.createPlan("Review code");
    p.startSubTask(plan, plan.subTasks[0].id);
    expect(plan.subTasks[0].status).toBe("working");
  });

  it("completes subtask with output", () => {
    const plan = p.createPlan("Review");
    p.completeSubTask(plan, plan.subTasks[0].id, "All good");
    expect(plan.subTasks[0].status).toBe("completed");
    expect(plan.subTasks[0].output).toBe("All good");
  });

  it("fails subtask", () => {
    const plan = p.createPlan("Review");
    p.failSubTask(plan, plan.subTasks[0].id, "Error");
    expect(plan.subTasks[0].status).toBe("failed");
  });

  it("isComplete returns true when all done", () => {
    const plan = p.createPlan("Review");
    plan.subTasks.forEach((s) => { s.status = "completed"; });
    expect(p.isComplete(plan)).toBe(true);
  });

  it("isComplete returns false when pending", () => {
    const plan = p.createPlan("Review");
    expect(p.isComplete(plan)).toBe(false);
  });

  it("buildScopeContext returns formatted scope", () => {
    const plan = p.createPlan("Review");
    const ctx = p.buildScopeContext(plan.subTasks[0]);
    expect(ctx).toContain("Scope:");
    expect(ctx).toContain("Task:");
  });

  it("plan has unique subtask IDs", () => {
    const plan = p.createPlan("Review and refactor");
    const ids = plan.subTasks.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
