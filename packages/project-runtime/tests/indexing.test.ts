import { describe, it, expect } from "vitest";
import { MockFileSystemAdapter } from "../src/fs/mock.js";
import { ProjectIndexer } from "../src/indexing/index.js";

describe("ProjectIndexer", () => {
  it("builds an index with entry count", async () => {
    const adapter = new MockFileSystemAdapter([
      { path: "src", name: "src", content: "", isDir: true },
      { path: "src/a.ts", name: "a.ts", content: "x", isDir: false },
      { path: "src/b.ts", name: "b.ts", content: "y", isDir: false },
      { path: "pkg.json", name: "pkg.json", content: "{}", isDir: false },
    ]);

    const indexer = new ProjectIndexer(adapter);
    const index = await indexer.buildIndex("/test");

    expect(index.files).toHaveLength(3);
    expect(index.rootPath).toBe("/test");
  });

  it("excludes ignored paths from index", async () => {
    const adapter = new MockFileSystemAdapter([
      { path: "src", name: "src", content: "", isDir: true },
      { path: "src/app.ts", name: "app.ts", content: "app", isDir: false },
      { path: "node_modules", name: "node_modules", content: "", isDir: true },
      { path: "node_modules/pkg.js", name: "pkg.js", content: "x", isDir: false },
      { path: ".git", name: ".git", content: "", isDir: true },
      { path: ".git/config", name: "config", content: "", isDir: false },
    ]);

    const indexer = new ProjectIndexer(adapter);
    const index = await indexer.buildIndex("/test");

    const paths = index.files.map((f) => f.path);
    expect(paths).toContain("src/app.ts");
    expect(paths).not.toContain("node_modules/pkg.js");
    expect(paths).not.toContain(".git/config");
  });

  it("detects file languages", async () => {
    const adapter = new MockFileSystemAdapter([
      { path: "index.ts", name: "index.ts", content: "", isDir: false },
      { path: "style.css", name: "style.css", content: "", isDir: false },
      { path: "readme.md", name: "readme.md", content: "", isDir: false },
    ]);

    const indexer = new ProjectIndexer(adapter);
    const index = await indexer.buildIndex("/test");

    const ts = index.files.find((f) => f.path === "index.ts");
    expect(ts?.language).toBe("typescript");

    const css = index.files.find((f) => f.path === "style.css");
    expect(css?.language).toBe("css");
  });
});
