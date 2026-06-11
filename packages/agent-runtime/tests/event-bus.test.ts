import { describe, it, expect, vi } from "vitest";
import { EventBus } from "../src/events/bus.js";

describe("EventBus", () => {
  it("starts with no subscribers", () => {
    const bus = new EventBus();
    expect(bus.size).toBe(0);
  });

  it("delivers events to subscribed handlers", () => {
    const bus = new EventBus();
    const handler = vi.fn();

    bus.subscribe("task.started", handler);
    bus.publish({
      type: "task.started",
      taskId: "t1",
      sessionId: "s1",
      timestamp: new Date().toISOString(),
      payload: { task: {} as any },
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not deliver to non-matching handlers", () => {
    const bus = new EventBus();
    const handler = vi.fn();

    bus.subscribe("task.completed", handler);
    bus.publish({
      type: "task.started",
      taskId: "t1",
      sessionId: "s1",
      timestamp: new Date().toISOString(),
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it("subscribeAll receives all events", () => {
    const bus = new EventBus();
    const handler = vi.fn();

    bus.subscribeAll(handler);
    bus.publish({
      type: "task.started",
      taskId: "t1",
      sessionId: "s1",
      timestamp: new Date().toISOString(),
    });
    bus.publish({
      type: "task.completed",
      taskId: "t1",
      sessionId: "s1",
      timestamp: new Date().toISOString(),
    });

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("unsubscribe removes a handler", () => {
    const bus = new EventBus();
    const handler = vi.fn();

    bus.subscribe("task.started", handler);
    bus.unsubscribe("task.started", handler);
    bus.publish({
      type: "task.started",
      taskId: "t1",
      sessionId: "s1",
      timestamp: new Date().toISOString(),
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it("returned unsubscribe function works", () => {
    const bus = new EventBus();
    const handler = vi.fn();

    const unsub = bus.subscribe("task.started", handler);
    unsub();
    bus.publish({
      type: "task.started",
      taskId: "t1",
      sessionId: "s1",
      timestamp: new Date().toISOString(),
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it("clear removes all subscribers", () => {
    const bus = new EventBus();
    bus.subscribe("task.started", vi.fn());
    bus.subscribe("task.completed", vi.fn());
    expect(bus.size).toBe(2);
    bus.clear();
    expect(bus.size).toBe(0);
  });

  it("survives handler exceptions", () => {
    const bus = new EventBus();
    const badHandler = vi.fn().mockImplementation(() => {
      throw new Error("oops");
    });
    const goodHandler = vi.fn();

    bus.subscribe("task.started", badHandler);
    bus.subscribe("task.started", goodHandler);
    bus.publish({
      type: "task.started",
      taskId: "t1",
      sessionId: "s1",
      timestamp: new Date().toISOString(),
    });

    expect(goodHandler).toHaveBeenCalledTimes(1);
  });
});
