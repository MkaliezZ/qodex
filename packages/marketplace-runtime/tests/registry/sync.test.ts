import { describe, it, expect, beforeEach } from "vitest";
import { SyncEngine } from "../../src/registry/sync.js";
import { LocalRegistryCache } from "../../src/registry/cache.js";
import type { RegistryEntry } from "../../src/registry/events.js";

function mockFetch(entries: unknown[]) {
  return async () => ({ ok: true, status: 200, json: async () => ({ entries }) });
}
function mockFetchFail(status = 500) {
  return async () => ({ ok: false, status, json: async () => ({}) });
}

const en: RegistryEntry = {
  id: "test-skill", name: "Test Skill", description: "A test", packageType: "skill", latestVersion: "1.0.0",
  versions: [{ version: "1.0.0", manifestUrl: "https://example.com/skill.json", packageUrl: "https://example.com/pkg.zip", checksum: "a".repeat(64), compatibility: { qodexVersion: ">=0.1.0" }, publishedAt: "2026-01-01" }],
  publisher: { id: "p", name: "Pub", type: "individual" },
  trust: { level: "community" }, compatibility: { qodexVersion: ">=0.1.0" },
  tags: [], createdAt: "", updatedAt: "",
};

describe("SyncEngine", () => {
  let cache: LocalRegistryCache;
  let engine: SyncEngine;

  beforeEach(() => {
    cache = new LocalRegistryCache("/tmp/qodex-sync-test");
    cache.clear();
    engine = new SyncEngine(cache, mockFetch([en]));
  });

  it("sync adds entries to cache", async () => {
    const r = await engine.sync({ id: "s1", name: "Source 1", url: "https://example.com/index.json", enabled: true, priority: 0 });
    expect(r.newEntries).toBe(1);
    expect(cache.getEntry("test-skill")).toBeDefined();
  });

  it("sync fails on HTTP error", async () => {
    const badEngine = new SyncEngine(cache, mockFetchFail(500));
    const r = await badEngine.sync({ id: "s1", name: "S", url: "https://example.com", enabled: true, priority: 0 });
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.newEntries).toBe(0);
  });

  it("emits sync events", async () => {
    const events: string[] = [];
    engine.onEvent((e) => events.push(e.type));
    await engine.sync({ id: "s1", name: "S", url: "https://example.com/index.json", enabled: true, priority: 0 });
    expect(events).toContain("registry.sync.started");
    expect(events).toContain("registry.sync.completed");
  });

  it("emits failed event on error", async () => {
    const events: string[] = [];
    const badEngine = new SyncEngine(cache, mockFetchFail(500));
    badEngine.onEvent((e) => events.push(e.type));
    await badEngine.sync({ id: "s1", name: "S", url: "https://example.com", enabled: true, priority: 0 });
    expect(events).toContain("registry.sync.failed");
  });
});
