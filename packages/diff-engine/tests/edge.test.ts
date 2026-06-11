import { describe, it, expect } from "vitest";
import { DiffGenerator } from "../src/diff/generator.js";
import { DiffEngine } from "../src/engine.js";

describe("Edge Cases", () => {
  const gen = new DiffGenerator();

  it("handles unix newlines", () => {
    const r = gen.generateDiff({ path: "f.ts", oldContent: "a\nb\n", newContent: "a\nc\n" });
    expect(r.additions).toBeGreaterThan(0);
  });

  it("handlines windows newlines", () => {
    const r = gen.generateDiff({ path: "f.ts", oldContent: "a\r\nb\r\n", newContent: "a\r\nc\r\n" });
    expect(r.additions).toBeGreaterThan(0);
  });

  it("handles no trailing newline", () => {
    const r = gen.generateDiff({ path: "f.ts", oldContent: "a", newContent: "a\nb" });
    expect(r.additions).toBeGreaterThan(0);
  });

  it("handles special characters in content", () => {
    const r = gen.generateDiff({
      path: "f.ts",
      oldContent: "const str = 'hello';\n",
      newContent: "const str = 'héllo wörld';\n",
    });
    expect(r.additions).toBeGreaterThan(0);
  });

  it("handles tabs and spaces changes", () => {
    const r = gen.generateDiff({
      path: "f.ts",
      oldContent: "  indented\n    deeply\n",
      newContent: "\tindented\n\tdeeply\n",
    });
    expect(r.additions).toBeGreaterThan(0);
  });

  it("produces deterministic output", () => {
    const r1 = gen.generateDiff({ path: "f.ts", oldContent: "a\n", newContent: "b\n" });
    const r2 = gen.generateDiff({ path: "f.ts", oldContent: "a\n", newContent: "b\n" });
    expect(r1.additions).toBe(r2.additions);
    expect(r1.deletions).toBe(r2.deletions);
  });

  it("engine handles full lifecycle: create → validate → preview → apply → rollback", async () => {
    const engine = new DiffEngine();
    const proposal = engine.createProposal("t1", "lifecycle", [
      { path: "f.ts", oldContent: "before", newContent: "after" },
    ]);
    expect(proposal.id).toBeTruthy();

    const conflicts = await engine.validateProposal(proposal);
    expect(conflicts).toHaveLength(0);

    const preview = await engine.preview(proposal);
    expect(preview).toContain("lifecycle");

    const inMemory = engine.applyInMemory(proposal);
    expect(inMemory.get("f.ts")).toBe("after");

    engine.reject(proposal);
  });
});
