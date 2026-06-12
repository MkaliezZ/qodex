import { describe, it, expect } from "vitest";
import { parseVersion, compareVersions, isUpdateAvailable, satisfiesCompatibility } from "../src/versioning/versioning.js";

describe("parseVersion", () => {
  it("parses simple SemVer", () => { const v = parseVersion("1.2.3"); expect(v?.major).toBe(1); expect(v?.minor).toBe(2); expect(v?.patch).toBe(3); });
  it("parses prerelease", () => { expect(parseVersion("1.0.0-alpha")?.prerelease).toBe("alpha"); });
  it("rejects invalid", () => { expect(parseVersion("v1")).toBeNull(); expect(parseVersion("abc")).toBeNull(); });
});

describe("compareVersions", () => {
  it("returns 0 for equal", () => { expect(compareVersions("1.0.0", "1.0.0")).toBe(0); });
  it("returns positive when a > b", () => { expect(compareVersions("2.0.0", "1.0.0")).toBeGreaterThan(0); });
  it("returns negative when a < b", () => { expect(compareVersions("1.0.0", "2.0.0")).toBeLessThan(0); });
  it("compares minor", () => { expect(compareVersions("1.2.0", "1.1.0")).toBeGreaterThan(0); });
  it("compares patch", () => { expect(compareVersions("1.0.1", "1.0.0")).toBeGreaterThan(0); });
  it("prerelease < release", () => { expect(compareVersions("1.0.0-alpha", "1.0.0")).toBeLessThan(0); });
});

describe("isUpdateAvailable", () => {
  it("true when available > installed", () => { expect(isUpdateAvailable("1.0.0", "1.1.0")).toBe(true); });
  it("false when same", () => { expect(isUpdateAvailable("1.0.0", "1.0.0")).toBe(false); });
  it("false when downgrade", () => { expect(isUpdateAvailable("2.0.0", "1.0.0")).toBe(false); });
});

describe("satisfiesCompatibility", () => {
  it("satisfies >= range", () => { expect(satisfiesCompatibility("1.0.0", ">=0.1.0")).toBe(true); });
  it("rejects when version too low", () => { expect(satisfiesCompatibility("0.0.9", ">=0.1.0")).toBe(false); });
});
