import { describe, it, expect, beforeEach } from "vitest";
import { GraphLifecycle } from "../src/lifecycle/lifecycle.js";
import { ArchiveManager } from "../src/archive/archive.js";
import { ReplayEngine } from "../src/replay/replay.js";
import { GraphEventBus } from "../src/events/bus.js";
import type { ExecutionNode } from "../src/models/graph.js";

function n(overrides: Partial<ExecutionNode> = {}): ExecutionNode {
  return { id: "n", type: "task", status: "pending", description: "", dependencies: [], dependents: [], retryCount: 0, maxRetries: 3, ...overrides };
}

describe("ReplayEngine", () => {
  let bus: GraphEventBus;
  let am: ArchiveManager;
  let engine: ReplayEngine;

  beforeEach(() => { bus = new GraphEventBus(); am = new ArchiveManager(bus); engine = new ReplayEngine(am, bus); });

  it("returns null for nonexistent archive", async () => {
    expect(await engine.replay({ archiveId: "nope", type: "graph" })).toBeNull();
  });

  it("replays entire graph events", async () => {
    const g = new GraphLifecycle({ id: "g1", planId: "p1", nodes: [n({ id: "a", status: "completed" }), n({ id: "b", dependencies: ["a"], status: "completed" })], rootNodeId: "a" });
    am.createArchive(g);

    const result = await engine.replay({ archiveId: "archive-g1", type: "graph" });
    expect(result).not.toBeNull();
    expect(result!.events.length).toBe(2);
    expect(result!.type).toBe("graph");
  });

  it("replays a single node", async () => {
    const g = new GraphLifecycle({ id: "g2", planId: "p2", nodes: [n({ id: "a", status: "completed" }), n({ id: "b", dependencies: ["a"], status: "completed" })], rootNodeId: "a" });
    am.createArchive(g);

    const result = await engine.replay({ archiveId: "archive-g2", type: "node", nodeId: "a" });
    expect(result!.events.length).toBe(1);
    expect(result!.events[0].nodeId).toBe("a");
  });

  it("replays a path of specific nodes", async () => {
    const g = new GraphLifecycle({ id: "g3", planId: "p3", nodes: [n({ id: "a", status: "completed" }), n({ id: "b", dependencies: ["a"], status: "completed" }), n({ id: "c", dependencies: ["a"], status: "completed" })], rootNodeId: "a" });
    am.createArchive(g);

    const result = await engine.replay({ archiveId: "archive-g3", type: "path", nodeIds: ["a", "c"] });
    expect(result!.events.length).toBe(2);
  });

  it("increments replay count on archive", async () => {
    const g = new GraphLifecycle({ id: "g4", planId: "p4", nodes: [n({ id: "a" })], rootNodeId: "a" });
    am.createArchive(g);
    await engine.replay({ archiveId: "archive-g4", type: "graph" });
    expect(am.getArchive("archive-g4")!.replayCount).toBe(1);
  });

  it("emits replay events in order", async () => {
    const events: string[] = [];
    bus.subscribe((e) => events.push(e.type));
    const g = new GraphLifecycle({ id: "g5", planId: "p5", nodes: [n({ id: "a" })], rootNodeId: "a" });
    am.createArchive(g);
    await engine.replay({ archiveId: "archive-g5", type: "graph" });

    const ri = events.indexOf("replay.requested");
    const rc = events.indexOf("replay.completed");
    expect(ri).toBeGreaterThan(-1);
    expect(rc).toBeGreaterThan(ri);
  });

  it("replay is read-only — archive snapshot unchanged after replay", async () => {
    const g = new GraphLifecycle({ id: "g6", planId: "p6", nodes: [n({ id: "a", status: "completed" })], rootNodeId: "a" });
    const archive = am.createArchive(g);
    const snapshotBefore = JSON.stringify(archive.snapshots);

    await engine.replay({ archiveId: "archive-g6", type: "graph" });

    const snapshotAfter = JSON.stringify(am.getArchive("archive-g6")!.snapshots);
    expect(snapshotBefore).toBe(snapshotAfter);
  });
});
