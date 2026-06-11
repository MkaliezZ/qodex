import { describe, it, expect } from "vitest";
import { SkillResolver, SkillRegistry } from "../src/index.js";
import type { LoadedSkill } from "../src/index.js";

function skill(id: string, name: string, tags: string[], enabled = true, desc?: string): LoadedSkill {
  return {
    definition: { id, name, description: desc ?? `Does ${name}`, version: "1.0", tags, enabled },
    content: "# content",
    loadedAt: new Date().toISOString(),
  };
}

describe("SkillResolver", () => {
  const resolver = new SkillResolver();

  const skills = [
    skill("react-review", "React Review", ["react", "frontend", "components"]),
    skill("ts-refactor", "TypeScript Refactor", ["typescript", "refactor"]),
    skill("bug-hunter", "Bug Hunter", ["debug", "edge-cases", "bugs"], false), // disabled
  ];

  it("matches react-review for prompt mentioning react", () => {
    const matched = resolver.resolve("Review this React component", skills);
    expect(matched.map((s) => s.definition.id)).toContain("react-review");
  });

  it("matches ts-refactor for prompt mentioning typescript", () => {
    const matched = resolver.resolve("Refactor TypeScript service", skills);
    expect(matched.map((s) => s.definition.id)).toContain("ts-refactor");
  });

  it("does not match disabled skills", () => {
    const matched = resolver.resolve("debug this bug", skills);
    expect(matched.map((s) => s.definition.id)).not.toContain("bug-hunter");
  });

  it("returns empty for unrelated prompt", () => {
    const matched = resolver.resolve("Hello world", skills);
    expect(matched).toHaveLength(0);
  });

  it("returns empty for empty prompt", () => {
    expect(resolver.resolve("", skills)).toHaveLength(0);
  });

  it("matches returns true for matching skill", () => {
    expect(resolver.matches("Review React", "react-review", skills)).toBe(true);
  });

  it("matches returns false for non-matching skill", () => {
    expect(resolver.matches("Hello", "react-review", skills)).toBe(false);
  });

  it("matches returns false for unknown skill id", () => {
    expect(resolver.matches("anything", "ghost", skills)).toBe(false);
  });

  it("matches multiple skills", () => {
    const matched = resolver.resolve("refactor React component and fix TypeScript types", skills);
    expect(matched.length).toBeGreaterThanOrEqual(2);
  });
});
