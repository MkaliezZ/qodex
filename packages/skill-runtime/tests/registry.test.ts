import { describe, it, expect } from "vitest";
import { SkillRegistry } from "../src/index.js";
import type { LoadedSkill } from "../src/index.js";

function makeSkill(id: string, enabled = true): LoadedSkill {
  return { definition: { id, name: id, description: "test", version: "1.0", tags: [], enabled }, content: "# test", loadedAt: new Date().toISOString() };
}

describe("SkillRegistry", () => {
  it("starts empty", () => {
    const r = new SkillRegistry();
    expect(r.size).toBe(0);
  });

  it("registers a skill", () => {
    const r = new SkillRegistry();
    r.register(makeSkill("test"));
    expect(r.size).toBe(1);
    expect(r.has("test")).toBe(true);
  });

  it("gets a registered skill", () => {
    const r = new SkillRegistry();
    r.register(makeSkill("my-skill"));
    expect(r.get("my-skill")?.definition.id).toBe("my-skill");
  });

  it("unregisters a skill", () => {
    const r = new SkillRegistry();
    r.register(makeSkill("remove-me"));
    expect(r.unregister("remove-me")).toBe(true);
    expect(r.size).toBe(0);
  });

  it("list returns all skills", () => {
    const r = new SkillRegistry();
    r.register(makeSkill("a"));
    r.register(makeSkill("b"));
    expect(r.list()).toHaveLength(2);
  });

  it("listEnabled filters disabled skills", () => {
    const r = new SkillRegistry();
    r.register(makeSkill("enabled", true));
    r.register(makeSkill("disabled", false));
    expect(r.listEnabled()).toHaveLength(1);
    expect(r.listEnabled()[0].definition.id).toBe("enabled");
  });

  it("clear removes all", () => {
    const r = new SkillRegistry();
    r.register(makeSkill("a"));
    r.register(makeSkill("b"));
    r.clear();
    expect(r.size).toBe(0);
  });
});
