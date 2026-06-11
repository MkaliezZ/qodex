import { describe, it, expect } from "vitest";
import { SkillLoader, BuiltInDataProvider } from "../src/index.js";

describe("SkillLoader", () => {
  it("loads a built-in skill by id", async () => {
    const loader = new SkillLoader();
    const skill = await loader.loadSkill("react-review");
    expect(skill.definition.id).toBe("react-review");
    expect(skill.definition.name).toBe("React Review");
    expect(skill.content.length).toBeGreaterThan(0);
  });

  it("loads all built-in skills", async () => {
    const loader = new SkillLoader();
    const skills = await loader.loadAllSkills();
    expect(skills.length).toBeGreaterThanOrEqual(3);
    expect(skills.map((s) => s.definition.id)).toContain("react-review");
    expect(skills.map((s) => s.definition.id)).toContain("typescript-refactor");
  });

  it("caches loaded skills", async () => {
    const loader = new SkillLoader();
    expect(loader.isCached("react-review")).toBe(false);
    await loader.loadSkill("react-review");
    expect(loader.isCached("react-review")).toBe(true);
  });

  it("reloadSkill refreshes cache", async () => {
    const loader = new SkillLoader();
    await loader.loadSkill("react-review");
    expect(loader.isCached("react-review")).toBe(true);
    await loader.reloadSkill("react-review");
    expect(loader.isCached("react-review")).toBe(true);
  });

  it("clearCache removes cached entries", async () => {
    const loader = new SkillLoader();
    await loader.loadSkill("react-review");
    loader.clearCache();
    expect(loader.isCached("react-review")).toBe(false);
  });

  it("throws for unknown skill", async () => {
    const loader = new SkillLoader();
    await expect(loader.loadSkill("nonexistent")).rejects.toThrow("not found");
  });

  it("handles custom provider", async () => {
    const provider: any = {
      listSkills: async () => ["custom"],
      loadJson: async () => ({ id: "custom", name: "Custom", description: "A custom skill", version: "1.0", tags: [], enabled: true }),
      loadMd: async () => "# Custom Skill",
    };
    const loader = new SkillLoader(provider);
    const skill = await loader.loadSkill("custom");
    expect(skill.definition.name).toBe("Custom");
  });
});
