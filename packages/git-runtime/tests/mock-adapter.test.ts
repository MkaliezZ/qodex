import { describe, it, expect } from "vitest";
import { MockGitAdapter } from "../src/index.js";

describe("MockGitAdapter", () => {
  it("detects initialized repo", async () => {
    const a = new MockGitAdapter();
    expect(await a.detect("/test")).toBe(false);
    await a.init("/test");
    expect(await a.detect("/test")).toBe(true);
  });

  it("init creates main branch", async () => {
    const a = new MockGitAdapter();
    const repo = await a.init("/p");
    expect(repo.isInitialized).toBe(true);
    expect(repo.currentBranch).toBe("main");
  });

  it("open returns repo state", async () => {
    const a = new MockGitAdapter();
    await a.init("/p");
    const repo = await a.open("/p");
    expect(repo.rootPath).toBe("/p");
  });

  it("stageAll clears all tracked changes", async () => {
    const a = new MockGitAdapter();
    a.markModified("f.ts");
    await a.stageAll();
    const s = await a.getStatus();
    expect(s.modified).toHaveLength(0);
  });

  it("getHash returns mock hash", async () => {
    const a = new MockGitAdapter();
    expect(await a.getHash()).toBe("mock000000000");
    await a.commit("first");
    expect(await a.getHash()).toBe("mock000000001");
    await a.commit("second");
    expect(await a.getHash()).toBe("mock000000002");
  });

  it("createBranch returns existing branch", async () => {
    const a = new MockGitAdapter();
    const b1 = await a.createBranch("main");
    const b2 = await a.createBranch("main");
    expect(b1.name).toBe(b2.name);
  });

  it("switchBranch throws for nonexistent", async () => {
    const a = new MockGitAdapter();
    await expect(a.switchBranch("ghost")).rejects.toThrow("not found");
  });

  it("listBranches returns all", async () => {
    const a = new MockGitAdapter();
    await a.createBranch("dev");
    await a.createBranch("staging");
    const branches = await a.listBranches();
    expect(branches).toHaveLength(3);
  });

  it("clearFiles resets status", async () => {
    const a = new MockGitAdapter();
    a.markModified("f.ts");
    expect((await a.getStatus()).modified).toHaveLength(1);
    a.clearFiles();
    expect((await a.getStatus()).modified).toHaveLength(0);
  });

  it("log returns commits in reverse order", async () => {
    const a = new MockGitAdapter();
    await a.commit("First");
    await a.commit("Second");
    const log = await a.log();
    expect(log[0].message).toBe("Second");
    expect(log[1].message).toBe("First");
  });
});
