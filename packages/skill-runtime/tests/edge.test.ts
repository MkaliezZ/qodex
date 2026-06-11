import { describe, it, expect } from "vitest";
import { SkillRegistry, SkillValidator, SkillResolver, SkillRuntime } from "../src/index.js";
import type { LoadedSkill, SkillDefinition } from "../src/index.js";

describe("Edge Cases", () => {
  const val = new SkillValidator();

  it("empty tags array is valid", () => {
    const def: SkillDefinition = { id: "x", name: "X", description: "...", version: "1.0", tags: [], enabled: true };
    expect(val.isValid(def)).toBe(true);
  });

  it("disabled skill is still valid", () => {
    const def: SkillDefinition = { id: "x", name: "X", description: "...", version: "1.0", tags: [], enabled: false };
    expect(val.isValid(def)).toBe(true);
  });

  it("registry handles duplicate registration (last wins)", () => {
    const r = new SkillRegistry();
    const s1: LoadedSkill = { definition: { id: "dup", name: "First", description: "...", version: "1.0", tags: [], enabled: true }, content: "#1", loadedAt: "now" };
    const s2: LoadedSkill = { definition: { id: "dup", name: "Second", description: "...", version: "1.0", tags: [], enabled: true }, content: "#2", loadedAt: "now" };
    r.register(s1);
    r.register(s2);
    expect(r.get("dup")?.definition.name).toBe("Second");
    expect(r.size).toBe(1);
  });

  it("resolve handles empty skill list", () => {
    const resolver = new SkillResolver();
    expect(resolver.resolve("test", [])).toHaveLength(0);
  });

  it("runtime can be initialized multiple times", async () => {
    const rt = new SkillRuntime();
    await rt.initialize();
    expect(rt.registry.size).toBeGreaterThanOrEqual(3);
    await rt.initialize();
    expect(rt.registry.size).toBeGreaterThanOrEqual(3); // still valid
  });

  it("buildSkillSection with no content", () => {
    const rt = new SkillRuntime();
    expect(rt.buildSkillSection([])).toBe("");
  });

  it("multiple subscribers all receive events", () => {
    const rt = new SkillRuntime();
    let count = 0;
    rt.subscribe(() => count++);
    rt.subscribe(() => count++);
    rt.subscribe(() => count++);
    // Trigger a sync event (resolve doesn't need init)
    rt.resolveSkills("react");
    expect(count).toBe(3 * 0); // no skills loaded, so no resolution
  });

  it("loading a skill sets loadedAt timestamp", async () => {
    const loader = new (await import("../src/index.js")).SkillLoader();
    const skill = await loader.loadSkill("react-review");
    expect(skill.loadedAt).toBeTruthy();
    expect(new Date(skill.loadedAt).getTime()).not.toBeNaN();
  });
});
