import { describe, it, expect, beforeEach } from "vitest";
import { ExecutionGraph } from "../src/models/graph.js";
import { GraphExecutor } from "../src/execution/executor.js";
import { PlanningEventBus } from "../src/events/bus.js";
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

describe("GraphExecutor", () => {
  let bus: PlanningEventBus;
  let executor: GraphExecutor;

  beforeEach(() => {
    bus = new PlanningEventBus();
    executor = new GraphExecutor(bus);
  });

  describe("execute — sequential deterministic", () => {
    it("executes all nodes in a linear graph", async () => {
      const graph = new ExecutionGraph({
        id: "g-seq",
        planId: "p1",
        nodes: [
          makeNode({ id: "a" }),
          makeNode({ id: "b", dependencies: ["a"] }),
          makeNode({ id: "c", dependencies: ["b"] }),
        ],
        rootNodeId: "a",
      });

      await executor.execute(graph);

      expect(graph.status).toBe("completed");
      expect(graph.getNode("a")?.status).toBe("completed");
      expect(graph.getNode("b")?.status).toBe("completed");
      expect(graph.getNode("c")?.status).toBe("completed");
    });

    it("executes diamond-pattern graph correctly", async () => {
      const graph = new ExecutionGraph({
        id: "g-dia",
        planId: "p1",
        nodes: [
          makeNode({ id: "s" }),
          makeNode({ id: "a", dependencies: ["s"] }),
          makeNode({ id: "b", dependencies: ["s"] }),
          makeNode({ id: "t", dependencies: ["a", "b"] }),
        ],
        rootNodeId: "s",
      });

      await executor.execute(graph);

      expect(graph.status).toBe("completed");
      expect(graph.getNode("t")?.status).toBe("completed");
    });

    it("sets result on all completed nodes", async () => {
      const graph = new ExecutionGraph({
        id: "g-result",
        planId: "p1",
        nodes: [
          makeNode({ id: "a" }),
          makeNode({ id: "b", dependencies: ["a"] }),
        ],
        rootNodeId: "a",
      });

      await executor.execute(graph);

      for (const node of graph.getAllNodes()) {
        expect(node.result).toBeDefined();
        expect(node.result).toEqual({ mock: true, nodeId: node.id });
      }
    });

    it("marks a failed node as failed after max retries", async () => {
      const failingExecutor = new GraphExecutor(bus, async (nodeId) => {
        if (nodeId === "bad") throw new Error("boom");
        return { ok: true };
      });

      const graph = new ExecutionGraph({
        id: "g-fail",
        planId: "p1",
        nodes: [
          { ...makeNode({ id: "bad", maxRetries: 1 }) },
          makeNode({ id: "after", dependencies: ["bad"] }),
        ],
        rootNodeId: "bad",
      });

      await failingExecutor.execute(graph);

      expect(graph.status).toBe("failed");
      expect(graph.getNode("bad")?.status).toBe("failed");
      expect(graph.getNode("after")?.status).toBe("blocked");
    });

    it("blocks dependents when upstream fails", async () => {
      const failingExecutor = new GraphExecutor(bus, async (nodeId) => {
        if (nodeId === "f") throw new Error("fail");
        return { ok: true };
      });

      const graph = new ExecutionGraph({
        id: "g-block",
        planId: "p1",
        nodes: [
          { ...makeNode({ id: "f", maxRetries: 1 }) },
          makeNode({ id: "child", dependencies: ["f"], dependents: [] }),
        ],
        rootNodeId: "f",
      });

      // need to build dependents
      const child = graph.getNode("child")!;
      child.dependents = [];

      await failingExecutor.execute(graph);

      expect(graph.getNode("child")?.status).toBe("blocked");
    });

    it("retries on failure up to maxRetries", async () => {
      let calls = 0;
      const retryExecutor = new GraphExecutor(bus, async () => {
        calls++;
        if (calls < 3) throw new Error("retry");
        return { ok: true };
      });

      const graph = new ExecutionGraph({
        id: "g-retry",
        planId: "p1",
        nodes: [
          { ...makeNode({ id: "r", maxRetries: 5 }) },
        ],
        rootNodeId: "r",
      });

      await retryExecutor.execute(graph);

      expect(calls).toBe(3);
      expect(graph.getNode("r")?.status).toBe("completed");
    });

    it("emits correct event sequence", async () => {
      const events: string[] = [];
      bus.subscribe((e) => events.push(e.type));

      const graph = new ExecutionGraph({
        id: "g-events",
        planId: "p1",
        nodes: [
          makeNode({ id: "a" }),
          makeNode({ id: "b", dependencies: ["a"] }),
        ],
        rootNodeId: "a",
      });

      await executor.execute(graph);

      expect(events).toContain("node.ready");
      expect(events).toContain("node.started");
      expect(events).toContain("node.completed");
      expect(events).toContain("report.generated");
    });
  });

  describe("cancel", () => {
    it("cancels pending and ready nodes", async () => {
      const graph = new ExecutionGraph({
        id: "g-cancel",
        planId: "p1",
        nodes: [
          { ...makeNode({ id: "a", status: "completed" }) },
          makeNode({ id: "b", dependencies: ["a"] }),
          makeNode({ id: "c", dependencies: ["b"] }),
        ],
        rootNodeId: "a",
      });

      await executor.cancel(graph);

      expect(graph.status).toBe("cancelled");
      expect(graph.getNode("b")?.status).toBe("cancelled");
      expect(graph.getNode("c")?.status).toBe("cancelled");
    });

    it("does not change completed nodes during cancel", async () => {
      const graph = new ExecutionGraph({
        id: "g-cancel2",
        planId: "p1",
        nodes: [
          { ...makeNode({ id: "a", status: "completed" }) },
          makeNode({ id: "b", dependencies: ["a"] }),
        ],
        rootNodeId: "a",
      });

      await executor.cancel(graph);

      expect(graph.getNode("a")?.status).toBe("completed");
    });
  });

  describe("node execution with custom executor", () => {
    it("uses custom node executor when provided", async () => {
      const custom = new GraphExecutor(bus, async (nodeId) => {
        return { custom: true, nodeId };
      });

      const graph = new ExecutionGraph({
        id: "g-custom",
        planId: "p1",
        nodes: [makeNode({ id: "x" })],
        rootNodeId: "x",
      });

      await custom.execute(graph);

      expect(graph.getNode("x")?.result).toEqual({ custom: true, nodeId: "x" });
    });
  });
});
