import { describe, it, expect, vi } from "vitest";
import { GitEventBus } from "../src/index.js";

describe("GitEventBus", () => {
  it("delivers events to subscribed handlers", () => {
    const bus = new GitEventBus();
    const handler = vi.fn();
    bus.subscribe(handler);
    bus.publish("checkpoint.created", { name: "v1" });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("unsubscribe stops events", () => {
    const bus = new GitEventBus();
    const handler = vi.fn();
    const unsub = bus.subscribe(handler);
    unsub();
    bus.publish("commit.created", { hash: "abc" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("survives handler exceptions", () => {
    const bus = new GitEventBus();
    const good = vi.fn();
    bus.subscribe(() => { throw new Error("oops"); });
    bus.subscribe(good);
    bus.publish("branch.created", { name: "fix" });
    expect(good).toHaveBeenCalled();
  });

  it("clear removes all handlers", () => {
    const bus = new GitEventBus();
    bus.subscribe(vi.fn());
    bus.subscribe(vi.fn());
    expect(bus.size).toBe(2);
    bus.clear();
    expect(bus.size).toBe(0);
  });

  it("event has correct type and timestamp", () => {
    const bus = new GitEventBus();
    const events: any[] = [];
    bus.subscribe((e) => events.push(e));
    bus.publish("checkpoint.created", { id: "cp1" });
    expect(events[0].type).toBe("checkpoint.created");
    expect(events[0].payload.id).toBe("cp1");
    expect(events[0].timestamp).toBeTruthy();
  });
});
