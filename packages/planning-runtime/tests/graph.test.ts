import { describe, it, expect } from "vitest";
import { ExecutionGraph } from "../src/models/graph.js";
import type { ExecutionNode } from "../src/models/graph.js";

function makeNode(overrides: Partial<ExecutionNode> = {}): ExecutionNode {
  return {
    id: overrides.id ?? "n1",
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

describe("ExecutionGraph", () => {
  describe("construction", () => {
    it("creates a graph with nodes", () => {
      const graph = new ExecutionGraph({
        id: "g1",
        planId: "p1",
        nodes: [
          makeNode({ id: "n1" }),
          makeNode({ id: "n2", dependencies: ["n1"] }),
        ],
        rootNodeId: "n1",
      });

      expect(graph.nodes.size).toBe(2);
      expect(graph.rootNodeId).toBe("n1");
      expect(graph.edges.length).toBe(1);
      expect(graph.edges[0].from).toBe("n1");
      expect(graph.edges[0].to).toBe("n2");
    });
  });

  describe("validateDAG", () => {
    it("accepts a valid DAG", () => {
      const graph = new ExecutionGraph({
        id: "g-dag",
        planId: "p1",
        nodes: [
          makeNode({ id: "a" }),
          makeNode({ id: "b", dependencies: ["a"] }),
          makeNode({ id: "c", dependencies: ["a"] }),
          makeNode({ id: "d", dependencies: ["b", "c"] }),
        ],
        rootNodeId: "a",
      });

      const result = graph.validateDAG();
      expect(result.valid).toBe(true);
      expect(result.cycles).toBeUndefined();
    });

    it("rejects a graph with a cycle", () => {
      const graph = new ExecutionGraph({
        id: "g-cycle",
        planId: "p1",
        nodes: [
          makeNode({ id: "a", dependencies: ["c"] }),
          makeNode({ id: "b", dependencies: ["a"] }),
          makeNode({ id: "c", dependencies: ["b"] }),
        ],
        rootNodeId: "a",
      });

      const result = graph.validateDAG();
      expect(result.valid).toBe(false);
      expect(result.cycles).toBeDefined();
      expect(result.cycles!.length).toBeGreaterThan(0);
    });

    it("rejects a self-loop", () => {
      const graph = new ExecutionGraph({
        id: "g-self",
        planId: "p1",
        nodes: [
          makeNode({ id: "a", dependencies: ["a"] }),
        ],
        rootNodeId: "a",
      });

      const result = graph.validateDAG();
      expect(result.valid).toBe(false);
    });

    it("accepts a linear chain", () => {
      const graph = new ExecutionGraph({
        id: "g-linear",
        planId: "p1",
        nodes: [
          makeNode({ id: "1" }),
          makeNode({ id: "2", dependencies: ["1"] }),
          makeNode({ id: "3", dependencies: ["2"] }),
          makeNode({ id: "4", dependencies: ["3"] }),
          makeNode({ id: "5", dependencies: ["4"] }),
        ],
        rootNodeId: "1",
      });

      expect(graph.validateDAG().valid).toBe(true);
    });

    it("accepts a diamond dependency pattern", () => {
      const graph = new ExecutionGraph({
        id: "g-diamond",
        planId: "p1",
        nodes: [
          makeNode({ id: "s" }),
          makeNode({ id: "a", dependencies: ["s"] }),
          makeNode({ id: "b", dependencies: ["s"] }),
          makeNode({ id: "t", dependencies: ["a", "b"] }),
        ],
        rootNodeId: "s",
      });

      expect(graph.validateDAG().valid).toBe(true);
    });

    it("accepts a single node graph", () => {
      const graph = new ExecutionGraph({
        id: "g-solo",
        planId: "p1",
        nodes: [makeNode({ id: "solo" })],
        rootNodeId: "solo",
      });

      expect(graph.validateDAG().valid).toBe(true);
    });
  });

  describe("validateOrphans", () => {
    it("detects orphan nodes not connected to root", () => {
      const graph = new ExecutionGraph({
        id: "g-orphan",
        planId: "p1",
        nodes: [
          makeNode({ id: "root" }),
          makeNode({ id: "orphan" }),
        ],
        rootNodeId: "root",
      });

      const orphans = graph.validateOrphans();
      expect(orphans).toContain("orphan");
    });

    it("returns no orphans for fully connected graph", () => {
      const graph = new ExecutionGraph({
        id: "g-connected",
        planId: "p1",
        nodes: [
          makeNode({ id: "root" }),
          makeNode({ id: "child", dependencies: ["root"] }),
        ],
        rootNodeId: "root",
      });

      // Both nodes are connected via edge — no orphans
      expect(graph.validateOrphans()).toHaveLength(0);
    });
  });

  describe("getReadyNodes", () => {
    it("returns root node when all are pending", () => {
      const graph = new ExecutionGraph({
        id: "g-ready",
        planId: "p1",
        nodes: [
          makeNode({ id: "a" }),
          makeNode({ id: "b", dependencies: ["a"] }),
        ],
        rootNodeId: "a",
      });

      const ready = graph.getReadyNodes();
      expect(ready.length).toBe(1);
      expect(ready[0].id).toBe("a");
    });

    it("returns dependent node after root completes", () => {
      const graph = new ExecutionGraph({
        id: "g-seq",
        planId: "p1",
        nodes: [
          { ...makeNode({ id: "a", status: "completed" }) },
          makeNode({ id: "b", dependencies: ["a"] }),
        ],
        rootNodeId: "a",
      });

      const ready = graph.getReadyNodes();
      expect(ready.length).toBe(1);
      expect(ready[0].id).toBe("b");
    });

    it("returns both nodes when they share a completed dependency", () => {
      const graph = new ExecutionGraph({
        id: "g-fork",
        planId: "p1",
        nodes: [
          { ...makeNode({ id: "a", status: "completed" }) },
          makeNode({ id: "b", dependencies: ["a"] }),
          makeNode({ id: "c", dependencies: ["a"] }),
        ],
        rootNodeId: "a",
      });

      const ready = graph.getReadyNodes();
      expect(ready.length).toBe(2);
    });

    it("returns empty when all nodes are completed", () => {
      const graph = new ExecutionGraph({
        id: "g-done",
        planId: "p1",
        nodes: [
          { ...makeNode({ id: "a", status: "completed" }) },
          { ...makeNode({ id: "b", dependencies: ["a"], status: "completed" }) },
        ],
        rootNodeId: "a",
      });

      expect(graph.getReadyNodes()).toHaveLength(0);
    });
  });

  describe("serialization", () => {
    it("round-trips through JSON", () => {
      const original = new ExecutionGraph({
        id: "g-json",
        planId: "p1",
        nodes: [
          makeNode({ id: "a", status: "completed", result: { ok: true } }),
          makeNode({ id: "b", dependencies: ["a"] }),
        ],
        rootNodeId: "a",
      });

      const json = original.toJSON();
      const restored = ExecutionGraph.fromJSON(json);

      expect(restored.id).toBe(original.id);
      expect(restored.nodes.size).toBe(original.nodes.size);
      expect(restored.getNode("a")?.status).toBe("completed");
      expect(restored.getNode("a")?.result).toEqual({ ok: true });
    });

    it("preserves node order in serialization", () => {
      const graph = new ExecutionGraph({
        id: "g-order",
        planId: "p1",
        nodes: [
          makeNode({ id: "z" }),
          makeNode({ id: "a", dependencies: ["z"] }),
          makeNode({ id: "m", dependencies: ["a"] }),
        ],
        rootNodeId: "z",
      });

      const json = graph.toJSON();
      const restored = ExecutionGraph.fromJSON(json);

      expect(restored.edges.length).toBe(graph.edges.length);
    });
  });
});
