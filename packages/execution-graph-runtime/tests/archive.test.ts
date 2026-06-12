import { describe, it, expect, beforeEach } from "vitest";
import { GraphLifecycle } from "../src/lifecycle/lifecycle.js";
import { ArchiveManager } from "../src/archive/archive.js";
import { GraphEventBus } from "../src/events/bus.js";
import type { ExecutionNode } from "../src/models/graph.js";

function n(overrides: Partial<ExecutionNode> = {}): ExecutionNode {
  return { id: "n", type: "task", status: "pending", description: "", dependencies: [], dependents: [], retryCount: 0, maxRetries: 3, ...overrides };
}

describe("ArchiveManager", () => {
  let bus: GraphEventBus;
  let am: ArchiveManager;

  beforeEach(() => { bus = new GraphEventBus(); am = new ArchiveManager(bus); });

  it("creates an archive from a completed graph", () => {
    const g = new GraphLifecycle({ id: "g1", planId: "p1", nodes: [n({ id: "a", status: "completed", completedAt: Date.now() })], rootNodeId: "a" });
    g.transition("validated"); g.transition("ready"); g.transition("running"); g.transition("completed");

    const a = am.createArchive(g);
    expect(a.id).toBe("archive-g1");
    expect(a.snapshots.length).toBe(1);
    expect(a.snapshots[0].metadata.nodeCount).toBe(1);
    expect(a.snapshots[0].metadata.completedCount).toBe(1);
  });

  it("includes failed nodes in archive metadata", () => {
    const g = new GraphLifecycle({ id: "g2", planId: "p2", nodes: [n({ id: "a", status: "failed" }), n({ id: "b", status: "completed" })], rootNodeId: "a" });

    const a = am.createArchive(g);
    expect(a.snapshots[0].metadata.failedCount).toBe(1);
    expect(a.snapshots[0].metadata.completedCount).toBe(1);
  });

  it("emits history.created event", () => {
    const events: string[] = [];
    bus.subscribe((e) => events.push(e.type));
    const g = new GraphLifecycle({ id: "g3", planId: "p3", nodes: [n({ id: "a", status: "completed" })], rootNodeId: "a" });
    am.createArchive(g);
    expect(events).toContain("history.created");
  });

  it("retrieves archive by id", () => {
    const g = new GraphLifecycle({ id: "g4", planId: "p4", nodes: [n({ id: "a" })], rootNodeId: "a" });
    am.createArchive(g);
    expect(am.getArchive("archive-g4")).not.toBeNull();
    expect(am.getArchive("nonexistent")).toBeNull();
  });

  it("lists all archives", () => {
    const g1 = new GraphLifecycle({ id: "ga", planId: "pa", nodes: [n({ id: "x" })], rootNodeId: "x" });
    const g2 = new GraphLifecycle({ id: "gb", planId: "pb", nodes: [n({ id: "y" })], rootNodeId: "y" });
    am.createArchive(g1);
    am.createArchive(g2);
    expect(am.listArchives().length).toBe(2);
  });

  it("exports and imports archives", () => {
    const g = new GraphLifecycle({ id: "g5", planId: "p5", nodes: [n({ id: "a", status: "completed" })], rootNodeId: "a" });
    am.createArchive(g);
    const exported = am.exportArchive("archive-g5");
    expect(exported).not.toBeNull();

    const imported = am.importArchive(exported!);
    expect(imported.id).toBe("archive-g5");
  });
});
