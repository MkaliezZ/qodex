import { describe, it, expect } from "vitest";
import { ExecutionGraph } from "../src/models/graph.js";
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

describe("DAG Validation", () => {
  describe("cycle detection", () => {
    it("detects direct cycle A→B→A", () => {
      const graph = new ExecutionGraph({
        id: "g", planId: "p",
        nodes: [
          makeNode({ id: "a", dependencies: ["b"] }),
          makeNode({ id: "b", dependencies: ["a"] }),
        ],
        rootNodeId: "a",
      });
      expect(graph.validateDAG().valid).toBe(false);
    });

    it("detects indirect cycle A→B→C→A", () => {
      const graph = new ExecutionGraph({
        id: "g", planId: "p",
        nodes: [
          makeNode({ id: "a", dependencies: ["c"] }),
          makeNode({ id: "b", dependencies: ["a"] }),
          makeNode({ id: "c", dependencies: ["b"] }),
        ],
        rootNodeId: "a",
      });
      expect(graph.validateDAG().valid).toBe(false);
    });

    it("detects self-referencing cycle", () => {
      const graph = new ExecutionGraph({
        id: "g", planId: "p",
        nodes: [makeNode({ id: "a", dependencies: ["a"] })],
        rootNodeId: "a",
      });
      expect(graph.validateDAG().valid).toBe(false);
    });

    it("accepts long linear chain (50 nodes)", () => {
      const nodes = Array.from({ length: 50 }, (_, i) =>
        makeNode({
          id: `n${i}`,
          dependencies: i > 0 ? [`n${i - 1}`] : [],
        }),
      );
      const graph = new ExecutionGraph({ id: "g", planId: "p", nodes, rootNodeId: "n0" });
      expect(graph.validateDAG().valid).toBe(true);
    });
  });

  describe("complex DAG patterns", () => {
    it("accepts tree structure", () => {
      const graph = new ExecutionGraph({
        id: "g", planId: "p",
        nodes: [
          makeNode({ id: "root" }),
          makeNode({ id: "l1", dependencies: ["root"] }),
          makeNode({ id: "r1", dependencies: ["root"] }),
          makeNode({ id: "l2", dependencies: ["l1"] }),
          makeNode({ id: "r2", dependencies: ["r1"] }),
        ],
        rootNodeId: "root",
      });
      expect(graph.validateDAG().valid).toBe(true);
    });

    it("accepts multi-level diamond", () => {
      const graph = new ExecutionGraph({
        id: "g", planId: "p",
        nodes: [
          makeNode({ id: "a" }),
          makeNode({ id: "b", dependencies: ["a"] }),
          makeNode({ id: "c", dependencies: ["a"] }),
          makeNode({ id: "d", dependencies: ["b", "c"] }),
          makeNode({ id: "e", dependencies: ["d"] }),
          makeNode({ id: "f", dependencies: ["d"] }),
          makeNode({ id: "g", dependencies: ["e", "f"] }),
        ],
        rootNodeId: "a",
      });
      expect(graph.validateDAG().valid).toBe(true);
    });

    it("rejects diamond with back-edge creating a cycle", () => {
      const graph = new ExecutionGraph({
        id: "g", planId: "p",
        nodes: [
          makeNode({ id: "a" }),
          makeNode({ id: "b", dependencies: ["a"] }),
          makeNode({ id: "c", dependencies: ["a", "d"] }), // this creates cycle: a→b→d→c→...(back to b via cycles)
          makeNode({ id: "d", dependencies: ["b", "c"] }),
        ],
        rootNodeId: "a",
      });
      const result = graph.validateDAG();
      expect(result.valid).toBe(false);
    });
  });
});
