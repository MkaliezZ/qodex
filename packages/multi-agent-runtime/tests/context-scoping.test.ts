import { describe, it, expect } from "vitest";
import { TaskPlanner } from "../src/index.js";

describe("Context Scoping", () => {
  const p = new TaskPlanner();

  it("each subtask has defined scope", () => {
    const plan = p.createPlan("Review and test");
    for (const st of plan.subTasks) {
      expect(st.scope.length).toBeGreaterThan(0);
    }
  });

  it("buildScopeContext produces non-empty context", () => {
    const plan = p.createPlan("Review");
    const ctx = p.buildScopeContext(plan.subTasks[0]);
    expect(ctx.length).toBeGreaterThan(10);
  });

  it("review tasks scope src/", () => {
    const plan = p.createPlan("Review codebase");
    const reviews = plan.subTasks.filter((s) => s.agentRole === "review");
    for (const r of reviews) {
      expect(r.scope.some((s) => s.includes("src"))).toBe(true);
    }
  });

  it("testing tasks scope src/ and test files", () => {
    const plan = p.createPlan("Add tests");
    const tests = plan.subTasks.filter((s) => s.agentRole === "testing");
    for (const t of tests) {
      expect(t.scope.length).toBeGreaterThan(0);
    }
  });

  it("scope is deterministic for same prompt", () => {
    const p1 = p.createPlan("Review code");
    const p2 = p.createPlan("Review code");
    expect(p1.subTasks.length).toBe(p2.subTasks.length);
  });
});
