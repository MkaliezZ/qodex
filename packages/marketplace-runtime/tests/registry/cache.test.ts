import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { LocalRegistryCache } from "../../src/registry/cache.js";

describe("LocalRegistryCache", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync("/tmp/qodex-registry-test-"); });
  afterEach(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* */ } });

  it("saves and loads cache", () => {
    const c = new LocalRegistryCache(join(dir, "reg"));
    c.setEntry("test", { id: "test", name: "T", description: "D", packageType: "skill", latestVersion: "1.0.0", versions: [], publisher: { id: "p", name: "P", type: "individual" }, trust: { level: "community" }, compatibility: { qodexVersion: ">=0.1.0" }, tags: [], createdAt: "", updatedAt: "" });
    c.save();

    const c2 = new LocalRegistryCache(join(dir, "reg"));
    c2.load();
    expect(c2.getEntry("test")?.name).toBe("T");
  });

  it("corrupt cache resets", () => {
    const d = join(dir, "reg");
    const c = new LocalRegistryCache(d);
    c.save();
    // Write corrupt data
    const { writeFileSync } = require("fs");
    writeFileSync(join(d, "cache.json"), "{invalid json");
    const c2 = new LocalRegistryCache(d);
    c2.load();
    expect(Object.keys(c2.getEntries()).length).toBe(0);
  });

  it("exports and imports cache", () => {
    const c = new LocalRegistryCache(join(dir, "reg"));
    c.setEntry("x", { id: "x", name: "X", description: "X", packageType: "skill", latestVersion: "1.0.0", versions: [], publisher: { id: "p", name: "P", type: "individual" }, trust: { level: "community" }, compatibility: { qodexVersion: ">=0.1.0" }, tags: [], createdAt: "", updatedAt: "" });
    const exported = c.exportCache();
    const c2 = new LocalRegistryCache(join(dir, "reg2"));
    c2.importCache(exported);
    expect(c2.getEntry("x")?.name).toBe("X");
  });

  it("clear removes all entries", () => {
    const c = new LocalRegistryCache(join(dir, "reg"));
    c.setEntry("x", { id: "x", name: "X", description: "X", packageType: "skill", latestVersion: "1.0.0", versions: [], publisher: { id: "p", name: "P", type: "individual" }, trust: { level: "community" }, compatibility: { qodexVersion: ">=0.1.0" }, tags: [], createdAt: "", updatedAt: "" });
    c.clear();
    expect(Object.keys(c.getEntries()).length).toBe(0);
  });

  it("sync state saves and loads", () => {
    const c = new LocalRegistryCache(join(dir, "reg"));
    c.saveSyncState("s1", { sourceId: "s1", lastSyncAt: 1000, entryCount: 5 });
    const state = c.loadSyncState("s1");
    expect(state?.entryCount).toBe(5);
  });
});
