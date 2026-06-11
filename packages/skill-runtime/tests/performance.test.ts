import { describe, it, expect } from "vitest";
import { SkillRegistry, SkillResolver, SkillRuntime } from "../src/index.js";
import type { LoadedSkill } from "../src/index.js";

describe("Performance & Scale", () => {
  it("resolver handles 100 skills", () => {
    const resolver = new SkillResolver();
    const skills: LoadedSkill[] = Array.from({ length: 100 }, (_, i) => ({
      definition: { id: `s${i}`, name: `Skill ${i}`, description: `Does something about react and typescript`, version: "1.0", tags: ["react", "typescript"], enabled: true },
      content: "# content", loadedAt: "now",
    }));
    const matched = resolver.resolve("react typescript", skills);
    expect(matched.length).toBe(100);
  });

  it("resolver handles large prompt", () => {
    const resolver = new SkillResolver();
    const skills: LoadedSkill[] = [{ definition: { id: "ts", name: "TypeScript", description: "TypeScript helper", version: "1", tags: ["typescript"], enabled: true }, content: "", loadedAt: "now" }];
    const largePrompt = "a".repeat(10000) + " typescript";
    const matched = resolver.resolve(largePrompt, skills);
    expect(matched.length).toBe(1);
  });

  it("runtime initialize with many skills", async () => {
    const provider: any = {
      listSkills: async () => Array.from({ length: 50 }, (_, i) => `skill-${i}`),
      loadJson: async (id: string) => ({ id, name: id, description: "test", version: "1.0", tags: [], enabled: true }),
      loadMd: async () => "# content",
    };
    const rt = new SkillRuntime(provider);
    await rt.initialize();
    expect(rt.registry.size).toBe(50);
  });

  it("registry handles 500 registrations", () => {
    const r = new SkillRegistry();
    for (let i = 0; i < 500; i++) {
      r.register({ definition: { id: String(i), name: String(i), description: "x", version: "1", tags: [], enabled: true }, content: "", loadedAt: "now" });
    }
    expect(r.size).toBe(500);
    expect(r.list()).toHaveLength(500);
  });
});
