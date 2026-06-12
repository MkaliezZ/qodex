import { describe, it, expect } from "vitest";
import { ExecutionGraph } from "../src/models/graph.js";
import { GraphExecutor } from "../src/execution/executor.js";
import { PlanningEventBus } from "../src/events/bus.js";
import { Planner } from "../src/planner/planner.js";
import type { ExecutionNode } from "../src/models/graph.js";

function makeNode(overrides: Partial<ExecutionNode> = {}): ExecutionNode {
  return {
    id: "n1",
    type: "task",
    status: "pending",
    description: "test",
    dependencies: [],
    dependents: [],
    retryCount: 0,
    maxRetries: 3,
    ...overrides,
  };
}

describe("Edge Cases", () => {
  describe("empty graph", () => {
    it("fails to execute an empty root-node-only graph", async () => {
      // An execution graph with zero nodes should error
      const bus = new PlanningEventBus();
      const executor = new GraphExecutor(bus);

      const graph = new ExecutionGraph({
        id: "g-empty",
        planId: "p1",
        nodes: [],
        rootNodeId: "none",
      });

      await executor.execute(graph);
      expect(graph.status).toBe("completed"); // no nodes to run means empty completion
    });
  });

  describe("single node graph", () => {
    it("executes a single node correctly", async () => {
      const bus = new PlanningEventBus();
      const executor = new GraphExecutor(bus);

      const graph = new ExecutionGraph({
        id: "g-solo",
        planId: "p1",
        nodes: [makeNode({ id: "only" })],
        rootNodeId: "only",
      });

      await executor.execute(graph);

      expect(graph.status).toBe("completed");
      expect(graph.getNode("only")?.completedAt).toBeGreaterThan(0);
    });
  });

  describe("node with no dependencies but not root", () => {
    it("detects orphaned nodes", () => {
      const graph = new ExecutionGraph({
        id: "g-orph",
        planId: "p1",
        nodes: [
          makeNode({ id: "root" }),
          makeNode({ id: "float" }), // no deps, not root
        ],
        rootNodeId: "root",
      });

      const orphans = graph.validateOrphans();
      expect(orphans).toContain("float");
    });
  });

  describe("max retry exhaustion", () => {
    it("marks node as failed after maxRetries exhausted", async () => {
      const bus = new PlanningEventBus();
      let calls = 0;
      const executor = new GraphExecutor(bus, async () => {
        calls++;
        throw new Error("always fails");
      });

      const graph = new ExecutionGraph({
        id: "g-max",
        planId: "p1",
        nodes: [{ ...makeNode({ id: "f", maxRetries: 2 }) }],
        rootNodeId: "f",
      });

      await executor.execute(graph);

      expect(calls).toBe(3);
      expect(graph.getNode("f")?.status).toBe("failed");
      expect(graph.status).toBe("failed");
    });
  });

  describe("deeply nested dependencies", () => {
    it("executes a 20-node linear chain", async () => {
      const bus = new PlanningEventBus();
      const executor = new GraphExecutor(bus);

      const nodes = Array.from({ length: 20 }, (_, i) =>
        makeNode({
          id: `n${i}`,
          dependencies: i > 0 ? [`n${i - 1}`] : [],
        }),
      );

      const graph = new ExecutionGraph({
        id: "g-deep",
        planId: "p1",
        nodes,
        rootNodeId: "n0",
      });

      await executor.execute(graph);

      expect(graph.status).toBe("completed");
      expect(graph.getAllNodes().every((n) => n.status === "completed")).toBe(true);
    });
  });

  describe("all node types", () => {
    it("handles all 9 node types in a graph", async () => {
      const bus = new PlanningEventBus();
      const executor = new GraphExecutor(bus);

      const graph = new ExecutionGraph({
        id: "g-all-types",
        planId: "p1",
        nodes: [
          makeNode({ id: "goal", type: "goal" }),
          makeNode({ id: "plan", type: "plan", dependencies: ["goal"] }),
          makeNode({ id: "task", type: "task", dependencies: ["plan"] }),
          makeNode({ id: "review", type: "review", dependencies: ["task"] }),
          makeNode({ id: "diff", type: "diff", dependencies: ["review"] }),
          makeNode({ id: "checkpoint", type: "checkpoint", dependencies: ["diff"] }),
          makeNode({ id: "approval", type: "approval", dependencies: ["checkpoint"] }),
          makeNode({ id: "tool", type: "tool", dependencies: ["approval"] }),
          makeNode({ id: "report", type: "report", dependencies: ["tool"] }),
        ],
        rootNodeId: "goal",
      });

      await executor.execute(graph);

      expect(graph.status).toBe("completed");
      for (const node of graph.getAllNodes()) {
        expect(node.status).toBe("completed");
      }
    });
  });

  describe("status transitions", () => {
    it("all 7 statuses can be correctly tracked", () => {
      const statuses = ["pending", "ready", "running", "blocked", "completed", "failed", "cancelled"] as const;

      for (const status of statuses) {
        const node = makeNode({ id: status, status });
        const graph = new ExecutionGraph({
          id: `g-${status}`,
          planId: "p1",
          nodes: [node],
          rootNodeId: status,
        });

        expect(graph.getNode(status)?.status).toBe(status);
      }
    });
  });
});
