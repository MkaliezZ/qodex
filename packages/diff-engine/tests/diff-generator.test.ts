import { describe, it, expect } from "vitest";
import { DiffGenerator } from "../src/diff/generator.js";

describe("DiffGenerator", () => {
  const gen = new DiffGenerator();

  it("detects added lines", () => {
    const result = gen.generateDiff({
      path: "test.ts",
      oldContent: "a\nb\n",
      newContent: "a\nb\nc\n",
    });
    expect(result.path).toBe("test.ts");
    expect(result.additions).toBeGreaterThan(0);
    expect(result.deletions).toBe(0);
  });

  it("detects removed lines", () => {
    const result = gen.generateDiff({
      path: "test.ts",
      oldContent: "a\nb\nc\n",
      newContent: "a\nc\n",
    });
    expect(result.deletions).toBeGreaterThan(0);
  });

  it("detects modified lines", () => {
    const result = gen.generateDiff({
      path: "test.ts",
      oldContent: "const x = 1;\n",
      newContent: "const x = 2;\n",
    });
    expect(result.additions).toBeGreaterThan(0);
    expect(result.deletions).toBeGreaterThan(0);
  });

  it("returns empty diff for identical content", () => {
    const result = gen.generateDiff({
      path: "same.ts",
      oldContent: "hello\n",
      newContent: "hello\n",
    });
    expect(result.additions).toBe(0);
    expect(result.deletions).toBe(0);
    expect(result.hunks).toHaveLength(0);
  });

  it("handles empty files", () => {
    const result = gen.generateDiff({
      path: "empty.ts",
      oldContent: "",
      newContent: "",
    });
    expect(result.additions).toBe(0);
    expect(result.deletions).toBe(0);
  });

  it("generates unified diff string", () => {
    const diff = gen.generateUnifiedDiff({
      path: "test.ts",
      oldContent: "const x = 1;\n",
      newContent: "const x = 2;\n",
    });
    expect(diff).toContain("--- a/test.ts");
    expect(diff).toContain("+++ b/test.ts");
    expect(diff).toContain("@@");
    expect(diff).toContain("-const x = 1;");
    expect(diff).toContain("+const x = 2;");
  });

  it("generates multi-file diffs", () => {
    const results = gen.generateMultiDiff([
      { path: "a.ts", oldContent: "a\n", newContent: "a\nb\n" },
      { path: "b.ts", oldContent: "x\n", newContent: "y\n" },
    ]);
    expect(results).toHaveLength(2);
  });

  it("handles completely different content", () => {
    const result = gen.generateDiff({
      path: "full.ts",
      oldContent: "old content\n",
      newContent: "brand new content\n",
    });
    expect(result.additions).toBeGreaterThan(0);
    expect(result.deletions).toBeGreaterThan(0);
  });
});
