import { describe, it, expect } from "vitest";
import { validateEntry } from "../../src/registry/entry.js";

const VALID: Record<string, unknown> = {
  id: "react-review", name: "React Review", description: "Review React code",
  packageType: "skill", latestVersion: "1.0.0",
  versions: [{ version: "1.0.0", manifestUrl: "https://example.com/skill.json", packageUrl: "https://example.com/pkg.zip", checksum: "a".repeat(64), compatibility: { qodexVersion: ">=0.1.0" }, publishedAt: "2026-01-01" }],
  publisher: { id: "pub", name: "Publisher", type: "individual" },
  trust: { level: "community" as const },
  compatibility: { qodexVersion: ">=0.1.0" },
  tags: ["react"],
  createdAt: "2026-01-01", updatedAt: "2026-01-01",
};

describe("validateEntry", () => {
  it("accepts valid entry", () => { expect(validateEntry(VALID).valid).toBe(true); });
  it("rejects missing id", () => { expect(validateEntry({ ...VALID, id: undefined }).valid).toBe(false); });
  it("rejects packageType other than skill", () => { expect(validateEntry({ ...VALID, packageType: "mcp" }).valid).toBe(false); });
  it("rejects missing latestVersion", () => { expect(validateEntry({ ...VALID, latestVersion: undefined }).valid).toBe(false); });
  it("rejects missing versions", () => { expect(validateEntry({ ...VALID, versions: [] }).valid).toBe(false); });
  it("rejects http manifestUrl", () => {
    const v = { ...VALID, versions: [{ version: "1.0.0", manifestUrl: "http://bad.com/skill.json", packageUrl: "https://example.com/pkg.zip", checksum: "a".repeat(64), compatibility: { qodexVersion: ">=0.1.0" }, publishedAt: "2026-01-01" }] };
    expect(validateEntry(v).valid).toBe(false);
  });
  it("rejects missing checksum", () => {
    const v = { ...VALID, versions: [{ version: "1.0.0", manifestUrl: "https://example.com/skill.json", packageUrl: "https://example.com/pkg.zip", checksum: "", compatibility: { qodexVersion: ">=0.1.0" }, publishedAt: "2026-01-01" }] };
    expect(validateEntry(v).valid).toBe(false);
  });
  it("rejects XSS in id", () => { expect(validateEntry({ ...VALID, id: "<script>alert(1)</script>" }).valid).toBe(false); });
  it("rejects XSS in name", () => { expect(validateEntry({ ...VALID, name: "<script>alert(1)</script>" }).valid).toBe(false); });
});
