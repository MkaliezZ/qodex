import { describe, it, expect } from "vitest";
import { FileContextBuilder } from "../src/builders/files.js";

describe("FileContextBuilder", () => {
  it("builds context from files", () => {
    const builder = new FileContextBuilder();
    const result = builder.build([
      { path: "src/index.ts", content: "const x = 1;", language: "typescript" },
    ]);

    expect(result).toContain("=== FILE ===");
    expect(result).toContain("src/index.ts (typescript)");
    expect(result).toContain("const x = 1;");
  });

  it("handles empty file list", () => {
    const builder = new FileContextBuilder();
    expect(builder.build([])).toBe("");
  });

  it("skips binary files", () => {
    const builder = new FileContextBuilder();
    const result = builder.build([
      { path: "image.png", content: "Unsupported Binary File" },
    ]);
    expect(result).toBe("");
  });

  it("preserves multiple files in order", () => {
    const builder = new FileContextBuilder();
    const result = builder.build([
      { path: "a.ts", content: "// a", language: "typescript" },
      { path: "b.ts", content: "// b", language: "typescript" },
    ]);

    const aIndex = result.indexOf("a.ts");
    const bIndex = result.indexOf("b.ts");
    expect(aIndex).toBeLessThan(bIndex);
  });

  it("validFileCount excludes binaries", () => {
    const builder = new FileContextBuilder();
    const count = builder.validFileCount([
      { path: "a.ts", content: "code", language: "typescript" },
      { path: "b.png", content: "Unsupported Binary File" },
      { path: "c.ts", content: "more", language: "typescript" },
    ]);
    expect(count).toBe(2);
  });
});
