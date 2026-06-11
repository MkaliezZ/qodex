import { describe, it, expect } from "vitest";
import { RulesLoader } from "../src/rules/loader.js";

describe("RulesLoader", () => {
  it("loads default rules", async () => {
    const loader = new RulesLoader();
    const rules = await loader.load();
    expect(rules.length).toBeGreaterThan(0);
    expect(rules).toContain("Non-Negotiable Rules");
    expect(rules).toContain("Architecture Rules");
  });

  it("caches after first load", async () => {
    const loader = new RulesLoader();
    expect(loader.isCached).toBe(false);
    await loader.load();
    expect(loader.isCached).toBe(true);
  });

  it("reloads from provider", async () => {
    let callCount = 0;
    const loader = new RulesLoader({
      getRules: () => `Custom rules ${++callCount}`,
    });

    const first = await loader.load();
    expect(first).toBe("Custom rules 1");

    await loader.reload();
    const second = await loader.load();
    expect(second).toBe("Custom rules 2");
  });

  it("clearCache forces reload", async () => {
    let callCount = 0;
    const loader = new RulesLoader({
      getRules: () => `v${++callCount}`,
    });

    await loader.load();
    expect(await loader.load()).toBe("v1"); // cached

    loader.clearCache();
    expect(await loader.load()).toBe("v2");
  });

  it("handles empty rules", async () => {
    const loader = new RulesLoader({ getRules: () => "" });
    const rules = await loader.load();
    expect(rules).toBe("");
  });
});
