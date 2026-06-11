import { describe, it, expect } from "vitest";
import { MemoryLoader } from "../src/memory/loader.js";

describe("MemoryLoader", () => {
  it("loads default memory", async () => {
    const loader = new MemoryLoader();
    const memory = await loader.load();
    expect(memory.length).toBeGreaterThan(0);
    expect(memory).toContain("Project Summary");
  });

  it("caches after load", async () => {
    const loader = new MemoryLoader();
    expect(loader.isCached).toBe(false);
    await loader.load();
    expect(loader.isCached).toBe(true);
  });

  it("reloads from custom provider", async () => {
    let version = 0;
    const loader = new MemoryLoader({
      getMemory: () => `Memory v${++version}`,
    });

    expect(await loader.load()).toBe("Memory v1");
    await loader.reload();
    expect(await loader.load()).toBe("Memory v2");
  });

  it("clearCache works", async () => {
    const loader = new MemoryLoader({
      getMemory: () => "test",
    });
    await loader.load();
    loader.clearCache();
    expect(loader.isCached).toBe(false);
  });

  it("handles empty memory", async () => {
    const loader = new MemoryLoader({ getMemory: () => "" });
    expect(await loader.load()).toBe("");
  });
});
