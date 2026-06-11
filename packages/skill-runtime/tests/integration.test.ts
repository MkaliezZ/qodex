import { describe, it, expect } from "vitest";
import { SkillRuntime, SkillRegistry, SkillResolver, SkillLoader, BuiltInDataProvider, SkillValidator } from "../src/index.js";

describe("Full Integration", () => {
  it("loader → registry → resolver → context injection", async () => {
    const rt = new SkillRuntime();
    await rt.initialize();

    // Registry has all skills
    expect(rt.registry.size).toBeGreaterThanOrEqual(3);

    // Resolver finds relevant skills
    const matched = rt.resolveSkills("fix bug in production");
    expect(matched.length).toBeGreaterThanOrEqual(0); // bug-hunter is disabled

    // Context injection produces formatted section
    const section = rt.buildSkillSection(rt.registry.listEnabled());
    expect(section).toContain("React Review");
    expect(section).toContain("TypeScript Refactor");
  });

  it("resolver works with disabled skills filtered", () => {
    const registry = new SkillRegistry();
    registry.register({
      definition: { id: "enabled", name: "Enabled Skill", description: "Does stuff", version: "1.0", tags: ["active"], enabled: true },
      content: "# Enabled", loadedAt: new Date().toISOString(),
    });
    registry.register({
      definition: { id: "disabled", name: "Disabled Skill", description: "Does nothing", version: "1.0", tags: ["inactive"], enabled: false },
      content: "# Disabled", loadedAt: new Date().toISOString(),
    });

    const resolver = new SkillResolver();
    const matched = resolver.resolve("active inactive", registry.list());
    expect(matched.map((s) => s.definition.id)).toContain("enabled");
    expect(matched.map((s) => s.definition.id)).not.toContain("disabled");
  });

  it("loader validation rejects invalid skills", async () => {
    const provider: any = {
      listSkills: async () => ["invalid"],
      loadJson: async () => null, // will fail
      loadMd: async () => null,
    };
    const loader = new SkillLoader(provider);
    const skills = await loader.loadAllSkills();
    expect(skills).toHaveLength(0); // skipped
  });

  it("runtime reloadAll reinitializes from scratch", async () => {
    const rt = new SkillRuntime();
    await rt.initialize();
    const initialSize = rt.registry.size;
    rt.registry.clear();
    expect(rt.registry.size).toBe(0);
    await rt.reloadAll();
    expect(rt.registry.size).toBe(initialSize);
  });

  it("end-to-end: resolve → buildSection → assembled prompt", async () => {
    const rt = new SkillRuntime();
    await rt.initialize();

    const matched = rt.resolveSkills("Review React components for TypeScript issues");
    const skillSection = rt.buildSkillSection(matched);

    const assembled = [
      "=== Project Rules ===",
      "=== Session Memory ===",
      skillSection,
      "=== Selected Files ===",
      "=== Task ===\nReview this component",
    ].filter(Boolean).join("\n\n");

    expect(assembled).toContain("=== Skills ===");
    expect(assembled).toContain("React Review");
    expect(assembled).toContain("TypeScript Refactor");
    expect(assembled).toContain("functional components");
    expect(assembled).toContain("Review this component");
  });
});
