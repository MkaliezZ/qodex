import { describe, it, expect } from "vitest";
import { GraphLifecycle } from "../src/lifecycle/lifecycle.js";
import { ExecutionGraphRuntime } from "../src/runtime/runtime.js";
import type { ExecutionNode } from "../src/models/graph.js";

function n(overrides: Partial<ExecutionNode> = {}): ExecutionNode {
  return { id: "n", type: "task", status: "pending", description: "", dependencies: [], dependents: [], retryCount: 0, maxRetries: 3, ...overrides };
}

describe("Edge Cases", () => {
  it("empty graph is technically valid (no cycles, no orphans)", () => {
    const g = new GraphLifecycle({ id: "g-empty", planId: "p", nodes: [], rootNodeId: "none" });
    // Empty graph has no cycles and no nodes to be orphaned — DAG valid
    expect(g.validate().valid).toBe(true);
  });

  it("50-node linear chain validates", () => {
    const nodes = Array.from({ length: 50 }, (_, i) => n({ id: `n${i}`, dependencies: i > 0 ? [`n${i - 1}`] : [] }));
    const g = new GraphLifecycle({ id: "g-50", planId: "p", nodes, rootNodeId: "n0" });
    expect(g.validate().valid).toBe(true);
  });

  it("cannot transition from archived back to running", () => {
    const g = new GraphLifecycle({ id: "g", planId: "p", nodes: [n()], rootNodeId: "n" });
    g.transition("validated"); g.transition("ready"); g.transition("running"); g.transition("completed"); g.transition("archived");
    expect(g.transition("running")).toBe(false);
    expect(g.transition("ready")).toBe(false);
  });

  it("node result preserves complex objects", async () => {
    const rt = new ExecutionGraphRuntime({
      dispatch: async (id) => ({ complex: { nested: { value: 42, items: [1, 2, 3] } }, id }),
    });
    const g = rt.buildGraph({ planId: "p", nodes: [n({ id: "a" })], rootNodeId: "a" });
    await rt.start(g);
    expect(g.getNode("a")?.result).toEqual({ complex: { nested: { value: 42, items: [1, 2, 3] } }, id: "a" });
  });

  it("all 9 node types in a single graph", () => {
    const types = ["goal", "plan", "task", "review", "diff", "checkpoint", "approval", "tool", "report"] as const;
    const nodes = types.map((t, i) => n({ id: `n${i}`, type: t, dependencies: i > 0 ? [`n${i - 1}`] : [] }));
    const g = new GraphLifecycle({ id: "g-all", planId: "p", nodes, rootNodeId: "n0" });
    expect(g.validate().valid).toBe(true);
  });

  it("cancelling a completed graph is no-op", async () => {
    const rt = new ExecutionGraphRuntime();
    const g = rt.buildGraph({ planId: "p", nodes: [n({ id: "a" })], rootNodeId: "a" });
    await rt.start(g);
    await rt.cancel(g.id); // should not throw or change status
    expect(rt.getGraphStatus(g.id)).toBe("completed");
  });
});
