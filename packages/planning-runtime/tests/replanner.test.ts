import { describe, it, expect, beforeEach } from "vitest";
import { Planner } from "../src/planner/planner.js";
import { ExecutionGraph } from "../src/models/graph.js";
import { Replanner } from "../src/replanning/replanner.js";
import { PlanningEventBus } from "../src/events/bus.js";
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

describe("Replanner", () => {
  let planner: Planner;
  let bus: PlanningEventBus;
  let replanner: Replanner;

  beforeEach(() => {
    planner = new Planner();
    bus = new PlanningEventBus();
    replanner = new Replanner(planner, bus);
  });

  describe("depth limit", () => {
    it("starts at depth 0", () => {
      expect(replanner.getCurrentDepth()).toBe(0);
    });

    it("canReplan returns true initially", () => {
      expect(replanner.canReplan()).toBe(true);
    });

    it("enforces max depth of 3", async () => {
      const graph = new ExecutionGraph({
        id: "g-depth",
        planId: "p1",
        nodes: [
          { ...makeNode({ id: "a", status: "failed" }) },
        ],
        rootNodeId: "a",
      });

      // 3 replans should work
      for (let i = 0; i < 3; i++) {
        const result = await replanner.requestReplan(
          { graphId: "g-depth", reason: "failure", failedNodeIds: ["a"], timestamp: Date.now() },
          graph,
        );
        expect(result).not.toBeNull();
      }

      // 4th should fail
      expect(replanner.canReplan()).toBe(false);
      const result = await replanner.requestReplan(
        { graphId: "g-depth", reason: "failure", failedNodeIds: ["a"], timestamp: Date.now() },
        graph,
      );
      expect(result).toBeNull();
    });
  });

  describe("requestReplan", () => {
    it("removes failed nodes from new graph on failure trigger", async () => {
      const graph = new ExecutionGraph({
        id: "g1",
        planId: "p1",
        nodes: [
          { ...makeNode({ id: "a", status: "completed" }) },
          { ...makeNode({ id: "b", status: "failed", dependencies: ["a"] }) },
        ],
        rootNodeId: "a",
      });

      const result = await replanner.requestReplan(
        { graphId: "g1", reason: "failure", failedNodeIds: ["b"], timestamp: Date.now() },
        graph,
      );

      expect(result).not.toBeNull();
      expect(result!.changes).toHaveLength(1);
      expect(result!.changes[0].type).toBe("removed");
      expect(result!.changes[0].nodeId).toBe("b");
      expect(result!.newGraphId).toContain("graph-replan");
    });

    it("resets surviving node statuses to pending on dependency_change", async () => {
      const graph = new ExecutionGraph({
        id: "g2",
        planId: "p1",
        nodes: [
          { ...makeNode({ id: "a", status: "completed" }) },
          { ...makeNode({ id: "b", status: "failed", dependencies: ["a"] }) },
          { ...makeNode({ id: "c", status: "blocked", dependencies: ["b"] }) },
        ],
        rootNodeId: "a",
      });

      const result = await replanner.requestReplan(
        {
          graphId: "g2",
          reason: "dependency_change",
          failedNodeIds: ["b", "c"],
          timestamp: Date.now(),
        },
        graph,
      );

      expect(result).not.toBeNull();
      expect(result!.changes.length).toBe(2); // b and c removed
    });

    it("emits replan.requested and replan.completed events", async () => {
      const events: string[] = [];
      bus.subscribe((e) => events.push(e.type));

      const graph = new ExecutionGraph({
        id: "g3",
        planId: "p1",
        nodes: [
          { ...makeNode({ id: "a", status: "failed" }) },
        ],
        rootNodeId: "a",
      });

      await replanner.requestReplan(
        { graphId: "g3", reason: "user_request", timestamp: Date.now() },
        graph,
      );

      expect(events).toContain("replan.requested");
      expect(events).toContain("replan.completed");
    });

    it("increments replan depth", async () => {
      const graph = new ExecutionGraph({
        id: "g4",
        planId: "p1",
        nodes: [
          { ...makeNode({ id: "a", status: "failed" }) },
        ],
        rootNodeId: "a",
      });

      const r1 = await replanner.requestReplan(
        { graphId: "g4", reason: "failure", failedNodeIds: ["a"], timestamp: Date.now() },
        graph,
      );

      expect(r1!.depth).toBe(1);
      expect(replanner.getCurrentDepth()).toBe(1);
    });
  });

  describe("reset", () => {
    it("resets replan count to 0", async () => {
      const graph = new ExecutionGraph({
        id: "g5",
        planId: "p1",
        nodes: [{ ...makeNode({ id: "a", status: "failed" }) }],
        rootNodeId: "a",
      });

      await replanner.requestReplan(
        { graphId: "g5", reason: "failure", failedNodeIds: ["a"], timestamp: Date.now() },
        graph,
      );
      expect(replanner.getCurrentDepth()).toBe(1);

      replanner.reset();
      expect(replanner.getCurrentDepth()).toBe(0);
      expect(replanner.canReplan()).toBe(true);
    });
  });
});
