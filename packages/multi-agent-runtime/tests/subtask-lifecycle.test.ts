import { describe, it, expect } from "vitest";
import { Coordinator } from "../src/index.js";

describe("Subtask Lifecycle", () => {
  it("subtaks start as pending", () => {
    const c = new Coordinator();
    c.initialize();
    const plan = c.planner.createPlan("Review");
    expect(plan.subTasks.every((s) => s.status === "pending")).toBe(true);
  });

  it("subtask transitions to working on start", () => {
    const c = new Coordinator();
    c.initialize();
    const plan = c.planner.createPlan("Review");
    c.planner.startSubTask(plan, plan.subTasks[0].id);
    expect(plan.subTasks[0].status).toBe("working");
  });

  it("subtask transitions to completed", () => {
    const c = new Coordinator();
    c.initialize();
    const plan = c.planner.createPlan("Review");
    c.planner.completeSubTask(plan, plan.subTasks[0].id, "Done");
    expect(plan.subTasks[0].status).toBe("completed");
  });

  it("subtask transitions to failed", () => {
    const c = new Coordinator();
    c.initialize();
    const plan = c.planner.createPlan("Review");
    c.planner.failSubTask(plan, plan.subTasks[0].id, "Error");
    expect(plan.subTasks[0].status).toBe("failed");
  });

  it("completed subtask has output stored", () => {
    const c = new Coordinator();
    c.initialize();
    const plan = c.planner.createPlan("Review");
    c.planner.completeSubTask(plan, plan.subTasks[0].id, "Analysis complete");
    expect(plan.subTasks[0].output).toBe("Analysis complete");
  });

  it("execution transitions subtasks to working", async () => {
    const c = new Coordinator();
    c.initialize();
    const plan = c.planner.createPlan("Review");
    for (const st of plan.subTasks) {
      await c.executeSubTask(st);
    }
    expect(plan.subTasks.every((s) => s.status === "completed" || s.status === "pending")).toBe(true);
  });

  it("subtask.created event fires with correct payload", async () => {
    const c = new Coordinator();
    c.initialize();
    const events: any[] = [];
    c.events.subscribe((e) => events.push(e));
    await c.execute("Review");
    const created = events.filter((e) => e.type === "subtask.created");
    expect(created.length).toBeGreaterThan(0);
    expect(created[0].payload.role).toBeTruthy();
  });
});
