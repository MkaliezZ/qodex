import { describe, it, expect, beforeEach } from "vitest";
import { GraphEventBus } from "../src/events/bus.js";

describe("GraphEventBus", () => {
  let bus: GraphEventBus;
  beforeEach(() => { bus = new GraphEventBus(); });

  it("subscribes and unsubscribes", () => {
    const unsub = bus.subscribe(() => {});
    expect(bus.subscriberCount()).toBe(1);
    unsub();
    expect(bus.subscriberCount()).toBe(0);
  });

  it("delivers events to handlers", () => {
    const received: string[] = [];
    bus.subscribe((e) => received.push(e.type));
    bus.emit({ type: "graph.created", graphId: "g", planId: "p", timestamp: 0 });
    bus.emit({ type: "graph.started", graphId: "g", timestamp: 0 });
    expect(received).toEqual(["graph.created", "graph.started"]);
  });

  it("isolates handler errors", () => {
    const r: string[] = [];
    bus.subscribe(() => { throw new Error("boom"); });
    bus.subscribe((e) => r.push(e.type));
    bus.emit({ type: "graph.created", graphId: "g", planId: "p", timestamp: 0 });
    expect(r).toContain("graph.created");
  });

  it("records history", () => {
    bus.emit({ type: "graph.created", graphId: "g", planId: "p", timestamp: 0 });
    expect(bus.getHistory().length).toBe(1);
    bus.clearHistory();
    expect(bus.getHistory().length).toBe(0);
  });
});
