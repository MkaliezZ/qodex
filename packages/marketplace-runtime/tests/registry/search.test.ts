import { describe, it, expect } from "vitest";
import { SearchIndex } from "../../src/registry/search.js";
import type { RegistryEntry } from "../../src/registry/events.js";

const en = (id: string, name: string, desc: string, tags: string[] = []): RegistryEntry => ({
  id, name, description: desc, packageType: "skill", latestVersion: "1.0.0", versions: [],
  publisher: { id: "p", name: "Pub", type: "individual" },
  trust: { level: "community" }, compatibility: { qodexVersion: ">=0.1.0" },
  tags, createdAt: "", updatedAt: "",
});

describe("SearchIndex", () => {
  const entries = [en("a", "React Review", "React code review tool", ["react"]), en("b", "TypeScript Linter", "Lint TS code", ["typescript"])];
  const idx = new SearchIndex(() => entries);

  it("matches by id", () => { expect(idx.search("react").length).toBeGreaterThanOrEqual(1); });
  it("matches by tag", () => { expect(idx.search("typescript").length).toBeGreaterThanOrEqual(1); });
  it("matches multi-word", () => { expect(idx.search("react code").length).toBeGreaterThanOrEqual(1); });
  it("returns empty for no match", () => { expect(idx.search("zzzz-nonexistent").length).toBe(0); });
});
