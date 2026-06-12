import { describe, it, expect, beforeEach } from "vitest";
import { PlanningEventBus } from "../src/events/bus.js";
import type { PlanningEvent } from "../src/models/events.js";

describe("PlanningEventBus", () => {
  let bus: PlanningEventBus;

  beforeEach(() => {
    bus = new PlanningEventBus();
  });

  describe("subscribe", () => {
    it("registers a handler and returns unsubscribe function", () => {
      const fn = () => {};
      const unsub = bus.subscribe(fn);
      expect(bus.subscriberCount()).toBe(1);
      unsub();
      expect(bus.subscriberCount()).toBe(0);
    });

    it("allows multiple handlers", () => {
      bus.subscribe(() => {});
      bus.subscribe(() => {});
      expect(bus.subscriberCount()).toBe(2);
    });
  });

  describe("emit", () => {
    it("delivers events to all handlers in order", () => {
      const received: string[] = [];
      bus.subscribe((e) => received.push(e.type));

      bus.emit({
        type: "plan.created",
        plan: { id: "p1", goalId: "g1", steps: [], createdAt: 0 },
        timestamp: 0,
      });
      bus.emit({
        type: "node.started",
        nodeId: "n1",
        graphId: "g1",
        timestamp: 0,
      });

      expect(received).toEqual(["plan.created", "node.started"]);
    });

    it("isolates handler errors — one handler failing does not block others", () => {
      const received: string[] = [];
      bus.subscribe(() => {
        throw new Error("handler error");
      });
      bus.subscribe((e) => received.push(e.type));

      bus.emit({
        type: "plan.created",
        plan: { id: "p1", goalId: "g1", steps: [], createdAt: 0 },
        timestamp: 0,
      });

      expect(received).toContain("plan.created");
    });

    it("delivers events to multiple subscribers", () => {
      const r1: string[] = [];
      const r2: string[] = [];
      bus.subscribe((e) => r1.push(e.type));
      bus.subscribe((e) => r2.push(e.type));

      bus.emit({
        type: "node.completed",
        nodeId: "n1", graphId: "g1",
        timestamp: 0,
      });

      expect(r1).toEqual(["node.completed"]);
      expect(r2).toEqual(["node.completed"]);
    });
  });

  describe("history", () => {
    it("records emitted events", () => {
      bus.emit({
        type: "node.started",
        nodeId: "n1", graphId: "g1",
        timestamp: 1,
      });
      bus.emit({
        type: "node.completed",
        nodeId: "n1", graphId: "g1",
        timestamp: 2,
      });

      expect(bus.getHistory().length).toBe(2);
    });

    it("clears history on demand", () => {
      bus.emit({
        type: "plan.created",
        plan: { id: "p1", goalId: "g1", steps: [], createdAt: 0 },
        timestamp: 0,
      });
      bus.clearHistory();
      expect(bus.getHistory().length).toBe(0);
    });
  });

  describe("event type coverage", () => {
    const allTypes: string[] = [
      "plan.created", "plan.updated", "graph.created",
      "node.ready", "node.started", "node.completed",
      "node.failed", "node.blocked",
      "replan.requested", "replan.completed",
      "report.generated",
    ];

    it("all event types can be emitted without errors", () => {
      const received: string[] = [];
      bus.subscribe((e) => received.push(e.type));

      for (const type of allTypes) {
        switch (type) {
          case "plan.created":
            bus.emit({ type, plan: { id: "p1", goalId: "g1", steps: [], createdAt: 0 }, timestamp: 0 });
            break;
          case "plan.updated":
            bus.emit({ type, planId: "p1", changes: [], timestamp: 0 });
            break;
          case "graph.created":
            bus.emit({ type, graph: { id: "g1", planId: "p1", nodes: [], edges: [], rootNodeId: "r", status: "ready", createdAt: 0, updatedAt: 0 }, timestamp: 0 });
            break;
          case "node.ready":
            bus.emit({ type, nodeId: "n1", graphId: "g1", timestamp: 0 });
            break;
          case "node.started":
            bus.emit({ type, nodeId: "n1", graphId: "g1", timestamp: 0 });
            break;
          case "node.completed":
            bus.emit({ type, nodeId: "n1", graphId: "g1", timestamp: 0 });
            break;
          case "node.failed":
            bus.emit({ type, nodeId: "n1", graphId: "g1", error: "fail", retryCount: 0, timestamp: 0 });
            break;
          case "node.blocked":
            bus.emit({ type, nodeId: "n1", graphId: "g1", reason: "dep fail", timestamp: 0 });
            break;
          case "replan.requested":
            bus.emit({ type, graphId: "g1", reason: "failure", timestamp: 0 });
            break;
          case "replan.completed":
            bus.emit({ type, graphId: "g1", newGraphId: "g2", timestamp: 0 });
            break;
          case "report.generated":
            bus.emit({ type, graphId: "g1", summary: "done", nodeStatuses: [], timestamp: 0 });
            break;
        }
      }

      expect(received.length).toBe(allTypes.length);
    });
  });
});
