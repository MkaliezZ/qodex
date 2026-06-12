import { describe, it, expect } from "vitest";
import { Planner } from "../src/planner/planner.js";

describe("Planner", () => {
  const planner = new Planner();

  describe("createPlan", () => {
    it("creates a plan from a simple goal", () => {
      const plan = planner.createPlan({
        id: "goal-1",
        description: "Review this project",
        timestamp: Date.now(),
      });

      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.id).toMatch(/^plan-/);
      expect(plan.goalId).toBe("goal-1");
    });

    it("produces deterministic output for the same goal description", () => {
      const goal = { id: "g-1", description: "Fix a bug in the parser", timestamp: 0 };
      const p1 = planner.createPlan(goal);
      const p2 = planner.createPlan(goal);

      expect(p1.steps.length).toBe(p2.steps.length);
      expect(p1.steps.map((s) => s.type)).toEqual(p2.steps.map((s) => s.type));
    });

    it("decomposes 'fix' keywords into bug workflow", () => {
      const plan = planner.createPlan({
        id: "g-2",
        description: "Fix the login bug",
        timestamp: Date.now(),
      });

      const types = plan.steps.map((s) => s.type);
      expect(types).toContain("task");
      expect(types).toContain("diff");
      expect(types).toContain("review");
      expect(types).toContain("approval");
    });

    it("decomposes 'refactor' keywords into refactor workflow", () => {
      const plan = planner.createPlan({
        id: "g-3",
        description: "Refactor the auth module",
        timestamp: Date.now(),
      });

      expect(plan.steps.some((s) => s.type === "checkpoint")).toBe(true);
      expect(plan.steps.length).toBeGreaterThan(3);
    });

    it("decomposes 'feature' keywords into implementation workflow", () => {
      const plan = planner.createPlan({
        id: "g-4",
        description: "Add dark mode feature",
        timestamp: Date.now(),
      });

      expect(plan.steps.some((s) => s.type === "checkpoint")).toBe(true);
      expect(plan.steps.some((s) => s.type === "task")).toBe(true);
    });

    it("handles unknown descriptions with default workflow", () => {
      const plan = planner.createPlan({
        id: "g-5",
        description: "zztop nonexistent pattern",
        timestamp: Date.now(),
      });

      expect(plan.steps.length).toBeGreaterThan(0);
      // Default steps have task/diff/review/approval
      const types = plan.steps.map((s) => s.type);
      expect(types).toContain("task");
      expect(types).toContain("approval");
    });

    it("assigns correct dependency ordering (sequential)", () => {
      const plan = planner.createPlan({
        id: "g-6",
        description: "Add new endpoint",
        timestamp: Date.now(),
      });

      for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i];
        if (i === 0) {
          expect(step.dependencies).toHaveLength(0);
        } else {
          expect(step.dependencies.length).toBeGreaterThan(0);
          // Each step depends on the previous one
          expect(step.dependencies).toContain(plan.steps[i - 1].id);
        }
      }
    });

    it("estimates complexity correctly", () => {
      const complex = planner.createPlan({
        id: "g-c", description: "refactor legacy codebase", timestamp: 0,
      });
      const simple = planner.createPlan({
        id: "g-s", description: "check test coverage", timestamp: 0,
      });

      const avgComplex = complex.steps.reduce((s, st) => s + (st.estimatedComplexity ?? 0), 0) / complex.steps.length;
      const avgSimple = simple.steps.reduce((s, st) => s + (st.estimatedComplexity ?? 0), 0) / simple.steps.length;

      expect(avgComplex).toBeGreaterThanOrEqual(avgSimple);
    });
  });

  describe("decompose", () => {
    it("returns subgoals and leaf tasks", () => {
      const result = planner.decompose({
        id: "g-7",
        description: "Build a login page",
        timestamp: Date.now(),
      });

      expect(result.subgoals.length).toBe(result.leafTasks.length);
      expect(result.leafTasks.length).toBeGreaterThan(0);
    });
  });
});
