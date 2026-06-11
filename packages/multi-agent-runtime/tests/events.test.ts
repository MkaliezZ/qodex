import { describe, it, expect, vi } from "vitest";
import { AgentEventBus } from "../src/index.js";

describe("AgentEventBus", () => {
  it("delivers events", () => {
    const b = new AgentEventBus(); const h = vi.fn(); b.subscribe(h);
    b.publish("agent.created", { id: "a1" });
    expect(h).toHaveBeenCalledTimes(1);
  });
  it("unsubscribe stops events", () => {
    const b = new AgentEventBus(); const h = vi.fn();
    const u = b.subscribe(h); u(); b.publish("agent.created", {});
    expect(h).not.toHaveBeenCalled();
  });
  it("survives handler exceptions", () => {
    const b = new AgentEventBus(); const g = vi.fn();
    b.subscribe(() => { throw new Error("oops"); }); b.subscribe(g);
    b.publish("agent.created", {}); expect(g).toHaveBeenCalled();
  });
  it("clear removes all", () => {
    const b = new AgentEventBus(); b.subscribe(vi.fn()); b.subscribe(vi.fn());
    expect(b.size).toBe(2); b.clear(); expect(b.size).toBe(0);
  });
  it("events have timestamp and payload", () => {
    const b = new AgentEventBus(); const events: any[] = [];
    b.subscribe((e) => events.push(e));
    b.publish("report.generated", { findingCount: 3 });
    expect(events[0].timestamp).toBeTruthy();
    expect(events[0].payload.findingCount).toBe(3);
  });
});
