import { describe, it, expect, beforeEach } from "vitest";
import { ExecutionGraphRuntime } from "../src/runtime/runtime.js";
import type { ExecutionNode } from "../src/models/graph.js";

function n(overrides: Partial<ExecutionNode> = {}): ExecutionNode {
  return { id: "n", type: "task", status: "pending", description: "", dependencies: [], dependents: [], retryCount: 0, maxRetries: 3, ...overrides };
}

describe("ExecutionGraphRuntime", () => {
  let rt: ExecutionGraphRuntime;

  beforeEach(() => { rt = new ExecutionGraphRuntime(); });

  describe("buildGraph", () => {
    it("builds and validates a graph", () => {
      const g = rt.buildGraph({ planId: "p1", nodes: [n({ id: "a" })], rootNodeId: "a" });
      expect(g.status).toBe("ready");
    });

    it("rejects invalid DAG with cycles", () => {
      const g = rt.buildGraph({ planId: "p2", nodes: [n({ id: "a", dependencies: ["b"] }), n({ id: "b", dependencies: ["a"] })], rootNodeId: "a" });
      expect(g.status).toBe("failed");
    });

    it("emits graph.created event", () => {
      const events: string[] = [];
      rt.subscribe((e) => events.push(e.type));
      rt.buildGraph({ planId: "p3", nodes: [n({ id: "a" })], rootNodeId: "a" });
      expect(events).toContain("graph.created");
    });
  });

  describe("start", () => {
    it("executes a graph to completion", async () => {
      const g = rt.buildGraph({ planId: "p1", nodes: [n({ id: "a" }), n({ id: "b", dependencies: ["a"] })], rootNodeId: "a" });
      await rt.start(g);
      expect(g.status).toBe("completed");
      expect(g.getNode("a")?.status).toBe("completed");
      expect(g.getNode("b")?.status).toBe("completed");
    });

    it("rejects starting an already completed graph", async () => {
      const g = rt.buildGraph({ planId: "p2", nodes: [n({ id: "a" })], rootNodeId: "a" });
      await rt.start(g);
      await expect(rt.start(g)).rejects.toThrow("Cannot start");
    });
  });

  describe("cancel", () => {
    it("throws for unknown graph", async () => {
      await expect(rt.cancel("nope")).rejects.toThrow();
    });

    it("cancels a ready graph", () => {
      const g = rt.buildGraph({ planId: "p1", nodes: [n({ id: "a" })], rootNodeId: "a" });
      rt.cancel(g.id);
      expect(rt.getGraphStatus(g.id)).toBe("cancelled");
    });
  });

  describe("archive / replay", () => {
    it("full lifecycle: build → start → archive → replay", async () => {
      const g = rt.buildGraph({ planId: "p1", nodes: [n({ id: "a" }), n({ id: "b", dependencies: ["a"] })], rootNodeId: "a" });
      await rt.start(g);

      const archive = rt.archive(g.id);
      expect(archive.id).toBe("archive-" + g.id);

      const result = await rt.replayGraph(archive.id);
      expect(result).not.toBeNull();
      expect(result!.events.length).toBe(2);
    });
  });

  describe("query methods", () => {
    it("returns null for unknown graphs", () => {
      expect(rt.getGraph("nope")).toBeNull();
      expect(rt.getGraphStatus("nope")).toBeNull();
      expect(rt.getProgress("nope")).toBeNull();
      expect(rt.getNodeState("nope", "a")).toBeNull();
    });

    it("lists all graphs", () => {
      rt.buildGraph({ planId: "p1", nodes: [n({ id: "x" })], rootNodeId: "x" });
      rt.buildGraph({ planId: "p2", nodes: [n({ id: "y" })], rootNodeId: "y" });
      expect(rt.listGraphs().length).toBe(2);
    });

    it("topologicalSort returns sorted node list", () => {
      const g = rt.buildGraph({ planId: "p1", nodes: [n({ id: "a" }), n({ id: "b", dependencies: ["a"] })], rootNodeId: "a" });
      expect(rt.topologicalSort(g.id)).toEqual(["a", "b"]);
    });

    it("dependencyWalk traces dependencies", () => {
      const g = rt.buildGraph({ planId: "p1", nodes: [n({ id: "a" }), n({ id: "b", dependencies: ["a"] })], rootNodeId: "a" });
      expect(rt.dependencyWalk(g.id, "b")).toEqual(["a", "b"]);
    });
  });

  describe("serialization", () => {
    it("exports and imports archive", async () => {
      const g = rt.buildGraph({ planId: "p1", nodes: [n({ id: "a", status: "completed", completedAt: Date.now() })], rootNodeId: "a" });
      await rt.start(g);
      rt.archive(g.id);
      const exported = rt.exportArchive("archive-" + g.id);
      expect(exported).not.toBeNull();
      const imported = rt.importArchive(exported!);
      expect(imported.id).toBe("archive-" + g.id);
    });
  });

  describe("events", () => {
    it("subscribe/unsubscribe works", () => {
      const unsub = rt.subscribe(() => {});
      unsub();
    });
  });

  describe("custom dispatch", () => {
    it("uses custom dispatch function for node execution", async () => {
      const customRuntime = new ExecutionGraphRuntime({
        dispatch: async (id) => ({ custom: true, nodeId: id }),
      });
      const g = customRuntime.buildGraph({ planId: "p1", nodes: [n({ id: "a" })], rootNodeId: "a" });
      await customRuntime.start(g);
      expect(g.getNode("a")?.result).toEqual({ custom: true, nodeId: "a" });
    });
  });
});
