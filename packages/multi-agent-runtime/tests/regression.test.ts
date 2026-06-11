import { describe, it, expect } from "vitest";
import { MultiAgentRuntime, Coordinator, TaskPlanner, AgentEventBus, SpecialistFactory } from "../src/index.js";

describe("Regression Tests", () => {
  it("all components instantiate", () => {
    expect(() => new TaskPlanner()).not.toThrow();
    expect(() => new Coordinator()).not.toThrow();
    expect(() => new AgentEventBus()).not.toThrow();
    expect(() => new SpecialistFactory()).not.toThrow();
    expect(() => new MultiAgentRuntime()).not.toThrow();
  });

  it("runtime can be initialized twice", () => {
    const rt = new MultiAgentRuntime();
    rt.initialize();
    rt.initialize();
    expect(rt.agents).toHaveLength(4);
  });

  it("coordinator plan changes between prompts", async () => {
    const c = new Coordinator();
    c.initialize();
    const r1 = await c.execute("Review code");
    const r2 = await c.execute("Add tests");
    expect(r1.summary).not.toBe(r2.summary);
  });

  it("event subscription count is correct", () => {
    const b = new AgentEventBus();
    const u1 = b.subscribe(() => {});
    const u2 = b.subscribe(() => {});
    expect(b.size).toBe(2);
    u1(); u2();
    expect(b.size).toBe(0);
  });

  it("plan id is unique per call", () => {
    const p = new TaskPlanner();
    const p1 = p.createPlan("Review");
    const p2 = p.createPlan("Review");
    expect(p1.id).not.toBe(p2.id);
  });
});
