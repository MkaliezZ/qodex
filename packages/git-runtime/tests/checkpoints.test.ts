import { describe, it, expect } from "vitest";
import { GitRuntime } from "../src/index.js";

describe("Checkpoints", () => {
  it("creates a checkpoint", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/test");
    const cp = await rt.createCheckpoint("v1");
    expect(cp.name).toBe("v1");
    expect(cp.id).toBeTruthy();
    expect(cp.commitHash).toBeTruthy();
  });

  it("lists created checkpoints", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/test");
    await rt.createCheckpoint("alpha");
    await rt.createCheckpoint("beta");
    expect(rt.checkpoints.count).toBe(2);
    expect(rt.checkpoints.list().map((c) => c.name)).toEqual(["alpha", "beta"]);
  });

  it("restores a checkpoint by name", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/test");
    await rt.createCheckpoint("restore-me");
    const cp = await rt.restoreCheckpoint("restore-me");
    expect(cp.name).toBe("restore-me");
  });

  it("throws on missing checkpoint", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/test");
    await expect(rt.restoreCheckpoint("ghost")).rejects.toThrow("not found");
  });

  it("removes a checkpoint", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/test");
    await rt.createCheckpoint("remove-me");
    expect(rt.checkpoints.remove("remove-me")).toBe(true);
    expect(rt.checkpoints.count).toBe(0);
  });

  it("clear removes all checkpoints", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/test");
    await rt.createCheckpoint("a");
    await rt.createCheckpoint("b");
    rt.checkpoints.clear();
    expect(rt.checkpoints.count).toBe(0);
  });

  it("throws on duplicate checkpoint name", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/test");
    await rt.createCheckpoint("dup");
    await expect(rt.createCheckpoint("dup")).rejects.toThrow("already exists");
  });

  it("fires checkpoint.created event", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/test");
    const events: string[] = [];
    rt.events.subscribe((e) => events.push(e.type));
    await rt.createCheckpoint("event-test");
    expect(events).toContain("checkpoint.created");
  });

  it("fires checkpoint.restored event", async () => {
    const rt = new GitRuntime();
    await rt.openRepository("/test");
    await rt.createCheckpoint("restore-event");
    const events: string[] = [];
    rt.events.subscribe((e) => events.push(e.type));
    await rt.restoreCheckpoint("restore-event");
    expect(events).toContain("checkpoint.restored");
  });
});
