import { describe, it, expect } from "vitest";
import { SkillRuntime } from "../src/index.js";

describe("SkillRuntime", () => {
  it("initialize loads all built-in skills", async () => {
    const rt = new SkillRuntime();
    await rt.initialize();
    expect(rt.registry.size).toBeGreaterThanOrEqual(3);
  });

  it("initialize emits skill.loaded events", async () => {
    const rt = new SkillRuntime();
    const events: string[] = [];
    rt.subscribe((e) => events.push(e.type));
    await rt.initialize();
    expect(events.filter((e) => e === "skill.loaded").length).toBeGreaterThanOrEqual(3);
  });

  it("resolveSkills returns matched skills", async () => {
    const rt = new SkillRuntime();
    await rt.initialize();
    const matched = rt.resolveSkills("Review React component");
    expect(matched.map((s) => s.definition.id)).toContain("react-review");
  });

  it("resolveSkills emits resolved events", async () => {
    const rt = new SkillRuntime();
    await rt.initialize();
    const events: string[] = [];
    rt.subscribe((e) => events.push(e.type));
    rt.resolveSkills("TypeScript refactor");
    expect(events.some((e) => e === "skill.resolved")).toBe(true);
  });

  it("buildSkillSection produces formatted output", async () => {
    const rt = new SkillRuntime();
    await rt.initialize();
    const skills = rt.resolveSkills("React");
    const section = rt.buildSkillSection(skills);
    expect(section).toContain("=== Skills ===");
    expect(section).toContain("React Review");
  });

  it("reloadSkill refreshes and emits reloaded event", async () => {
    const rt = new SkillRuntime();
    await rt.initialize();
    const events: string[] = [];
    rt.subscribe((e) => events.push(e.type));
    await rt.reloadSkill("react-review");
    expect(events.some((e) => e === "skill.reloaded")).toBe(true);
  });

  it("unloadSkill removes and emits unloaded event", async () => {
    const rt = new SkillRuntime();
    await rt.initialize();
    const events: string[] = [];
    rt.subscribe((e) => events.push(e.type));
    rt.unloadSkill("bug-hunter");
    expect(events.some((e) => e === "skill.unloaded")).toBe(true);
    expect(rt.registry.has("bug-hunter")).toBe(false);
  });

  it("reloadAll reinitializes all skills", async () => {
    const rt = new SkillRuntime();
    await rt.initialize();
    rt.registry.unregister("react-review");
    expect(rt.registry.size).toBe(2);
    await rt.reloadAll();
    expect(rt.registry.size).toBeGreaterThanOrEqual(3);
  });

  it("empty skill section for no skills", () => {
    const rt = new SkillRuntime();
    expect(rt.buildSkillSection([])).toBe("");
  });
});
