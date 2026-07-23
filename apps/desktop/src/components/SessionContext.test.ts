import { describe, expect, it, vi } from "vitest";
import { InMemorySessionStore } from "@qodex/session-runtime";
import { createSingleFlightByKey, createStableResolver } from "./SessionContext";

describe("SessionContext store selection", () => {
  it("keeps one adapter across React StrictMode remounts", () => {
    const store = new InMemorySessionStore();
    const select = vi.fn(() => store);
    const resolve = createStableResolver(select);

    expect(resolve()).toBe(store);
    expect(resolve()).toBe(store);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("runs restart recovery once when StrictMode initializes concurrently", async () => {
    const runtime = {};
    const initialize = vi.fn(async () => "ready");
    const run = createSingleFlightByKey(initialize);

    await expect(Promise.all([run(runtime), run(runtime)])).resolves.toEqual(["ready", "ready"]);
    expect(initialize).toHaveBeenCalledTimes(1);
  });
});
