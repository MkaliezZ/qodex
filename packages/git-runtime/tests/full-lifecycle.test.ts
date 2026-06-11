import { describe, it, expect } from "vitest";
import { GitRuntime, MockGitAdapter } from "../src/index.js";

describe("Full Lifecycle", () => {
  it("open → create commits → create branches → switch → checkpoints", async () => {
    const rt = new GitRuntime();
    const repo = await rt.openRepository("/project");
    expect(repo.isInitialized).toBe(true);

    // Create commits
    await rt.createCommit("Initial");
    await rt.createCommit("Add feature");
    expect(await rt.commits.list()).toHaveLength(2);

    // Create branch and switch
    await rt.createBranch("develop");
    await rt.switchBranch("develop");
    expect(rt.repository?.currentBranch).toBe("develop");

    // Create commit on new branch
    await rt.createCommit("Work on develop");
    expect(await rt.commits.list()).toHaveLength(3);

    // Create checkpoint
    const cp = await rt.createCheckpoint("pre-release");
    expect(cp.name).toBe("pre-release");

    // Switch back to main
    await rt.switchBranch("main");
    expect(rt.repository?.currentBranch).toBe("main");

    // Verify events
    const events: string[] = [];
    rt.events.subscribe((e) => events.push(e.type));

    await rt.createCheckpoint("final");
    expect(events).toContain("checkpoint.created");
  });

  it("mock adapter status tracking works end-to-end", async () => {
    const adapter = new MockGitAdapter();
    adapter.markModified("src/app.ts");
    adapter.markUntracked("TODO.md");

    const rt = new GitRuntime(adapter);
    await rt.openRepository("/project");

    const status = await rt.getStatus();
    expect(status.modified).toContain("src/app.ts");
    expect(status.untracked).toContain("TODO.md");
    expect(await rt.status.hasChanges()).toBe(true);
    expect(await rt.status.getFileCount()).toBe(2);

    // Commit clears files
    await rt.createCommit("Update app");
    expect((await rt.getStatus()).modified).toHaveLength(0);
  });

  it("multiple checkpoints with restore", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/project");
    await rt.createCommit("C1");
    await rt.createCheckpoint("after-c1");
    await rt.createCommit("C2");
    await rt.createCheckpoint("after-c2");

    expect(rt.checkpoints.count).toBe(2);

    const cp1 = await rt.restoreCheckpoint("after-c1");
    expect(cp1.name).toBe("after-c1");
  });
});
