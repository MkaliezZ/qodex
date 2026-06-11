import { describe, it, expect } from "vitest";
import { DiffEngine } from "../src/engine.js";

describe("DiffEngine", () => {
  it("creates a proposal", () => {
    const engine = new DiffEngine();
    const proposal = engine.createProposal("t1", "Fix typo", [
      { path: "test.ts", oldContent: "old", newContent: "new" },
    ]);
    expect(proposal.id).toBeTruthy();
    expect(proposal.files).toHaveLength(1);
  });

  it("generates unified diff", () => {
    const engine = new DiffEngine();
    const diff = engine.generateUnifiedDiff({
      path: "test.ts", oldContent: "const x = 1;\n", newContent: "const x = 2;\n",
    });
    expect(diff).toContain("-const x = 1;");
    expect(diff).toContain("+const x = 2;");
  });

  it("validates proposal", async () => {
    const engine = new DiffEngine();
    const proposal = engine.createProposal("t1", "test", [
      { path: "f.ts", oldContent: "old", newContent: "new" },
    ]);
    const conflicts = await engine.validateProposal(proposal);
    expect(conflicts).toHaveLength(0);
  });

  it("previews proposal", async () => {
    const engine = new DiffEngine();
    const proposal = engine.createProposal("t1", "preview test", [
      { path: "f.ts", oldContent: "a\n", newContent: "b\n" },
    ]);
    const preview = await engine.preview(proposal);
    expect(preview).toContain("preview test");
    expect(preview).toContain("f.ts");
  });

  it("applies in memory", () => {
    const engine = new DiffEngine();
    const proposal = engine.createProposal("t1", "mem apply", [
      { path: "f.ts", oldContent: "old", newContent: "new" },
    ]);
    const result = engine.applyInMemory(proposal);
    expect(result.get("f.ts")).toBe("new");
  });

  it("reject does not throw", () => {
    const engine = new DiffEngine();
    const proposal = engine.createProposal("t1", "reject", [
      { path: "f.ts", oldContent: "a", newContent: "b" },
    ]);
    engine.reject(proposal);
  });

  it("parses and serializes roundtrip", () => {
    const engine = new DiffEngine();
    const original = engine.createProposal("t1", "rt", [
      { path: "f.ts", oldContent: "old\n", newContent: "new\n" },
    ]);
    const text = engine.serializeProposal(original);
    const parsed = engine.parsePatch(text, "t1");
    expect(parsed.files[0].path).toBe("f.ts");
  });

  it("generates multi diff", () => {
    const engine = new DiffEngine();
    const results = engine.generateMultiDiff([
      { path: "a.ts", oldContent: "a\n", newContent: "b\n" },
      { path: "b.ts", oldContent: "x\n", newContent: "y\n" },
    ]);
    expect(results).toHaveLength(2);
  });
});
