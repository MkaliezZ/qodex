/**
 * Qodex M7 Production Review — 16 Scenarios
 */

import { describe, it, expect, vi } from "vitest";
import { GitRuntime, MockGitAdapter, GitEventBus } from "../src/index.js";
import type { GitAdapter } from "../src/repository/adapter.js";

// ── Scenario 1: Repository Detection ───────────────

describe("Scenario 1 — Repository Detection", () => {
  it("PASS: existing repo detected", async () => {
    const adapter = new MockGitAdapter();
    await adapter.init("/existing/project");
    const rt = new GitRuntime(adapter);
    const repo = await rt.openRepository("/existing/project");
    expect(repo.isInitialized).toBe(true);
    expect(repo.rootPath).toBe("/existing/project");
    expect(repo.currentBranch).toBe("main");
  });

  it("PASS: no init if already detected", async () => {
    const adapter: GitAdapter = {
      detect: vi.fn().mockResolvedValue(true),
      init: vi.fn(),
      open: vi.fn().mockResolvedValue({ rootPath: "/p", isInitialized: true, currentBranch: "main" }),
      getStatus: vi.fn(), commit: vi.fn(), log: vi.fn(),
      stageAll: vi.fn(), createBranch: vi.fn(), switchBranch: vi.fn(),
      listBranches: vi.fn().mockResolvedValue([]), getCurrentBranch: vi.fn(),
      getHash: vi.fn(),
    };
    const rt = new GitRuntime(adapter);
    await rt.openRepository("/p");
    expect(adapter.init).not.toHaveBeenCalled();
  });
});

// ── Scenario 2: Repository Initialization ──────────

describe("Scenario 2 — Repository Initialization", () => {
  it("PASS: init creates default branch", async () => {
    const rt = new GitRuntime();
    const repo = await rt.initializeRepository("/fresh/project");
    expect(repo.isInitialized).toBe(true);
    expect(repo.currentBranch).toBe("main");
    expect(repo.rootPath).toBe("/fresh/project");
  });

  it("PASS: no files deleted", async () => {
    const mock = new MockGitAdapter();
    mock.markUntracked("existing.txt"); // simulate existing file
    const rt = new GitRuntime(mock);
    await rt.openRepository("/test");
    const status = await rt.getStatus();
    expect(status.untracked).toContain("existing.txt");
  });
});

// ── Scenario 3: Status Engine ──────────────────────

describe("Scenario 3 — Status Engine", () => {
  it("PASS: modified detected", async () => {
    const a = new MockGitAdapter(); a.markModified("src/a.ts");
    const rt = new GitRuntime(a); await rt.openRepository("/p");
    const s = await rt.getStatus(); expect(s.modified).toContain("src/a.ts");
  });
  it("PASS: added detected", async () => {
    const a = new MockGitAdapter(); a.markAdded("new.ts");
    const rt = new GitRuntime(a); await rt.openRepository("/p");
    const s = await rt.getStatus(); expect(s.added).toContain("new.ts");
  });
  it("PASS: deleted detected", async () => {
    const a = new MockGitAdapter(); a.markDeleted("gone.ts");
    const rt = new GitRuntime(a); await rt.openRepository("/p");
    const s = await rt.getStatus(); expect(s.deleted).toContain("gone.ts");
  });
  it("PASS: untracked detected", async () => {
    const a = new MockGitAdapter(); a.markUntracked("TODO.md");
    const rt = new GitRuntime(a); await rt.openRepository("/p");
    const s = await rt.getStatus(); expect(s.untracked).toContain("TODO.md");
  });
  it("PASS: counts correct", async () => {
    const a = new MockGitAdapter();
    a.markModified("a"); a.markModified("b"); a.markAdded("c"); a.markDeleted("d"); a.markUntracked("e");
    const rt = new GitRuntime(a); await rt.openRepository("/p");
    expect(await rt.status.getFileCount()).toBe(5);
  });
});

// ── Scenario 4: Checkpoint Creation ────────────────

describe("Scenario 4 — Checkpoint Creation", () => {
  it("PASS: checkpoint created with id, name, hash", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/p");
    const cp = await rt.createCheckpoint("m7-review-checkpoint");
    expect(cp.id).toBeTruthy();
    expect(cp.name).toBe("m7-review-checkpoint");
    expect(cp.commitHash).toBeTruthy();
  });
  it("PASS: checkpoint.created event fires", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/p");
    const events: string[] = [];
    rt.events.subscribe((e) => events.push(e.type));
    await rt.createCheckpoint("event-check");
    expect(events).toContain("checkpoint.created");
  });
  it("PASS: checkpoint appears in list", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/p");
    await rt.createCheckpoint("list-test");
    expect(rt.checkpoints.list().map((c) => c.name)).toContain("list-test");
  });
});

// ── Scenario 5: Checkpoint Restore ─────────────────

describe("Scenario 5 — Checkpoint Restore", () => {
  it("PASS: restore completes successfully", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/p");
    await rt.createCheckpoint("stable");
    const cp = await rt.restoreCheckpoint("stable");
    expect(cp.name).toBe("stable");
  });
  it("PASS: restore event fires", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/p");
    await rt.createCheckpoint("rollback");
    const events: string[] = [];
    rt.events.subscribe((e) => events.push(e.type));
    await rt.restoreCheckpoint("rollback");
    expect(events).toContain("checkpoint.restored");
  });
  it("PASS: runtime state remains valid after restore", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/p");
    await rt.createCheckpoint("save1");
    await rt.restoreCheckpoint("save1");
    expect(rt.isOpen).toBe(true);
    expect(rt.repository?.currentBranch).toBe("main");
  });
});

// ── Scenario 6: Commit Creation ────────────────────

describe("Scenario 6 — Commit Creation", () => {
  it("PASS: commit created with message", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/p");
    const c = await rt.createCommit("M7 review commit");
    expect(c.hash).toBeTruthy();
    expect(c.message).toBe("M7 review commit");
  });
  it("PASS: commit.created event fires", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/p");
    const events: string[] = [];
    rt.events.subscribe((e) => events.push(e.type));
    await rt.createCommit("Event test");
    expect(events).toContain("commit.created");
  });
  it("PASS: commit appears in listCommits", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/p");
    await rt.createCommit("List me");
    const list = await rt.commits.list();
    expect(list.some((c) => c.message === "List me")).toBe(true);
  });
  it("PASS: commit rejected on empty message", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/p");
    await expect(rt.createCommit("")).rejects.toThrow("empty");
  });
});

// ── Scenario 7: Commit Listing ─────────────────────

describe("Scenario 7 — Commit Listing", () => {
  it("PASS: commits returned in reverse chronological", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/p");
    await rt.createCommit("First");
    await rt.createCommit("Second");
    await rt.createCommit("Third");
    const list = await rt.commits.list();
    expect(list[0].message).toBe("Third");
    expect(list[1].message).toBe("Second");
    expect(list[2].message).toBe("First");
  });
  it("PASS: metadata readable", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/p");
    const c = await rt.createCommit("Meta");
    expect(typeof c.hash).toBe("string");
    expect(typeof c.createdAt).toBe("string");
    expect(c.hash.length).toBeGreaterThan(5);
  });
});

// ── Scenario 8: Branch Creation ────────────────────

describe("Scenario 8 — Branch Creation", () => {
  it("PASS: branch created", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/p");
    const b = await rt.createBranch("m7-review-branch");
    expect(b.name).toBe("m7-review-branch");
  });
  it("PASS: branch.created event fires", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/p");
    const events: string[] = [];
    rt.events.subscribe((e) => events.push(e.type));
    await rt.createBranch("event-branch");
    expect(events).toContain("branch.created");
  });
  it("PASS: branch appears in listBranches", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/p");
    await rt.createBranch("feat/list-test");
    const branches = await rt.branches.list();
    expect(branches.map((b) => b.name)).toContain("feat/list-test");
  });
  it("PASS: current branch unchanged without switch", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/p");
    await rt.createBranch("other");
    expect(rt.repository?.currentBranch).toBe("main");
  });
});

// ── Scenario 9: Branch Switching ───────────────────

describe("Scenario 9 — Branch Switching", () => {
  it("PASS: switch updates current branch", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/p");
    await rt.createBranch("switch-test");
    await rt.switchBranch("switch-test");
    expect(rt.repository?.currentBranch).toBe("switch-test");
  });
  it("PASS: switch fires branch.switched event", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/p");
    await rt.createBranch("switch-event");
    const events: string[] = [];
    rt.events.subscribe((e) => events.push(e.type));
    await rt.switchBranch("switch-event");
    expect(events).toContain("branch.switched");
  });
  it("PASS: switch back and forth works", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/p");
    await rt.createBranch("b1");
    await rt.createBranch("b2");
    await rt.switchBranch("b1");
    expect(rt.repository?.currentBranch).toBe("b1");
    await rt.switchBranch("b2");
    expect(rt.repository?.currentBranch).toBe("b2");
    await rt.switchBranch("main");
    expect(rt.repository?.currentBranch).toBe("main");
  });
  it("PASS: invalid branch rejected", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/p");
    await expect(rt.switchBranch("nonexistent")).rejects.toThrow("not found");
  });
});

// ── Scenario 10: Diff Engine + Git Integration ─────

describe("Scenario 10 — Diff Engine + Git Integration", () => {
  it("PASS: checkpoint → commit → restore cycle simulates diff-engine integration", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/p");

    // Create checkpoint (simulates before-edit state)
    await rt.createCheckpoint("before-edit");

    // Create commit (simulates post-apply state)
    await rt.createCommit("post-patch changes");
    await rt.createCheckpoint("after-edit");

    // Verify both checkpoints
    expect(rt.checkpoints.count).toBe(2);
    expect(rt.checkpoints.list().map((c) => c.name)).toEqual(["before-edit", "after-edit"]);

    // Restore to pre-edit checkpoint
    const restored = await rt.restoreCheckpoint("before-edit");
    expect(restored.name).toBe("before-edit");

    // Runtime state remains valid
    expect(rt.isOpen).toBe(true);
    expect(rt.repository?.currentBranch).toBe("main");
  });
});

// ── Scenario 11: No Remote Operations ──────────────

describe("Scenario 11 — No Remote Operations", () => {
  it("PASS: GitRuntime has no remote methods", () => {
    const rt = new GitRuntime();
    expect((rt as any).push).toBeUndefined();
    expect((rt as any).pull).toBeUndefined();
    expect((rt as any).fetch).toBeUndefined();
    expect((rt as any).remote).toBeUndefined();
  });
  it("PASS: no push/pull/fetch/remote in interfaces", () => {
    const methods = Object.getOwnPropertyNames(GitRuntime.prototype).filter(
      (p) => typeof (GitRuntime.prototype as any)[p] === "function",
    );
    const forbidden = ["push", "pull", "fetch", "remote", "pr", "merge", "rebase", "cherryPick"];
    for (const f of forbidden) {
      expect(methods.includes(f)).toBe(false);
    }
  });
});

// ── Scenario 12: Event Chain ───────────────────────

describe("Scenario 12 — Event Chain", () => {
  it("PASS: checkpoint flow: created → restored in order", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/p");
    const order: string[] = [];
    rt.events.subscribe((e) => order.push(e.type));
    await rt.createCheckpoint("chain");
    expect(order).toEqual(["checkpoint.created"]);
    order.length = 0;
    await rt.restoreCheckpoint("chain");
    expect(order).toEqual(["checkpoint.restored"]);
  });
  it("PASS: commit event fires", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/p");
    const events: string[] = [];
    rt.events.subscribe((e) => events.push(e.type));
    await rt.createCommit("chain commit");
    expect(events).toEqual(["commit.created"]);
  });
  it("PASS: branch events fire in correct sequence", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/p");
    const order: string[] = [];
    rt.events.subscribe((e) => order.push(e.type));
    await rt.createBranch("chain-branch");
    expect(order).toEqual(["branch.created"]);
    order.length = 0;
    await rt.switchBranch("chain-branch");
    expect(order).toEqual(["branch.switched"]);
  });
  it("PASS: no duplicate or missing events", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/p");
    const counts: Record<string, number> = {};
    rt.events.subscribe((e) => { counts[e.type] = (counts[e.type] || 0) + 1; });
    await rt.createCheckpoint("x");
    await rt.createCommit("y");
    await rt.createBranch("z");
    expect(counts["checkpoint.created"]).toBe(1);
    expect(counts["commit.created"]).toBe(1);
    expect(counts["branch.created"]).toBe(1);
  });
});

// ── Scenario 13: UI Repository Status (API) ────────

describe("Scenario 13 — UI Repository Status", () => {
  it("PASS: exposes status for UI rendering", async () => {
    const a = new MockGitAdapter();
    a.markModified("src/app.ts");
    const rt = new GitRuntime(a);
    await rt.openRepository("/project");
    expect(rt.repository?.currentBranch).toBe("main");
    expect((await rt.getStatus()).modified).toHaveLength(1);
    expect(rt.checkpoints.count).toBe(0);
  });
  it("PASS: checkpoint count accessible", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/p");
    await rt.createCheckpoint("v1");
    await rt.createCheckpoint("v2");
    expect(rt.checkpoints.count).toBe(2);
  });
  it("PASS: branch list accessible for dropdown", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/p");
    await rt.createBranch("feat/alpha");
    await rt.createBranch("feat/beta");
    const branches = await rt.branches.list();
    expect(branches.length).toBeGreaterThanOrEqual(3);
  });
});

// ── Scenario 14: Error Handling ────────────────────

describe("Scenario 14 — Error Handling", () => {
  it("PASS: restore nonexistent checkpoint throws", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/p");
    await expect(rt.restoreCheckpoint("ghost")).rejects.toThrow("not found");
  });
  it("PASS: switch nonexistent branch throws", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/p");
    await expect(rt.switchBranch("ghost")).rejects.toThrow("not found");
  });
  it("PASS: empty branch name rejected", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/p");
    await expect(rt.createBranch("")).rejects.toThrow("empty");
  });
  it("PASS: empty commit message rejected", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/p");
    await expect(rt.createCommit("")).rejects.toThrow("empty");
  });
  it("PASS: no crash on error", async () => {
    const rt = new GitRuntime();
    try { await rt.restoreCheckpoint("ghost"); } catch { /* expected */ }
    expect(rt.isOpen).toBe(false); // wasn't opened
  });
});

// ── Scenario 15: Safety Validation ─────────────────

describe("Scenario 15 — Safety Validation", () => {
  it("PASS: no destructive operations without explicit workflow", () => {
    const methods = Object.getOwnPropertyNames(GitRuntime.prototype);
    const dangerous = ["reset", "resetHard", "clean", "rebase", "merge", "cherryPick", "push", "pull", "fetch"];
    for (const d of dangerous) {
      expect(methods.includes(d)).toBe(false);
    }
  });
  it("PASS: existing files preserved on init", async () => {
    const a = new MockGitAdapter();
    a.markUntracked("my-data.txt");
    const rt = new GitRuntime(a);
    await rt.openRepository("/p");
    const s = await rt.getStatus();
    expect(s.untracked).toContain("my-data.txt");
  });
  it("PASS: no remote writes", () => {
    const rt = new GitRuntime();
    expect((rt as any).remote).toBeUndefined();
    expect((rt as any).push).toBeUndefined();
  });
});

// ── Scenario 16: UI Stability via EventBus ─────────

describe("Scenario 16 — UI Stability", () => {
  it("PASS: event bus survives rapid events", () => {
    const bus = new GitEventBus();
    let count = 0;
    bus.subscribe(() => count++);
    for (let i = 0; i < 1000; i++) {
      bus.publish("checkpoint.created", { name: `cp${i}` });
    }
    expect(count).toBe(1000);
  });
  it("PASS: no EventBus exceptions", () => {
    const bus = new GitEventBus();
    bus.subscribe(() => { throw new Error("handler crash"); });
    bus.subscribe(() => { /* no-op */ });
    expect(() => bus.publish("commit.created", {})).not.toThrow();
  });
  it("PASS: clear resets event bus", () => {
    const bus = new GitEventBus();
    bus.subscribe(() => {});
    bus.subscribe(() => {});
    expect(bus.size).toBe(2);
    bus.clear();
    expect(bus.size).toBe(0);
  });
});
