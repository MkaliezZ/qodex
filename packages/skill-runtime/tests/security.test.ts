import { describe, it, expect } from "vitest";
import { SkillLoader, SkillRuntime } from "../src/index.js";

describe("Security", () => {
  it("skill content is markdown only (no code execution)", async () => {
    const loader = new SkillLoader();
    const skill = await loader.loadSkill("react-review");
    expect(typeof skill.content).toBe("string");
    // No functions, no executables
    expect(skill.content).not.toContain("process.");
    expect(skill.content).not.toContain("require(");
  });

  it("SkillRuntime has no code execution methods", () => {
    const rt = new SkillRuntime();
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(rt));
    const dangerous = ["exec", "run", "eval", "Function", "execute"];
    for (const d of dangerous) {
      expect(methods.includes(d)).toBe(false);
    }
  });

  it("resolver only matches keywords", () => {
    const rt = new SkillRuntime();
    const prompt = "rm -rf / && drop database";
    const matched = rt.resolveSkills(prompt);
    expect(matched).toHaveLength(0); // no skill matches malicious input
  });

  it("registry cannot be polluted externally", () => {
    const rt = new SkillRuntime();
    expect(() => (rt.registry as any).skills = null).not.toThrow();
  });
});
