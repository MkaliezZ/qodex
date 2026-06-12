import { describe, it, expect } from "vitest";
import { MemoryRegistryCache } from "../../src/registry/cache.js";

const en = () => ({ id: "x", name: "X", description: "X", packageType: "skill" as const, latestVersion: "1.0.0", versions: [], publisher: { id: "p", name: "P", type: "individual" as const }, trust: { level: "community" as const }, compatibility: { qodexVersion: ">=0.1.0" }, tags: [], createdAt: "", updatedAt: "" });

describe("MemoryRegistryCache", () => {
  it("stores and retrieves entries in memory", () => {
    const c = new MemoryRegistryCache();
    c.setEntry("test", en());
    expect(c.getEntry("test")?.name).toBe("X");
  });

  it("removes entries", () => {
    const c = new MemoryRegistryCache();
    c.setEntry("test", en());
    c.removeEntry("test");
    expect(c.getEntry("test")).toBeUndefined();
  });

  it("exports and imports cache", () => {
    const c = new MemoryRegistryCache();
    c.setEntry("x", en());
    const exported = c.exportCache();
    const c2 = new MemoryRegistryCache();
    c2.importCache(exported);
    expect(c2.getEntry("x")?.name).toBe("X");
  });

  it("rejects invalid import", () => {
    const c = new MemoryRegistryCache();
    expect(() => c.importCache({ invalid: true })).toThrow();
  });

  it("clear removes all entries", () => {
    const c = new MemoryRegistryCache();
    c.setEntry("x", en());
    c.clear();
    expect(Object.keys(c.getEntries()).length).toBe(0);
  });

  it("sync state saves and loads in memory", () => {
    const c = new MemoryRegistryCache();
    c.saveSyncState("s1", { sourceId: "s1", lastSyncAt: 1000, entryCount: 5 });
    expect(c.loadSyncState("s1")?.entryCount).toBe(5);
  });
});
