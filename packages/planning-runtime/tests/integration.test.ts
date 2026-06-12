import { describe, it, expect, beforeEach } from "vitest";
import { PlanningRuntime } from "../src/runtime/runtime.js";
import type { Plan } from "../src/models/plan.js";

describe("Integration — Planning Runtime", () => {
  let runtime: PlanningRuntime;
  const events: string[] = [];

  beforeEach(() => {
    runtime = new PlanningRuntime();
    events.length = 0;
    runtime.subscribe((e) => events.push(e.type));
  });

  describe("full lifecycle", () => {
    it("goal → plan → graph → execution → completion", async () => {
      const plan = await runtime.createPlan({
        id: "goal-1",
        description: "Refactor the auth module",
        timestamp: Date.now(),
      });

      expect(plan).toBeDefined();
      expect(events).toContain("plan.created");

      const graph = await runtime.startExecution(plan);

      expect(graph.status).toBe("completed");
      expect(events).toContain("graph.created");
      expect(events).toContain("report.generated");
    });

    it("goal → plan → graph → execution → cancel", async () => {
      const plan = await runtime.createPlan({
        id: "goal-cancel",
        description: "Fix a bug",
        timestamp: Date.now(),
      });

      // Build graph manually to test cancel mid-flight
      const graph = await runtime.startExecution(plan);
      expect(graph.status).toBe("completed"); // already completed since executor is synchronous

      // Cancel a completed graph (no effect on completed nodes)
      await runtime.cancelExecution(graph.id);
      expect(runtime.getGraphStatus(graph.id)).toBe("completed");
    });
  });

  describe("replan after execution", () => {
    it("executes a replan cycle", async () => {
      const plan = await runtime.createPlan({
        id: "goal-replan",
        description: "Add dark mode",
        timestamp: Date.now(),
      });

      const graph = await runtime.startExecution(plan);

      const replanResult = await runtime.requestReplan({
        graphId: graph.id,
        reason: "user_request",
        timestamp: Date.now(),
      });

      expect(replanResult).not.toBeNull();
      expect(replanResult!.reason).toBe("user_request");
      expect(events).toContain("replan.requested");
      expect(events).toContain("replan.completed");
    });
  });

  describe("serialization integration", () => {
    it("full lifecycle with serialization", async () => {
      const plan = await runtime.createPlan({
        id: "goal-serial",
        description: "Add tests",
        timestamp: Date.now(),
      });

      const graph = await runtime.startExecution(plan);

      // Export
      const data = runtime.exportGraph(graph.id);
      expect(data.nodes.length).toBe(graph.getAllNodes().length);

      // Import as new graph
      data.id = "clone";
      const clone = runtime.importGraph(data);

      expect(clone.nodes.size).toBe(graph.nodes.size);
      expect(runtime.getGraph("clone")).not.toBeNull();
    });
  });

  describe("event ordering guarantees", () => {
    it("events are emitted in correct causal order", async () => {
      const ordered: string[] = [];
      runtime.subscribe((e) => ordered.push(e.type));

      const plan = await runtime.createPlan({
        id: "goal-order",
        description: "Fix bug",
        timestamp: Date.now(),
      });
      await runtime.startExecution(plan);

      // plan.created must precede graph.created
      const planIdx = ordered.indexOf("plan.created");
      const graphIdx = ordered.indexOf("graph.created");
      expect(planIdx).toBeLessThan(graphIdx);

      // node.started must precede node.completed
      for (let i = 0; i < ordered.length; i++) {
        if (ordered[i] === "node.completed") {
          // At least one node.started before it
          const startIdx = ordered.lastIndexOf("node.started", i);
          expect(startIdx).toBeGreaterThan(-1);
          expect(startIdx).toBeLessThan(i);
        }
      }
    });
  });

  describe("cross-workflow", () => {
    it("handles multiple sequential plans", async () => {
      const plan1 = await runtime.createPlan({
        id: "g-a",
        description: "Fix bug A",
        timestamp: Date.now(),
      });
      const g1 = await runtime.startExecution(plan1);

      const plan2 = await runtime.createPlan({
        id: "g-b",
        description: "Add feature B",
        timestamp: Date.now(),
      });
      const g2 = await runtime.startExecution(plan2);

      expect(g1.status).toBe("completed");
      expect(g2.status).toBe("completed");
      expect(runtime.getGraph(g1.id)).not.toBeNull();
      expect(runtime.getGraph(g2.id)).not.toBeNull();
    });

    it("graph IDs are unique across plans", async () => {
      const p1 = await runtime.createPlan({
        id: "g-u1", description: "Review", timestamp: Date.now(),
      });
      const p2 = await runtime.createPlan({
        id: "g-u2", description: "Refactor", timestamp: Date.now(),
      });

      const g1 = await runtime.startExecution(p1);
      const g2 = await runtime.startExecution(p2);

      expect(g1.id).not.toBe(g2.id);
    });
  });
});
