import { describe, it, expect } from "vitest";
import { GitRuntime } from "../src/index.js";
import { MockGitAdapter } from "../src/index.js";

describe("Commits", () => {
  it("creates a commit", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/test");
    const commit = await rt.createCommit("Initial commit");
    expect(commit.message).toBe("Initial commit");
    expect(commit.hash).toBeTruthy();
  });

  it("creates multiple commits with sequential hashes", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/test");
    const c1 = await rt.createCommit("First");
    const c2 = await rt.createCommit("Second");
    expect(c1.hash).not.toBe(c2.hash);
  });

  it("lists commits in reverse chronological order", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/test");
    await rt.createCommit("C1");
    await rt.createCommit("C2");
    await rt.createCommit("C3");
    const list = await rt.commits.list();
    expect(list).toHaveLength(3);
    expect(list[0].message).toBe("C3");
    expect(list[2].message).toBe("C1");
  });

  it("throws on empty message", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/test");
    await expect(rt.createCommit("")).rejects.toThrow("empty");
  });

  it("throws on whitespace-only message", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/test");
    await expect(rt.createCommit("   ")).rejects.toThrow("empty");
  });

  it("fires commit.created event", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/test");
    const events: string[] = [];
    rt.events.subscribe((e) => events.push(e.type));
    await rt.createCommit("Event test");
    expect(events).toContain("commit.created");
  });

  it("commits increase branch commit count", async () => {
    const adapter = new MockGitAdapter();
    const rt = new GitRuntime(adapter);
    await rt.openRepository("/test");
    await rt.createCommit("C1");
    await rt.createCommit("C2");
    const branches = await rt.branches.list();
    const main = branches.find((b) => b.name === "main");
    expect(main?.commitCount).toBe(2);
  });

  it("getLatest returns most recent commit", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/test");
    await rt.createCommit("Early");
    const latest = await rt.createCommit("Latest");
    const found = await rt.commits.getLatest();
    expect(found?.hash).toBe(latest.hash);
  });
});
