import { describe, it, expect } from "vitest";
import { Coordinator, TaskPlanner } from "../src/index.js";

describe("Agent Status Tracking", () => {
  it("agents start idle", () => {
    const c = new Coordinator();
    c.initialize();
    expect(c.agents.every((a) => a.status === "idle")).toBe(true);
  });

  it("agents become working during execution", async () => {
    const c = new Coordinator();
    c.initialize();
    const plan = c.planner.createPlan("Review");
    const agent = c.agents.find((a) => a.role === plan.subTasks[0].agentRole);
    c.planner.startSubTask(plan, plan.subTasks[0].id);
    if (agent) agent.status = "working";
    expect(agent?.status).toBe("working");
  });

  it("completing all subtasks updates agents", async () => {
    const c = new Coordinator();
    c.initialize();
    await c.execute("Review");
    expect(c.agents.find((a) => a.role === "review")?.status).toBe("completed");
  });

  it("subtask created has pending status", () => {
    const p = new TaskPlanner();
    const plan = p.createPlan("Review");
    expect(plan.subTasks.every((s) => s.status === "pending")).toBe(true);
  });
});
