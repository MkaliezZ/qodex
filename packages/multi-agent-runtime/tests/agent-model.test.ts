import { describe, it, expect } from "vitest";
import { SpecialistFactory } from "../src/index.js";

describe("Agent Model", () => {
  const f = new SpecialistFactory();

  it("agent has valid id (uuid-like)", () => {
    const a = f.create("review", "R");
    expect(a.id.length).toBeGreaterThan(10);
  });

  it("agent status defaults to idle", () => {
    const a = f.create("review", "R");
    expect(a.status).toBe("idle");
  });

  it("agent createdAt is ISO string", () => {
    const a = f.create("review", "R");
    expect(() => new Date(a.createdAt)).not.toThrow();
  });
});
