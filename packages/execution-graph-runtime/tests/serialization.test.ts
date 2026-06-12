import { describe, it, expect, beforeEach } from "vitest";
import { ExecutionGraphRuntime } from "../src/runtime/runtime.js";
import { GraphLifecycle } from "../src/lifecycle/lifecycle.js";
import { ArchiveManager } from "../src/archive/archive.js";
import { GraphEventBus } from "../src/events/bus.js";
import type { ExecutionNode } from "../src/models/graph.js";

function n(overrides: Partial<ExecutionNode> = {}): ExecutionNode {
  return { id: "n", type: "task", status: "pending", description: "", dependencies: [], dependents: [], retryCount: 0, maxRetries: 3, ...overrides };
}

describe("Serialization", () => {
  it("round-trips graph through archive export/import", async () => {
    const rt = new ExecutionGraphRuntime();
    const g = rt.buildGraph({ planId: "p1", nodes: [n({ id: "a", status: "completed", completedAt: 1000 }), n({ id: "b", dependencies: ["a"], status: "completed" })], rootNodeId: "a" });
    await rt.start(g);
    rt.archive(g.id);

    const exported = rt.exportArchive("archive-" + g.id)!;
    const imported = rt.importArchive(exported);

    expect(imported.id).toBe("archive-" + g.id);
    expect(imported.snapshots[0].nodes.length).toBe(2);
    expect(imported.records.length).toBe(2);
  });

  it("preserves archive data through round-trip", () => {
    const bus = new GraphEventBus();
    const am = new ArchiveManager(bus);
    const g = new GraphLifecycle({
      id: "g-rt", planId: "p-rt",
      nodes: [n({ id: "a", type: "approval", status: "completed", result: { approved: true }, completedAt: 5000 }), n({ id: "b", dependencies: ["a"], status: "failed", retryCount: 3 })],
      rootNodeId: "a",
    });
    am.createArchive(g);

    const data = am.exportArchive("archive-g-rt")!;
    const restored = am.importArchive(data);

    expect(restored.snapshots[0].metadata.nodeCount).toBe(2);
    expect(restored.snapshots[0].metadata.failedCount).toBe(1);
    expect(restored.snapshots[0].metadata.completedCount).toBe(1);
  });
});
