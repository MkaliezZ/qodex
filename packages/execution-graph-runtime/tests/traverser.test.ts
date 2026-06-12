import { describe, it, expect } from "vitest";
import { GraphLifecycle } from "../src/lifecycle/lifecycle.js";
import { GraphTraverser } from "../src/traversal/traverser.js";
import type { ExecutionNode } from "../src/models/graph.js";

function n(overrides: Partial<ExecutionNode> = {}): ExecutionNode {
  return { id: "n", type: "task", status: "pending", description: "", dependencies: [], dependents: [], retryCount: 0, maxRetries: 3, ...overrides };
}

describe("GraphTraverser", () => {
  const t = new GraphTraverser();

  it("topologically sorts a linear graph", () => {
    const g = new GraphLifecycle({ id: "g", planId: "p",
      nodes: [n({ id: "a" }), n({ id: "b", dependencies: ["a"] }), n({ id: "c", dependencies: ["b"] })],
      rootNodeId: "a",
    });
    const sorted = t.topologicalSort(g);
    expect(sorted).toEqual(["a", "b", "c"]);
  });

  it("topologically sorts a diamond graph", () => {
    const g = new GraphLifecycle({ id: "g", planId: "p",
      nodes: [n({ id: "s" }), n({ id: "a", dependencies: ["s"] }), n({ id: "b", dependencies: ["s"] }), n({ id: "t", dependencies: ["a", "b"] })],
      rootNodeId: "s",
    });
    const sorted = t.topologicalSort(g);
    expect(sorted.indexOf("s")).toBeLessThan(sorted.indexOf("a"));
    expect(sorted.indexOf("s")).toBeLessThan(sorted.indexOf("b"));
    expect(sorted.indexOf("a")).toBeLessThan(sorted.indexOf("t"));
    expect(sorted.indexOf("b")).toBeLessThan(sorted.indexOf("t"));
  });

  it("dependencyWalk returns dependencies in order", () => {
    const g = new GraphLifecycle({ id: "g", planId: "p",
      nodes: [n({ id: "a" }), n({ id: "b", dependencies: ["a"] }), n({ id: "c", dependencies: ["b"] })],
      rootNodeId: "a",
    });
    const walk = t.dependencyWalk(g, "c");
    expect(walk[0]).toBe("a");
    expect(walk[1]).toBe("b");
    expect(walk[2]).toBe("c");
  });

  it("reverseDependencyWalk returns dependents", () => {
    const g = new GraphLifecycle({ id: "g", planId: "p",
      nodes: [n({ id: "a" }), n({ id: "b", dependencies: ["a"] }), n({ id: "c", dependencies: ["a"] })],
      rootNodeId: "a",
    });
    const walk = t.reverseDependencyWalk(g, "a");
    expect(walk).toContain("b");
    expect(walk).toContain("c");
  });

  it("getAllPaths returns all root-to-leaf paths", () => {
    const g = new GraphLifecycle({ id: "g", planId: "p",
      nodes: [n({ id: "a" }), n({ id: "b", dependencies: ["a"] }), n({ id: "c", dependencies: ["a"] })],
      rootNodeId: "a",
    });
    const paths = t.getAllPaths(g);
    expect(paths.length).toBe(2);
    expect(paths.some((p) => p.join(",") === "a,b")).toBe(true);
    expect(paths.some((p) => p.join(",") === "a,c")).toBe(true);
  });
});
