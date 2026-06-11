import { describe, it, expect } from "vitest";
import { SpecialistFactory, MOCK_OUTPUTS } from "../src/index.js";

describe("SpecialistFactory", () => {
  const f = new SpecialistFactory();

  it("creates agent with correct role", () => {
    const a = f.create("review", "Code Reviewer");
    expect(a.role).toBe("review");
    expect(a.name).toBe("Code Reviewer");
    expect(a.status).toBe("idle");
  });

  it("creates all 4 default agents", () => {
    const agents = f.createDefaultSet();
    expect(agents).toHaveLength(4);
    expect(agents.map((a) => a.role)).toContain("review");
    expect(agents.map((a) => a.role)).toContain("refactor");
    expect(agents.map((a) => a.role)).toContain("research");
    expect(agents.map((a) => a.role)).toContain("testing");
  });

  it("agents have unique IDs", () => {
    const agents = f.createDefaultSet();
    const ids = agents.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("agents have createdAt timestamp", () => {
    const a = f.create("review", "R");
    expect(a.createdAt).toBeTruthy();
  });
});

describe("MOCK_OUTPUTS", () => {
  it("review returns review output", () => {
    const out = MOCK_OUTPUTS.review("Test review");
    expect(out).toContain("[Review Complete]");
  });
  it("refactor returns refactor output", () => {
    const out = MOCK_OUTPUTS.refactor("Test refactor");
    expect(out).toContain("[Refactor Complete]");
  });
  it("research returns research output", () => {
    const out = MOCK_OUTPUTS.research("Test research");
    expect(out).toContain("[Research Complete]");
  });
  it("testing returns testing output", () => {
    const out = MOCK_OUTPUTS.testing("Test testing");
    expect(out).toContain("[Testing Complete]");
  });
  it("all outputs include description", () => {
    for (const [role, fn] of Object.entries(MOCK_OUTPUTS)) {
      expect(fn("hello")).toContain("hello");
    }
  });
});
