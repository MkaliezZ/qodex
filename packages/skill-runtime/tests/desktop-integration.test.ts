import { describe, it, expect } from "vitest";
import { SkillRuntime, SkillRegistry } from "../src/index.js";
import type { LoadedSkill } from "../src/index.js";

describe("Desktop Integration Patterns", () => {
  it("runtime exposes loaded skill list for UI", async () => {
    const rt = new SkillRuntime();
    await rt.initialize();
    const skills = rt.registry.list();
    expect(skills.length).toBeGreaterThan(0);
    for (const s of skills) {
      expect(s.definition.name).toBeTruthy();
      expect(s.definition.description).toBeTruthy();
    }
  });

  it("resolved skills displayable in Context Panel", async () => {
    const rt = new SkillRuntime();
    await rt.initialize();
    const resolved = rt.resolveSkills("react frontend review");
    const display = resolved.map((s) => ({
      id: s.definition.id,
      name: s.definition.name,
      enabled: s.definition.enabled,
    }));
    expect(display.length).toBeGreaterThan(0);
    expect(display[0].id).toBe("react-review");
  });

  it("enabled count accessible for UI badge", async () => {
    const r = new SkillRegistry();
    r.register({ definition: { id: "a", name: "A", description: "", version: "1", tags: [], enabled: true }, content: "", loadedAt: "now" });
    r.register({ definition: { id: "b", name: "B", description: "", version: "1", tags: [], enabled: false }, content: "", loadedAt: "now" });
    expect(r.listEnabled().length).toBe(1);
  });

  it("skill section can be injected into ContextBundle", async () => {
    const rt = new SkillRuntime();
    await rt.initialize();
    const skills = rt.resolveSkills("react");
    const section = rt.buildSkillSection(skills);
    const fullPrompt = [
      "=== Project Rules ===",
      "=== Session Memory ===",
      section,
      "=== Task ===\nReview this component",
    ].filter(Boolean).join("\n\n");
    expect(fullPrompt).toContain("React Review");
  });
});
