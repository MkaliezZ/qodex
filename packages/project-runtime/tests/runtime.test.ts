import { describe, it, expect } from "vitest";
import { MockFileSystemAdapter } from "../src/fs/mock.js";
import { ProjectRuntime } from "../src/project/runtime.js";

function createTestRuntime(): ProjectRuntime {
  const adapter = new MockFileSystemAdapter([
    { path: "src", name: "src", content: "", isDir: true },
    { path: "src/index.ts", name: "index.ts", content: "const x = 1;", isDir: false },
    { path: "src/utils.ts", name: "utils.ts", content: "export const y = 2;", isDir: false },
    { path: "package.json", name: "package.json", content: '{"name":"test"}', isDir: false },
    { path: "README.md", name: "README.md", content: "# Test", isDir: false },
    { path: "node_modules", name: "node_modules", content: "", isDir: true },
    { path: "node_modules/pkg", name: "pkg", content: "", isDir: true },
    { path: ".git", name: ".git", content: "", isDir: true },
    { path: "image.png", name: "image.png", content: "BINARY", isDir: false },
  ]);

  return new ProjectRuntime({ adapter });
}

describe("ProjectRuntime", () => {
  it("starts with no project", () => {
    const runtime = createTestRuntime();
    expect(runtime.hasProject).toBe(false);
    expect(runtime.project).toBeNull();
  });

  it("opens a project", async () => {
    const runtime = createTestRuntime();
    const project = await runtime.openProject("/test/project");
    expect(project.name).toBe("project");
    expect(project.rootPath).toBe("/test/project");
    expect(runtime.hasProject).toBe(true);
  });

  it("builds file tree on open", async () => {
    const runtime = createTestRuntime();
    await runtime.openProject("/test/project");
    expect(runtime.tree).not.toBeNull();
    expect(runtime.tree!.children.length).toBeGreaterThan(0);
  });

  it("excludes ignored files from tree", async () => {
    const runtime = createTestRuntime();
    await runtime.openProject("/test/project");
    const paths = runtime.index!.files.map((f) => f.path);
    expect(paths.some((p) => p.includes("node_modules"))).toBe(false);
    expect(paths.some((p) => p.includes(".git"))).toBe(false);
  });

  it("creates an index on open", async () => {
    const runtime = createTestRuntime();
    await runtime.openProject("/test/project");
    expect(runtime.index).not.toBeNull();
    expect(runtime.fileCount).toBeGreaterThan(0);
    expect(runtime.totalSize).toBeGreaterThan(0);
  });

  it("toggles file selection", async () => {
    const runtime = createTestRuntime();
    await runtime.openProject("/test/project");

    runtime.toggleSelect("src/index.ts");
    expect(runtime.selectedPaths).toContain("src/index.ts");

    runtime.toggleSelect("src/index.ts");
    expect(runtime.selectedPaths).not.toContain("src/index.ts");
  });

  it("deselects all files", async () => {
    const runtime = createTestRuntime();
    await runtime.openProject("/test/project");

    runtime.toggleSelect("src/index.ts");
    runtime.toggleSelect("src/utils.ts");
    expect(runtime.selectedPaths).toHaveLength(2);

    runtime.deselectAll();
    expect(runtime.selectedPaths).toHaveLength(0);
  });

  it("reads a selected file", async () => {
    const runtime = createTestRuntime();
    await runtime.openProject("/test/project");

    const content = await runtime.readFile("src/index.ts");
    expect(content.content).toBe("const x = 1;");
    expect(content.language).toBe("typescript");
  });

  it("blocks binary file reads", async () => {
    const runtime = createTestRuntime();
    await runtime.openProject("/test/project");

    const content = await runtime.readFile("image.png");
    expect(content.content).toBe("Unsupported Binary File");
  });

  it("reads selected files as context", async () => {
    const runtime = createTestRuntime();
    await runtime.openProject("/test/project");

    runtime.toggleSelect("src/index.ts");
    runtime.toggleSelect("src/utils.ts");

    const context = await runtime.readSelectedFilesAsContext();
    expect(context).toContain("src/index.ts");
    expect(context).toContain("const x = 1");
    expect(context).toContain("src/utils.ts");
    expect(context).toContain("export const y = 2");
  });

  it("closes a project", async () => {
    const runtime = createTestRuntime();
    await runtime.openProject("/test/project");
    runtime.closeProject();
    expect(runtime.hasProject).toBe(false);
    expect(runtime.project).toBeNull();
    expect(runtime.tree).toBeNull();
  });
});
