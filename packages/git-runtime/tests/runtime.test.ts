import { describe, it, expect } from "vitest";
import { GitRuntime, MockGitAdapter } from "../src/index.js";

describe("GitRuntime", () => {
  it("starts closed", () => {
    const rt = new GitRuntime();
    expect(rt.isOpen).toBe(false);
    expect(rt.repository).toBeNull();
  });

  it("opens existing repository", async () => {
    const adapter = new MockGitAdapter();
    await adapter.init("/test/repo");
    const rt = new GitRuntime(adapter);
    const repo = await rt.openRepository("/test/repo");
    expect(repo.isInitialized).toBe(true);
    expect(rt.isOpen).toBe(true);
  });

  it("initializes new repository when not detected", async () => {
    const rt = new GitRuntime();
    const repo = await rt.openRepository("/new/project");
    expect(repo.isInitialized).toBe(true);
    expect(repo.currentBranch).toBe("main");
  });

  it("initializeRepository creates fresh repo", async () => {
    const rt = new GitRuntime();
    const repo = await rt.initializeRepository("/fresh");
    expect(repo.isInitialized).toBe(true);
    expect(repo.currentBranch).toBe("main");
  });

  it("getStatus returns empty for clean repo", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/test");
    const status = await rt.getStatus();
    expect(status.modified).toEqual([]);
    expect(status.added).toEqual([]);
    expect(status.deleted).toEqual([]);
  });
});
