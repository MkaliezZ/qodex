import { describe, it, expect } from "vitest";
import { GitRuntime, MockGitAdapter, GitEventBus } from "../src/index.js";

describe("Regression Tests", () => {
  it("100 sequential operations don't crash", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/stress");
    for (let i = 0; i < 100; i++) {
      await rt.createCommit(`Commit ${i}`);
    }
    const commits = await rt.commits.list(200);
    expect(commits).toHaveLength(100);
  });

  it("event bus survives 1000 publications", () => {
    const bus = new GitEventBus();
    let count = 0;
    bus.subscribe(() => count++);
    for (let i = 0; i < 1000; i++) {
      bus.publish("commit.created", { hash: String(i) });
    }
    expect(count).toBe(1000);
  });

  it("checkpoint list is independent across runtimes", async () => {
    const r1 = new GitRuntime();
    const r2 = new GitRuntime();
    await r1.openRepository("/a");
    await r2.openRepository("/b");
    await r1.createCheckpoint("cp1");
    await r2.createCheckpoint("cp2");
    expect(r1.checkpoints.count).toBe(1);
    expect(r2.checkpoints.count).toBe(1);
    expect(r1.checkpoints.list()[0].name).toBe("cp1");
    expect(r2.checkpoints.list()[0].name).toBe("cp2");
  });

  it("adapter reuse across multiple open/close cycles", async () => {
    const adapter = new MockGitAdapter();
    for (let i = 0; i < 5; i++) {
      const rt = new GitRuntime(adapter);
      await rt.openRepository(`/cycle-${i}`);
      await rt.createCommit(`Cycle ${i}`);
      expect(await rt.commits.list()).toHaveLength(i + 1);
    }
  });

  it("commits on different branches don't cross-contaminate", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/test");
    await rt.createCommit("Main commit");
    await rt.createBranch("feat");
    await rt.switchBranch("feat");
    await rt.createCommit("Feat commit");
    expect(await rt.commits.list()).toHaveLength(2);
  });
});
