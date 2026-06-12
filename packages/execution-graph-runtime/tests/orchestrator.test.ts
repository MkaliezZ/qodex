import { describe, it, expect, beforeEach } from "vitest";
import { GraphLifecycle } from "../src/lifecycle/lifecycle.js";
import { NodeOrchestrator } from "../src/orchestration/orchestrator.js";
import { GraphEventBus } from "../src/events/bus.js";
import type { ExecutionNode } from "../src/models/graph.js";

function n(overrides: Partial<ExecutionNode> = {}): ExecutionNode {
  return { id: "n", type: "task", status: "pending", description: "", dependencies: [], dependents: [], retryCount: 0, maxRetries: 3, ...overrides };
}

describe("NodeOrchestrator", () => {
  let bus: GraphEventBus;
  let orchestrator: NodeOrchestrator;

  beforeEach(() => { bus = new GraphEventBus(); });

  it("executes all nodes in sequence", async () => {
    orchestrator = new NodeOrchestrator(bus);
    const g = new GraphLifecycle({ id: "g1", planId: "p1",
      nodes: [n({ id: "a" }), n({ id: "b", dependencies: ["a"] })], rootNodeId: "a",
    });
    g.transition("validated"); g.transition("ready"); g.transition("running");

    await orchestrator.executeGraph(g);
    expect(g.getNode("a")?.status).toBe("completed");
    expect(g.getNode("b")?.status).toBe("completed");
    expect(g.status).toBe("completed");
  });

  it("handles node failure and blocks dependents", async () => {
    orchestrator = new NodeOrchestrator(bus, async (id) => {
      if (id === "a") throw new Error("fail");
      return { ok: true };
    });
    const g = new GraphLifecycle({ id: "g2", planId: "p2",
      nodes: [n({ id: "a", maxRetries: 1 }), n({ id: "b", dependencies: ["a"] })], rootNodeId: "a",
    });
    g.transition("validated"); g.transition("ready"); g.transition("running");

    await orchestrator.executeGraph(g);
    expect(g.getNode("a")?.status).toBe("failed");
    expect(g.getNode("b")?.status).toBe("blocked");
    expect(g.status).toBe("failed");
  });

  it("emits graph events in correct order", async () => {
    orchestrator = new NodeOrchestrator(bus);
    const events: string[] = [];
    bus.subscribe((e) => events.push(e.type));

    const g = new GraphLifecycle({ id: "g3", planId: "p3",
      nodes: [n({ id: "a" })], rootNodeId: "a",
    });
    g.transition("validated"); g.transition("ready"); g.transition("running");

    await orchestrator.executeGraph(g);
    expect(events).toContain("graph.started");
    expect(events).toContain("node.dispatched");
    expect(events).toContain("node.result");
    expect(events).toContain("graph.completed");
  });

  it("uses custom dispatch function", async () => {
    orchestrator = new NodeOrchestrator(bus, async (id, desc, type) => ({
      custom: true, id, desc, type,
    }));
    const g = new GraphLifecycle({ id: "g4", planId: "p4",
      nodes: [n({ id: "a" })], rootNodeId: "a",
    });
    g.transition("validated"); g.transition("ready"); g.transition("running");

    await orchestrator.executeGraph(g);
    expect(g.getNode("a")?.result).toEqual({ custom: true, id: "a", desc: "", type: "task" });
  });

  it("retries on failure within maxRetries", async () => {
    let calls = 0;
    orchestrator = new NodeOrchestrator(bus, async () => {
      calls++;
      if (calls < 2) throw new Error("retry");
      return { recovered: true };
    });
    const g = new GraphLifecycle({ id: "g5", planId: "p5",
      nodes: [n({ id: "r", maxRetries: 3 })], rootNodeId: "r",
    });
    g.transition("validated"); g.transition("ready"); g.transition("running");

    await orchestrator.executeGraph(g);
    expect(calls).toBe(2);
    expect(g.getNode("r")?.status).toBe("completed");
  });

  it("fails graph when a node exhausts retries", async () => {
    orchestrator = new NodeOrchestrator(bus, async () => { throw new Error("always"); });
    const g = new GraphLifecycle({ id: "g6", planId: "p6",
      nodes: [n({ id: "f", maxRetries: 1 })], rootNodeId: "f",
    });
    g.transition("validated"); g.transition("ready"); g.transition("running");

    await orchestrator.executeGraph(g);
    expect(g.status).toBe("failed");
  });
});
