import { describe, it, expect } from "vitest";
import { TaskPlanner } from "../src/index.js";

describe("Planner — Complex Prompts", () => {
  const p = new TaskPlanner();

  it("review and refactor", () => {
    const plan = p.createPlan("Please review and refactor the codebase");
    expect(plan.subTasks.some((s) => s.agentRole === "review")).toBe(true);
    expect(plan.subTasks.some((s) => s.agentRole === "refactor")).toBe(true);
  });

  it("all keywords", () => {
    const plan = p.createPlan("review refactor analyze test check quality performance optimize coverage");
    expect(plan.subTasks.length).toBeGreaterThanOrEqual(4);
  });

  it("case insensitive", () => {
    const plan = p.createPlan("REVIEW THE CODE");
    expect(plan.subTasks.some((s) => s.agentRole === "review")).toBe(true);
  });

  it("partial word matching", () => {
    const plan = p.createPlan("Need to review");
    expect(plan.subTasks.some((s) => s.agentRole === "review")).toBe(true);
  });

  it("code quality prompt", () => {
    const plan = p.createPlan("Check code quality and lint issues");
    expect(plan.subTasks.some((s) => s.agentRole === "review")).toBe(true);
  });

  it("performance optimization", () => {
    const plan = p.createPlan("Optimize performance of the main module");
    expect(plan.subTasks.some((s) => s.agentRole === "refactor")).toBe(true);
  });

  it("dependency analysis", () => {
    const plan = p.createPlan("Analyze project dependencies");
    expect(plan.subTasks.some((s) => s.agentRole === "research")).toBe(true);
  });

  it("coverage analysis", () => {
    const plan = p.createPlan("Check test coverage and add specs");
    expect(plan.subTasks.some((s) => s.agentRole === "testing")).toBe(true);
  });
});
