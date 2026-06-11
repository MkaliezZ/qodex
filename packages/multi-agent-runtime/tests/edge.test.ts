import { describe, it, expect } from "vitest";
import { MultiAgentRuntime, Coordinator, TaskPlanner, SpecialistFactory } from "../src/index.js";

describe("Edge Cases", () => {
  it("empty prompt still produces default plan", () => {
    const p = new TaskPlanner();
    const plan = p.createPlan("");
    expect(plan.subTasks.length).toBeGreaterThanOrEqual(1);
  });

  it("very long prompt doesn't crash", () => {
    const p = new TaskPlanner();
    const plan = p.createPlan("a".repeat(10000));
    expect(plan.subTasks.length).toBeGreaterThanOrEqual(1);
  });

  it("runtime without init has no agents", () => {
    const rt = new MultiAgentRuntime();
    expect(rt.agents).toHaveLength(0);
  });

  it("report list initially empty", () => {
    const rt = new MultiAgentRuntime();
    expect(rt.reports).toHaveLength(0);
  });

  it("latestReport null when no executions", () => {
    const rt = new MultiAgentRuntime();
    expect(rt.latestReport).toBeNull();
  });

  it("coordinator without init has no agents", () => {
    const c = new Coordinator();
    expect(c.agents).toHaveLength(0);
  });

  it("currentPlan null before execution", () => {
    const c = new Coordinator();
    expect(c.currentPlan).toBeNull();
  });

  it("currentReport null before execution", () => {
    const c = new Coordinator();
    expect(c.currentReport).toBeNull();
  });

  it("specialist roles cover all agent types", () => {
    const f = new SpecialistFactory();
    const agents = f.createDefaultSet();
    const roles = agents.map((a) => a.role);
    expect(roles).toContain("review");
    expect(roles).toContain("refactor");
    expect(roles).toContain("research");
    expect(roles).toContain("testing");
  });
});
