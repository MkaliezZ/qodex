import { describe, it, expect } from "vitest";
import { GitRuntime, MockGitAdapter } from "../src/index.js";

describe("Status", () => {
  it("reports modified files", async () => {
    const adapter = new MockGitAdapter();
    adapter.markModified("src/index.ts");
    const rt = new GitRuntime(adapter);
    await rt.openRepository("/test");
    const status = await rt.getStatus();
    expect(status.modified).toContain("src/index.ts");
  });

  it("reports added files", async () => {
    const adapter = new MockGitAdapter();
    adapter.markAdded("new.ts");
    const rt = new GitRuntime(adapter);
    await rt.openRepository("/test");
    const status = await rt.getStatus();
    expect(status.added).toContain("new.ts");
  });

  it("reports deleted files", async () => {
    const adapter = new MockGitAdapter();
    adapter.markDeleted("old.ts");
    const rt = new GitRuntime(adapter);
    await rt.openRepository("/test");
    const status = await rt.getStatus();
    expect(status.deleted).toContain("old.ts");
  });

  it("reports untracked files", async () => {
    const adapter = new MockGitAdapter();
    adapter.markUntracked("todo.md");
    const rt = new GitRuntime(adapter);
    await rt.openRepository("/test");
    const status = await rt.getStatus();
    expect(status.untracked).toContain("todo.md");
  });

  it("reports empty after stage all", async () => {
    const adapter = new MockGitAdapter();
    adapter.markModified("f.ts");
    const rt = new GitRuntime(adapter);
    await rt.openRepository("/test");
    expect((await rt.getStatus()).modified).toHaveLength(1);
    await adapter.stageAll();
    expect((await rt.getStatus()).modified).toHaveLength(0);
  });

  it("hasChanges returns true when modified", async () => {
    const adapter = new MockGitAdapter();
    adapter.markModified("f.ts");
    const rt = new GitRuntime(adapter);
    await rt.openRepository("/test");
    expect(await rt.status.hasChanges()).toBe(true);
  });

  it("hasChanges returns false for clean state", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/test");
    expect(await rt.status.hasChanges()).toBe(false);
  });

  it("fileCount sums all categories", async () => {
    const adapter = new MockGitAdapter();
    adapter.markModified("a.ts");
    adapter.markAdded("b.ts");
    adapter.markDeleted("c.ts");
    adapter.markUntracked("d.ts");
    const rt = new GitRuntime(adapter);
    await rt.openRepository("/test");
    expect(await rt.status.getFileCount()).toBe(4);
  });
});
