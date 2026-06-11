import { describe, it, expect } from "vitest";
import { RulesLoader } from "../src/rules/loader.js";
import { MemoryLoader } from "../src/memory/loader.js";

describe("RulesLoader - Edge Cases", () => {
  it("handles async provider", async () => {
    const loader = new RulesLoader({
      getRules: async () => "async rules",
    });
    expect(await loader.load()).toBe("async rules");
  });

  it("reload after clearCache returns fresh", async () => {
    let i = 0;
    const loader = new RulesLoader({
      getRules: () => `v${++i}`,
    });

    expect(await loader.load()).toBe("v1");
    loader.clearCache();
    expect(await loader.load()).toBe("v2");
    loader.clearCache();
    expect(await loader.load()).toBe("v3");
  });

  it("handles provider returning long text", async () => {
    const text = "rule\n".repeat(500);
    const loader = new RulesLoader({ getRules: () => text });
    const result = await loader.load();
    expect(result.length).toBeGreaterThan(1000);
  });
});

describe("MemoryLoader - Edge Cases", () => {
  it("handles async provider", async () => {
    const loader = new MemoryLoader({
      getMemory: async () => "async memory",
    });
    expect(await loader.load()).toBe("async memory");
  });

  it("multiple loads return cached value", async () => {
    let callCount = 0;
    const loader = new MemoryLoader({
      getMemory: () => `call ${++callCount}`,
    });

    const first = await loader.load();
    const second = await loader.load();
    const third = await loader.load();

    expect(first).toBe("call 1");
    expect(second).toBe("call 1"); // cached
    expect(third).toBe("call 1"); // cached
  });

  it("handles very long memory", async () => {
    const text = "memory line\n".repeat(300);
    const loader = new MemoryLoader({ getMemory: () => text });
    expect((await loader.load()).length).toBeGreaterThan(1000);
  });
});
