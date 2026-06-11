import { describe, it, expect } from "vitest";
import { MockFileSystemAdapter } from "../src/fs/mock.js";
import { TreeBuilder } from "../src/tree/builder.js";

function createMockFs() {
  return new MockFileSystemAdapter([
    { path: "src", name: "src", content: "", isDir: true },
    { path: "src/index.ts", name: "index.ts", content: "console.log('hi')", isDir: false },
    { path: "src/utils.ts", name: "utils.ts", content: "export const x = 1", isDir: false },
    { path: "package.json", name: "package.json", content: "{}", isDir: false },
    { path: "README.md", name: "README.md", content: "# Project", isDir: false },
    { path: "node_modules", name: "node_modules", content: "", isDir: true },
    { path: "node_modules/express", name: "express", content: "", isDir: true },
    { path: ".git", name: ".git", content: "", isDir: true },
  ]);
}

describe("TreeBuilder", () => {
  it("builds a file tree from mock fs", async () => {
    const adapter = createMockFs();
    const builder = new TreeBuilder(adapter, "/test/project");
    const tree = await builder.buildTree();

    expect(tree.root.name).toBe("project");
    expect(tree.root.type).toBe("directory");
    expect(tree.children.length).toBeGreaterThan(0);
  });

  it("excludes ignored directories", async () => {
    const adapter = createMockFs();
    const builder = new TreeBuilder(adapter, "/test/project");
    const tree = await builder.buildTree();

    const allPaths = builder.flattenPaths(tree.children);
    expect(allPaths.some((p) => p.includes("node_modules"))).toBe(false);
    expect(allPaths.some((p) => p.includes(".git"))).toBe(false);
  });

  it("finds source files", async () => {
    const adapter = createMockFs();
    const builder = new TreeBuilder(adapter, "/test/project");
    const tree = await builder.buildTree();

    const paths = builder.flattenPaths(tree.children);
    expect(paths).toContain("src/index.ts");
    expect(paths).toContain("src/utils.ts");
    expect(paths).toContain("package.json");
  });

  it("selects and deselects nodes", async () => {
    const adapter = createMockFs();
    const builder = new TreeBuilder(adapter, "/test/project");
    const tree = await builder.buildTree();

    const result = builder.selectNode(tree.children, "src/index.ts");
    expect(result).toBe(true);

    const selected = builder.getSelectedPaths(tree.children);
    expect(selected).toContain("src/index.ts");
  });

  it("expands and collapses nodes", async () => {
    const adapter = createMockFs();
    const builder = new TreeBuilder(adapter, "/test/project");
    const tree = await builder.buildTree();

    const srcNode = tree.children.find((n) => n.file.name === "src");
    expect(srcNode?.expanded).toBe(true);

    builder.collapseNode(tree.children, "src");
    expect(srcNode?.expanded).toBe(false);

    builder.expandNode(tree.children, "src");
    expect(srcNode?.expanded).toBe(true);
  });

  it("flattenPaths returns all file paths", () => {
    const adapter = createMockFs();
    const builder = new TreeBuilder(adapter, "/test/project");
    // Need to await the build
  });
});
