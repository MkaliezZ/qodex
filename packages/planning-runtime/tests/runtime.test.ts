import { describe, it, expect, beforeEach } from "vitest";
import { PlanningRuntime } from "../src/runtime/runtime.js";

describe("PlanningRuntime", () => {
  let runtime: PlanningRuntime;

  beforeEach(() => {
    runtime = new PlanningRuntime();
  });

  describe("createPlan", () => {
    it("creates a plan from a goal", async () => {
      const plan = await runtime.createPlan({
        id: "g1",
        description: "Fix a bug",
        timestamp: Date.now(),
      });

      expect(plan.id).toMatch(/^plan-/);
      expect(plan.steps.length).toBeGreaterThan(0);
    });

    it("emits plan.created event", async () => {
      const events: string[] = [];
      runtime.subscribe((e) => events.push(e.type));

      await runtime.createPlan({
        id: "g2",
        description: "Add feature",
        timestamp: Date.now(),
      });

      expect(events).toContain("plan.created");
    });
  });

  describe("startExecution", () => {
    it("executes a plan and returns completed graph", async () => {
      const plan = await runtime.createPlan({
        id: "g3",
        description: "Review this",
        timestamp: Date.now(),
      });

      const graph = await runtime.startExecution(plan);

      expect(graph.status).toBe("completed");
      for (const node of graph.getAllNodes()) {
        expect(node.status).toBe("completed");
      }
    });

    it("emits graph.created and report.generated events", async () => {
      const events: string[] = [];
      runtime.subscribe((e) => events.push(e.type));

      const plan = await runtime.createPlan({
        id: "g4",
        description: "Add test",
        timestamp: Date.now(),
      });

      await runtime.startExecution(plan);

      expect(events).toContain("graph.created");
      expect(events).toContain("report.generated");
    });

    it("handles empty steps gracefully", async () => {
      const plan = {
        id: "p-empty",
        goalId: "g-empty",
        steps: [],
        createdAt: Date.now(),
      };

      await expect(runtime.startExecution(plan)).rejects.toThrow();
    });
  });

  describe("getGraph / getNodeStatus / getGraphStatus", () => {
    it("returns null for unknown graph", () => {
      expect(runtime.getGraph("nonexistent")).toBeNull();
      expect(runtime.getNodeStatus("nonexistent", "n1")).toBeNull();
      expect(runtime.getGraphStatus("nonexistent")).toBeNull();
    });

    it("returns correct statuses after execution", async () => {
      const plan = await runtime.createPlan({
        id: "g5",
        description: "Fix bug",
        timestamp: Date.now(),
      });
      const graph = await runtime.startExecution(plan);

      const retrieved = runtime.getGraph(graph.id)!;
      expect(retrieved.status).toBe("completed");

      const nodeStatus = runtime.getNodeStatus(graph.id, graph.getAllNodes()[0].id);
      expect(nodeStatus).toBe("completed");
    });
  });

  describe("cancelExecution", () => {
    it("throws for unknown graph", async () => {
      await expect(runtime.cancelExecution("nonexistent")).rejects.toThrow();
    });
  });

  describe("serialization", () => {
    it("exportGraph returns valid serialized data", async () => {
      const plan = await runtime.createPlan({
        id: "g6",
        description: "Fix bug",
        timestamp: Date.now(),
      });
      const graph = await runtime.startExecution(plan);

      const serialized = runtime.exportGraph(graph.id);
      expect(serialized.id).toBe(graph.id);
      expect(serialized.nodes).toHaveLength(graph.getAllNodes().length);
    });

    it("importGraph restores a graph", async () => {
      const plan = await runtime.createPlan({
        id: "g7",
        description: "Add feature",
        timestamp: Date.now(),
      });
      const graph = await runtime.startExecution(plan);
      const serialized = runtime.exportGraph(graph.id);

      // Change ID for import
      serialized.id = "imported-graph";
      const restored = runtime.importGraph(serialized);

      expect(restored.id).toBe("imported-graph");
      expect(runtime.getGraph("imported-graph")).not.toBeNull();
    });

    it("throws on export of unknown graph", () => {
      expect(() => runtime.exportGraph("unknown")).toThrow();
    });
  });

  describe("requestReplan", () => {
    it("returns null when graph not found", async () => {
      await expect(
        runtime.requestReplan({
          graphId: "nonexistent",
          reason: "failure",
          timestamp: Date.now(),
        }),
      ).rejects.toThrow();
    });

    it("returns replan result for existing graph", async () => {
      const plan = await runtime.createPlan({
        id: "g8",
        description: "Fix bug",
        timestamp: Date.now(),
      });
      const graph = await runtime.startExecution(plan);

      const result = await runtime.requestReplan({
        graphId: graph.id,
        reason: "user_request",
        timestamp: Date.now(),
      });

      expect(result).not.toBeNull();
      expect(result!.reason).toBe("user_request");
    });
  });

  describe("subscribe", () => {
    it("returns unsubscribe function", () => {
      const unsub = runtime.subscribe(() => {});
      expect(typeof unsub).toBe("function");
      unsub();
    });
  });

  describe("custom node executor", () => {
    it("uses custom executor when provided", async () => {
      const customRuntime = new PlanningRuntime({
        nodeExecutor: async (nodeId) => ({ custom: true, nodeId }),
      });

      const plan = await customRuntime.createPlan({
        id: "g9",
        description: "Review",
        timestamp: Date.now(),
      });

      const graph = await customRuntime.startExecution(plan);

      for (const node of graph.getAllNodes()) {
        expect(node.result).toEqual({ custom: true, nodeId: node.id });
      }
    });
  });
});
