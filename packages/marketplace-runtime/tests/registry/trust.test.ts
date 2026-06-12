import { describe, it, expect } from "vitest";
import { evaluateTrust, isBlocked, isValidTrustLevel } from "../../src/registry/trust.js";

describe("evaluateTrust", () => {
  it("local is allowed", () => { expect(evaluateTrust({ id: "x", trust: { level: "local" } }).allowed).toBe(true); });
  it("community is allowed", () => { expect(evaluateTrust({ id: "x", trust: { level: "community" } }).allowed).toBe(true); });
  it("verified is allowed", () => { expect(evaluateTrust({ id: "x", trust: { level: "verified" } }).allowed).toBe(true); });
  it("official is allowed", () => { expect(evaluateTrust({ id: "x", trust: { level: "official" } }).allowed).toBe(true); });
  it("blocked is rejected", () => { expect(evaluateTrust({ id: "x", trust: { level: "blocked" } }).allowed).toBe(false); });
  it("unverified publisher returns warning", () => {
    const r = evaluateTrust({ id: "x" });
    expect(r.allowed).toBe(true);
    expect(r.warning).toBe("Unverified publisher");
  });
});

describe("isBlocked", () => {
  it("true for blocked", () => { expect(isBlocked({ level: "blocked" })).toBe(true); });
  it("false for others", () => { expect(isBlocked({ level: "community" })).toBe(false); });
  it("false for undefined", () => { expect(isBlocked()).toBe(false); });
});

describe("isValidTrustLevel", () => {
  it("validates known levels", () => {
    expect(isValidTrustLevel("local")).toBe(true);
    expect(isValidTrustLevel("blocked")).toBe(true);
    expect(isValidTrustLevel("unknown")).toBe(false);
  });
});
