import { describe, it, expect } from "vitest";
import { ExecutionGraph } from "../src/models/graph.js";
import type { ExecutionNode, ExecutionGraphSerialized } from "../src/models/graph.js";

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

describe("Serialization", () => {
  describe("toJSON", () => {
    it("produces valid JSON", () => {
      const graph = new ExecutionGraph({
        id: "g1", planId: "p1",
        nodes: [makeNode({ id: "a" }), makeNode({ id: "b", dependencies: ["a"] })],
        rootNodeId: "a",
      });
      const json = graph.toJSON();
      expect(() => JSON.parse(JSON.stringify(json))).not.toThrow();
    });

    it("includes all required fields", () => {
      const graph = new ExecutionGraph({
        id: "g1", planId: "p1",
        nodes: [makeNode({ id: "a" })],
        rootNodeId: "a",
      });
      const json = graph.toJSON();

      expect(json.id).toBe("g1");
      expect(json.planId).toBe("p1");
      expect(json.nodes).toHaveLength(1);
      expect(json.edges).toHaveLength(0);
      expect(json.rootNodeId).toBe("a");
      expect(json.status).toBeDefined();
      expect(json.createdAt).toBeGreaterThan(0);
      expect(json.updatedAt).toBeGreaterThan(0);
    });
  });

  describe("fromJSON", () => {
    it("restores a graph from JSON", () => {
      const original = new ExecutionGraph({
        id: "g1", planId: "p1",
        nodes: [makeNode({ id: "a" }), makeNode({ id: "b", dependencies: ["a"] })],
        rootNodeId: "a",
      });
      const json = original.toJSON();
      const restored = ExecutionGraph.fromJSON(json);

      expect(restored.id).toBe(original.id);
      expect(restored.nodes.size).toBe(original.nodes.size);
      expect(restored.rootNodeId).toBe(original.rootNodeId);
    });
  });

  describe("round-trip", () => {
    it("preserves all node fields", () => {
      const node: ExecutionNode = {
        id: "n-custom",
        type: "approval",
        status: "completed",
        description: "custom node",
        dependencies: ["dep1", "dep2"],
        dependents: ["child1"],
        result: { approved: true, by: "user" },
        startedAt: 1000,
        completedAt: 2000,
        retryCount: 1,
        maxRetries: 5,
      };

      const original = new ExecutionGraph({
        id: "g-round", planId: "p1",
        nodes: [node],
        rootNodeId: "n-custom",
      });
      original.status = "completed";

      const json = original.toJSON();
      const restored = ExecutionGraph.fromJSON(json);
      const restoredNode = restored.getNode("n-custom")!;

      expect(restoredNode.id).toBe(node.id);
      expect(restoredNode.type).toBe(node.type);
      expect(restoredNode.status).toBe(node.status);
      expect(restoredNode.description).toBe(node.description);
      expect(restoredNode.dependencies).toEqual(node.dependencies);
      expect(restoredNode.result).toEqual(node.result);
      expect(restoredNode.retryCount).toBe(node.retryCount);
      expect(restoredNode.maxRetries).toBe(node.maxRetries);
      expect(restored.status).toBe("completed");
    });

    it("round-trips a complex graph with no information loss", () => {
      const original = new ExecutionGraph({
        id: "g-complex", planId: "p-complex",
        nodes: [
          { ...makeNode({ id: "a", status: "completed", result: { step: 1 }, startedAt: 100, completedAt: 200 }) },
          { ...makeNode({ id: "b", dependencies: ["a"], status: "completed", result: { step: 2 } }) },
          { ...makeNode({ id: "c", dependencies: ["a"], status: "failed", retryCount: 3 }) },
          { ...makeNode({ id: "d", dependencies: ["b", "c"], status: "blocked" }) },
        ],
        rootNodeId: "a",
      });

      const json = original.toJSON();
      const restored = ExecutionGraph.fromJSON(json);

      expect(restored.nodes.size).toBe(4);
      expect(restored.getNode("a")?.status).toBe("completed");
      expect(restored.getNode("c")?.status).toBe("failed");
      expect(restored.getNode("d")?.status).toBe("blocked");

      // Edges should match (3 dependency edges)
      expect(restored.edges.length).toBe(original.edges.length);
    });

    it("produces identical JSON from toJSON→fromJSON→toJSON", () => {
      const original = new ExecutionGraph({
        id: "g-idem", planId: "p1",
        nodes: [makeNode({ id: "a" })],
        rootNodeId: "a",
      });

      const json1 = JSON.stringify(original.toJSON());
      const restored = ExecutionGraph.fromJSON(original.toJSON());
      const json2 = JSON.stringify(restored.toJSON());

      expect(json1).toBe(json2);
    });
  });
});
