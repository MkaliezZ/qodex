import { describe, it, expect, vi } from "vitest";
import { SkillRuntime } from "../src/index.js";

describe("SkillRuntime Events", () => {
  it("subscribe and unsubscribe work", async () => {
    const rt = new SkillRuntime();
    const handler = vi.fn();
    const unsub = rt.subscribe(handler);
    await rt.initialize();
    expect(handler).toHaveBeenCalled();
    unsub();
    handler.mockClear();
    await rt.reloadAll();
    expect(handler).not.toHaveBeenCalled();
  });

  it("survives handler exceptions", async () => {
    const rt = new SkillRuntime();
    const good = vi.fn();
    rt.subscribe(() => { throw new Error("crash"); });
    rt.subscribe(good);
    await rt.initialize();
    expect(good).toHaveBeenCalled();
  });

  it("all event types fire correctly", async () => {
    const rt = new SkillRuntime();
    await rt.initialize();
    const types: string[] = [];
    rt.subscribe((e) => types.push(e.type));
    rt.resolveSkills("React");
    await rt.reloadSkill("react-review");
    rt.unloadSkill("bug-hunter");
    expect(types).toContain("skill.resolved");
    expect(types).toContain("skill.reloaded");
    expect(types).toContain("skill.unloaded");
  });

  it("events have timestamp", async () => {
    const rt = new SkillRuntime();
    const event: any[] = [];
    rt.subscribe((e) => event.push(e));
    await rt.initialize();
    expect(event[0].timestamp).toBeTruthy();
  });
});
