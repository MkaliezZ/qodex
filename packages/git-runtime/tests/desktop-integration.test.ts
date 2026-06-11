import { describe, it, expect } from "vitest";
import { GitRuntime, MockGitAdapter } from "../src/index.js";

describe("Desktop Integration Patterns", () => {
  it("runtime exposes repository info for UI", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/project");
    expect(rt.repository).toBeTruthy();
    expect(rt.repository?.currentBranch).toBe("main");
    expect(rt.repository?.isInitialized).toBe(true);
  });

  it("status engine exposes file counts for UI badges", async () => {
    const adapter = new MockGitAdapter();
    adapter.markModified("src/a.ts");
    adapter.markModified("src/b.ts");
    const rt = new GitRuntime(adapter);
    await rt.openRepository("/project");
    const count = await rt.status.getFileCount();
    expect(count).toBe(2);
  });

  it("checkpoint count accessible for UI display", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/project");
    await rt.createCheckpoint("v1");
    await rt.createCheckpoint("v2");
    await rt.createCheckpoint("v3");
    expect(rt.checkpoints.count).toBe(3);
  });

  it("commit history displayable in UI", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/project");
    await rt.createCommit("Init");
    await rt.createCommit("Feature A");
    await rt.createCommit("Fix bug");
    const history = await rt.commits.list();
    expect(history[0].message).toBe("Fix bug");
    expect(history[1].message).toBe("Feature A");
    expect(history[2].message).toBe("Init");
  });

  it("branch list displayable in dropdown", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/project");
    await rt.createBranch("feature/login");
    await rt.createBranch("feature/search");
    const branches = await rt.branches.list();
    expect(branches.map((b) => b.name)).toContain("main");
    expect(branches.map((b) => b.name)).toContain("feature/login");
    expect(branches.map((b) => b.name)).toContain("feature/search");
  });

  it("events integrate with UI event bus", () => {
    const rt = new GitRuntime();
    const uiEvents: string[] = [];
    rt.events.subscribe((e) => uiEvents.push(e.type));
    rt.events.publish("checkpoint.created", { name: "ui-test" });
    expect(uiEvents).toContain("checkpoint.created");
  });
});
