import { describe, it, expect, beforeEach } from "vitest";
import { GraphLifecycle } from "../src/lifecycle/lifecycle.js";
import { ArchiveManager } from "../src/archive/archive.js";
import { GraphInspector } from "../src/inspection/inspector.js";
import { GraphEventBus } from "../src/events/bus.js";
import type { ExecutionNode } from "../src/models/graph.js";

function n(overrides: Partial<ExecutionNode> = {}): ExecutionNode {
  return { id: "n", type: "task", status: "pending", description: "", dependencies: [], dependents: [], retryCount: 0, maxRetries: 3, ...overrides };
}

describe("GraphInspector", () => {
  let graphs: Map<string, GraphLifecycle>;
  let am: ArchiveManager;
  let inspector: GraphInspector;

  beforeEach(() => {
    const bus = new GraphEventBus();
    graphs = new Map();
    am = new ArchiveManager(bus);
    inspector = new GraphInspector(graphs, am);
  });

  it("returns null for unknown graph", () => {
    expect(inspector.getGraph("nope")).toBeNull();
    expect(inspector.getNodeState("nope", "a")).toBeNull();
    expect(inspector.getGraphStatus("nope")).toBeNull();
  });

  it("queries graph state correctly", () => {
    const g = new GraphLifecycle({ id: "g1", planId: "p1", nodes: [n({ id: "a" })], rootNodeId: "a" });
    graphs.set(g.id, g);

    expect(inspector.getGraph("g1")?.status).toBe("created");
    expect(inspector.getGraphStatus("g1")).toBe("created");
    expect(inspector.getNodeState("g1", "a")?.status).toBe("pending");
  });

  it("lists all graphs", () => {
    const g1 = new GraphLifecycle({ id: "g1", planId: "p", nodes: [n({ id: "x" })], rootNodeId: "x" });
    const g2 = new GraphLifecycle({ id: "g2", planId: "p", nodes: [n({ id: "y" })], rootNodeId: "y" });
    graphs.set(g1.id, g1); graphs.set(g2.id, g2);
    expect(inspector.listGraphs().length).toBe(2);
  });

  it("lists archives via archive manager", () => {
    const g = new GraphLifecycle({ id: "g", planId: "p", nodes: [n({ id: "a", status: "completed" })], rootNodeId: "a" });
    graphs.set(g.id, g);
    am.createArchive(g);
    expect(inspector.listArchives().length).toBe(1);
  });

  it("returns archive history records", () => {
    const g = new GraphLifecycle({ id: "g", planId: "p", nodes: [n({ id: "a", status: "completed" })], rootNodeId: "a" });
    graphs.set(g.id, g);
    am.createArchive(g);
    const history = inspector.getArchiveHistory("archive-g");
    expect(history).not.toBeNull();
    expect(history!.length).toBe(1);
  });
});
