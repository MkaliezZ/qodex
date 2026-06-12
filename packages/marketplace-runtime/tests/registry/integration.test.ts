import { describe, it, expect } from "vitest";
import { RegistryRuntime } from "../../src/registry/registry.js";
import type { RegistryEntry } from "../../src/registry/events.js";

const en = (id: string, version: string): RegistryEntry => ({
  id, name: id, description: id, packageType: "skill", latestVersion: version,
  versions: [{ version, manifestUrl: `https://example.com/${id}/skill.json`, packageUrl: `https://example.com/${id}/pkg.zip`, checksum: "a".repeat(64), compatibility: { qodexVersion: ">=0.1.0" }, publishedAt: "2026-01-01" }],
  publisher: { id: "p", name: "Pub", type: "individual" },
  trust: { level: "community" }, compatibility: { qodexVersion: ">=0.1.0" },
  tags: [], createdAt: "", updatedAt: "",
});

describe("RegistryRuntime integration", () => {
  it("full cycle: source → mock sync → search → update detect", async () => {
    const rt = new RegistryRuntime("/tmp/qodex-int-test");
    rt.clearCache();

    // Add source
    rt.addSource({ id: "s1", name: "Test Registry", url: "https://example.com/index.json", enabled: true, priority: 0 });

    // Use injected entries (simulate cache pre-population for test)
    (rt as any).cache.setEntry("skill-a", en("skill-a", "1.5.0"));
    (rt as any).cache.setEntry("skill-b", en("skill-b", "2.0.0"));
    const blocked = en("skill-c", "1.0.0");
    blocked.trust = { level: "blocked" };
    (rt as any).cache.setEntry("skill-c", blocked);

    // Search
    const results = rt.search("skill-a");
    expect(results.length).toBeGreaterThanOrEqual(1);

    // Get entry
    expect(rt.getEntry("skill-a")?.latestVersion).toBe("1.5.0");

    // Update detection
    const updates = rt.checkUpdates([{ id: "skill-a", version: "1.0.0" }, { id: "skill-b", version: "2.0.0" }, { id: "skill-c", version: "1.0.0" }]);
    expect(updates.length).toBe(1); // skill-a needs update, skill-b up to date, skill-c blocked
    expect(updates[0].id).toBe("skill-a");

    // Trust
    expect(rt.isBlocked("skill-c")).toBe(true);
    expect(rt.isBlocked("skill-a")).toBe(false);

    // Cache export/import
    const exported = rt.exportCache();
    const rt2 = new RegistryRuntime("/tmp/qodex-int-test2");
    rt2.clearCache();
    rt2.importCache(exported);
    expect(rt2.getEntry("skill-a")?.name).toBe("skill-a");
  });
});
