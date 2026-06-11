import { describe, it, expect } from "vitest";
import { DiffEngine } from "../src/engine.js";
import { DiffGenerator } from "../src/diff/generator.js";
import { PatchValidator } from "../src/validation/validator.js";
import { ApplyEngine } from "../src/apply/engine.js";
import { PatchParser } from "../src/parser/parser.js";

describe("Regression: No crash on edge inputs", () => {
  const engine = new DiffEngine();
  const gen = new DiffGenerator();
  const val = new PatchValidator();
  const app = new ApplyEngine();
  const parser = new PatchParser();

  it("null-like content", () => {
    expect(() => gen.generateDiff({ path: "f.ts", oldContent: "undefined", newContent: "null" })).not.toThrow();
  });

  it("single character files", () => {
    const r = gen.generateDiff({ path: "f.ts", oldContent: "a", newContent: "b" });
    expect(r.additions + r.deletions).toBeGreaterThan(0);
  });

  it("whitespace-only files", () => {
    const r = gen.generateDiff({ path: "f.ts", oldContent: "   \n  \n", newContent: "  \n\t\n" });
    expect(r.additions).toBeGreaterThanOrEqual(0);
  });

  it("proposal with zero files", () => {
    const p = engine.createProposal("t1", "empty", []);
    expect(p.files).toHaveLength(0);
  });

  it("validate empty proposal", async () => {
    const p = engine.createProposal("t1", "empty", []);
    const c = await engine.validateProposal(p);
    expect(c).toHaveLength(0);
  });

  it("parse empty diff", () => {
    // Should not crash
    const p = parser.parse("", "t1", "empty");
    expect(p.files).toHaveLength(0);
  });

  it("serialize empty proposal", () => {
    const p = engine.createProposal("t1", "empty", []);
    const text = engine.serializeProposal(p);
    expect(text).toBeTruthy();
  });

  it("reject null proposal", () => {
    // Should not throw
    const p = engine.createProposal("t1", "r", [{ path: "f.ts", oldContent: "a", newContent: "b" }]);
    engine.reject(p);
  });
});
