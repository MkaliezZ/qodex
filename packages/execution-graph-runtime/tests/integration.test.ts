import { describe, it, expect, beforeEach } from "vitest";
import { ExecutionGraphRuntime } from "../src/runtime/runtime.js";
import type { ExecutionNode } from "../src/models/graph.js";

function n(overrides: Partial<ExecutionNode> = {}): ExecutionNode {
  return { id: "n", type: "task", status: "pending", description: "", dependencies: [], dependents: [], retryCount: 0, maxRetries: 3, ...overrides };
}

describe("Integration — Execution Graph Runtime", () => {
  let rt: ExecutionGraphRuntime;

  beforeEach(() => { rt = new ExecutionGraphRuntime(); });

  it("full lifecycle with 5-node graph", async () => {
    const g = rt.buildGraph({
      planId: "p1",
      nodes: [
        n({ id: "a" }), n({ id: "b", dependencies: ["a"] }),
        n({ id: "c", dependencies: ["a"] }), n({ id: "d", dependencies: ["b", "c"] }),
        n({ id: "e", dependencies: ["d"] }),
      ],
      rootNodeId: "a",
    });

    await rt.start(g);
    expect(g.status).toBe("completed");
    expect(g.getProgress().completed).toBe(5);

    const archive = rt.archive(g.id);
    expect(archive.snapshots[0].metadata.completedCount).toBe(5);

    const replay = await rt.replayGraph(archive.id);
    expect(replay!.events.length).toBe(5);

    expect(rt.getGraphStatus(g.id)).toBe("archived");
    expect(rt.listGraphs().length).toBe(1);
  });

  it("handles partial failure gracefully", async () => {
    const failingRuntime = new ExecutionGraphRuntime({
      dispatch: async (id) => { if (id === "bad") throw new Error("fail"); return { ok: true }; },
    });

    const g = failingRuntime.buildGraph({
      planId: "p2",
      nodes: [
        n({ id: "good" }),
        n({ id: "bad", dependencies: ["good"], maxRetries: 1 }),
        n({ id: "after", dependencies: ["bad"] }),
      ],
      rootNodeId: "good",
    });

    await failingRuntime.start(g);
    expect(g.getNode("good")?.status).toBe("completed");
    expect(g.getNode("bad")?.status).toBe("failed");
    expect(g.getNode("after")?.status).toBe("blocked");
  });

  it("multiple archives coexist", async () => {
    const g1 = rt.buildGraph({ planId: "p1", nodes: [n({ id: "x" })], rootNodeId: "x" });
    const g2 = rt.buildGraph({ planId: "p2", nodes: [n({ id: "y" })], rootNodeId: "y" });
    await rt.start(g1); await rt.start(g2);
    rt.archive(g1.id); rt.archive(g2.id);

    expect(rt.listArchives().length).toBe(2);
  });
});
