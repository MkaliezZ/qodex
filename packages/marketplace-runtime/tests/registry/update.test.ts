import { describe, it, expect } from "vitest";
import { RegistryRuntime } from "../../src/registry/registry.js";
import type { RegistryEntry } from "../../src/registry/events.js";

const en = (id: string, version = "1.0.0"): RegistryEntry => ({
  id, name: id, description: id, packageType: "skill", latestVersion: version,
  versions: [{ version, manifestUrl: `https://example.com/${id}/skill.json`, packageUrl: `https://example.com/${id}/pkg.zip`, checksum: "a".repeat(64), compatibility: { qodexVersion: ">=0.1.0" }, publishedAt: "2026-01-01" }],
  publisher: { id: "p", name: "Pub", type: "individual" },
  trust: { level: "community" }, compatibility: { qodexVersion: ">=0.1.0" },
  tags: [], createdAt: "", updatedAt: "",
});

describe("update detection", () => {
  it("detects update available", () => {
    const rt = new RegistryRuntime();
    rt.clearCache();
    // Manually insert entry with newer version
    (rt as any).cache.setEntry("a", en("a", "2.0.0"));
    const updates = rt.checkUpdates([{ id: "a", version: "1.0.0" }]);
    expect(updates.length).toBe(1);
    expect(updates[0].availableVersion).toBe("2.0.0");
  });

  it("no update when version match", () => {
    const rt = new RegistryRuntime();
    rt.clearCache();
    (rt as any).cache.setEntry("a", en("a", "1.0.0"));
    expect(rt.checkUpdates([{ id: "a", version: "1.0.0" }]).length).toBe(0);
  });

  it("skips blocked entries", () => {
    const rt = new RegistryRuntime();
    rt.clearCache();
    const blocked = en("b", "2.0.0");
    blocked.trust = { level: "blocked" };
    (rt as any).cache.setEntry("b", blocked);
    expect(rt.checkUpdates([{ id: "b", version: "1.0.0" }]).length).toBe(0);
  });
});
