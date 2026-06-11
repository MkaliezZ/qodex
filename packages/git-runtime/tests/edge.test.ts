import { describe, it, expect } from "vitest";
import { GitRuntime, MockGitAdapter } from "../src/index.js";

describe("Edge Cases", () => {
  it("handles consecutive event subscriptions", () => {
    const adapter = new MockGitAdapter();
    const rt = new GitRuntime(adapter);
    let count = 0;
    const unsub1 = rt.events.subscribe(() => count++);
    const unsub2 = rt.events.subscribe(() => count++);
    rt.events.publish("commit.created", { hash: "x" });
    expect(count).toBe(2);
    unsub1();
    unsub2();
  });

  it("reopen repository after close", async () => {
    const rt1 = new GitRuntime();
    await rt1.openRepository("/proj1");
    const rt2 = new GitRuntime();
    const repo = await rt2.openRepository("/proj2");
    expect(repo.rootPath).toBe("/proj2");
    expect(repo.isInitialized).toBe(true);
  });

  it("multiple adapters don't interfere", async () => {
    const a1 = new MockGitAdapter();
    const a2 = new MockGitAdapter();
    a1.markModified("f1.ts");
    a2.markModified("f2.ts");

    const r1 = new GitRuntime(a1);
    const r2 = new GitRuntime(a2);

    await r1.openRepository("/a");
    await r2.openRepository("/b");

    expect((await r1.getStatus()).modified).toHaveLength(1);
    expect((await r1.getStatus()).modified[0]).toBe("f1.ts");
    expect((await r2.getStatus()).modified[0]).toBe("f2.ts");
  });

  it("checkpoint remove returns false for nonexistent", () => {
    const adapter = new MockGitAdapter();
    const rt = new GitRuntime(adapter);
    expect(rt.checkpoints.remove("ghost")).toBe(false);
  });

  it("getLatest returns null on empty repo", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/test");
    expect(await rt.commits.getLatest()).toBeNull();
  });
});
