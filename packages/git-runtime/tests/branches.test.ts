import { describe, it, expect } from "vitest";
import { GitRuntime } from "../src/index.js";

describe("Branches", () => {
  it("starts with main branch", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/test");
    const branches = await rt.branches.list();
    expect(branches).toHaveLength(1);
    expect(branches[0].name).toBe("main");
    expect(branches[0].isCurrent).toBe(true);
  });

  it("creates a new branch", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/test");
    const branch = await rt.createBranch("feature-x");
    expect(branch.name).toBe("feature-x");
    expect(branch.isCurrent).toBe(false);
  });

  it("lists all branches after creation", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/test");
    await rt.createBranch("feat-a");
    await rt.createBranch("feat-b");
    const branches = await rt.branches.list();
    expect(branches).toHaveLength(3);
  });

  it("switches to another branch", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/test");
    await rt.createBranch("develop");
    await rt.switchBranch("develop");
    expect(await rt.branches.getCurrent()).toBe("develop");
    expect(rt.repository?.currentBranch).toBe("develop");
  });

  it("switching updates current flag", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/test");
    await rt.createBranch("other");
    await rt.switchBranch("other");
    const branches = await rt.branches.list();
    const main = branches.find((b) => b.name === "main");
    const other = branches.find((b) => b.name === "other");
    expect(main?.isCurrent).toBe(false);
    expect(other?.isCurrent).toBe(true);
  });

  it("throws on switching to nonexistent branch", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/test");
    await expect(rt.switchBranch("ghost")).rejects.toThrow("not found");
  });

  it("throws on empty branch name", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/test");
    await expect(rt.createBranch("")).rejects.toThrow("empty");
  });

  it("fires branch.created event", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/test");
    const events: string[] = [];
    rt.events.subscribe((e) => events.push(e.type));
    await rt.createBranch("hotfix");
    expect(events).toContain("branch.created");
  });

  it("fires branch.switched event", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/test");
    await rt.createBranch("release");
    const events: string[] = [];
    rt.events.subscribe((e) => events.push(e.type));
    await rt.switchBranch("release");
    expect(events).toContain("branch.switched");
  });
});
