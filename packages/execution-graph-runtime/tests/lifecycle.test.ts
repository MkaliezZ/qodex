import { describe, it, expect } from "vitest";
import { GraphLifecycle } from "../src/lifecycle/lifecycle.js";
import type { ExecutionNode } from "../src/models/graph.js";

function n(overrides: Partial<ExecutionNode> = {}): ExecutionNode {
  return { id: "n", type: "task", status: "pending", description: "", dependencies: [], dependents: [], retryCount: 0, maxRetries: 3, ...overrides };
}

describe("GraphLifecycle", () => {
  describe("construction", () => {
    it("creates a graph with nodes and edges", () => {
      const g = new GraphLifecycle({
        id: "g1", planId: "p1",
        nodes: [n({ id: "a" }), n({ id: "b", dependencies: ["a"] })],
        rootNodeId: "a",
      });
      expect(g.nodes.size).toBe(2);
      expect(g.edges.length).toBe(1);
    });
  });

  describe("status transitions", () => {
    it("created → validated → ready → running → completed", () => {
      const g = new GraphLifecycle({ id: "g", planId: "p", nodes: [n()], rootNodeId: "n" });
      expect(g.transition("validated")).toBe(true);
      expect(g.transition("ready")).toBe(true);
      expect(g.transition("running")).toBe(true);
      expect(g.transition("completed")).toBe(true);
      expect(g.status).toBe("completed");
    });

    it("rejects jumping from created to running", () => {
      const g = new GraphLifecycle({ id: "g", planId: "p", nodes: [n()], rootNodeId: "n" });
      expect(g.transition("running")).toBe(false);
      expect(g.status).toBe("created");
    });

    it("rejects completed → running", () => {
      const g = new GraphLifecycle({ id: "g", planId: "p", nodes: [n()], rootNodeId: "n" });
      g.transition("validated"); g.transition("ready"); g.transition("running"); g.transition("completed");
      expect(g.transition("running")).toBe(false);
    });

    it("rejects archived → anything", () => {
      const g = new GraphLifecycle({ id: "g", planId: "p", nodes: [n()], rootNodeId: "n" });
      g.transition("validated"); g.transition("ready"); g.transition("running"); g.transition("completed"); g.transition("archived");
      expect(g.transition("ready")).toBe(false);
    });
  });

  describe("canTransition", () => {
    it("returns true for legal transitions", () => {
      const g = new GraphLifecycle({ id: "g", planId: "p", nodes: [n()], rootNodeId: "n" });
      expect(g.canTransition("validated")).toBe(true);
      expect(g.canTransition("failed")).toBe(true);
      expect(g.canTransition("running")).toBe(false);
    });
  });

  describe("validate", () => {
    it("accepts a valid DAG", () => {
      const g = new GraphLifecycle({ id: "g", planId: "p", nodes: [n({ id: "a" }), n({ id: "b", dependencies: ["a"] })], rootNodeId: "a" });
      expect(g.validate().valid).toBe(true);
    });

    it("rejects a cycle", () => {
      const g = new GraphLifecycle({ id: "g", planId: "p", nodes: [n({ id: "a", dependencies: ["b"] }), n({ id: "b", dependencies: ["a"] })], rootNodeId: "a" });
      expect(g.validate().valid).toBe(false);
    });

    it("detects orphans", () => {
      const g = new GraphLifecycle({ id: "g", planId: "p", nodes: [n({ id: "a" }), n({ id: "b" })], rootNodeId: "a" });
      const v = g.validate();
      expect(v.valid).toBe(false);
      expect(v.orphans).toContain("b");
    });
  });

  describe("getProgress", () => {
    it("computes progress correctly", () => {
      const g = new GraphLifecycle({
        id: "g", planId: "p",
        nodes: [n({ id: "a", status: "completed" }), n({ id: "b", status: "running", dependencies: ["a"] }), n({ id: "c", status: "failed", dependencies: ["b"] })],
        rootNodeId: "a",
      });
      const p = g.getProgress();
      expect(p.completed).toBe(1);
      expect(p.failed).toBe(1);
      expect(p.total).toBe(3);
    });
  });
});
