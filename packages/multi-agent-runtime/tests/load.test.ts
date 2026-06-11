import { describe, it, expect } from "vitest";
import { Coordinator, AgentEventBus, TaskPlanner } from "../src/index.js";

describe("Load Tests", () => {
  it("1000 events via EventBus", () => {
    const b = new AgentEventBus(); let c = 0;
    b.subscribe(() => c++);
    for (let i = 0; i < 1000; i++) b.publish("agent.created", {});
    expect(c).toBe(1000);
  });

  it("50 subtask plans without issue", () => {
    const p = new TaskPlanner();
    for (let i = 0; i < 50; i++) {
      const plan = p.createPlan(`Review iteration ${i}`);
      expect(plan.subTasks.length).toBeGreaterThan(0);
    }
  });

  it("10 sequential coordinator executions", async () => {
    const c = new Coordinator();
    c.initialize();
    for (let i = 0; i < 10; i++) {
      const report = await c.execute(`Task ${i}`);
      expect(report.summary).toBeTruthy();
    }
  });

  it("100 agents registered via events", () => {
    const b = new AgentEventBus(); let count = 0;
    b.subscribe(() => count++);
    for (let i = 0; i < 100; i++) b.publish("agent.created", { id: String(i) });
    expect(count).toBe(100);
  });
});
