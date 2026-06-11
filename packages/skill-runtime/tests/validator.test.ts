import { describe, it, expect } from "vitest";
import { SkillValidator } from "../src/index.js";
import type { SkillDefinition } from "../src/index.js";

describe("SkillValidator", () => {
  const v = new SkillValidator();

  it("passes valid definition", () => {
    const def: SkillDefinition = { id: "test", name: "Test", description: "A test", version: "1.0", tags: ["test"], enabled: true };
    expect(v.isValid(def)).toBe(true);
    expect(v.validate(def)).toHaveLength(0);
  });

  it("rejects missing id", () => {
    const def: any = { name: "Test", description: "...", version: "1.0", tags: [], enabled: true };
    expect(v.isValid(def)).toBe(false);
  });

  it("rejects missing name", () => {
    const def: any = { id: "t", description: "...", version: "1.0", tags: [], enabled: true };
    expect(v.isValid(def)).toBe(false);
  });

  it("rejects missing version", () => {
    const def: any = { id: "t", name: "Test", description: "...", tags: [], enabled: true };
    expect(v.isValid(def)).toBe(false);
  });

  it("rejects missing description", () => {
    const def: any = { id: "t", name: "Test", version: "1.0", tags: [], enabled: true };
    expect(v.isValid(def)).toBe(false);
  });

  it("rejects non-array tags", () => {
    const def: any = { id: "t", name: "Test", description: "...", version: "1.0", tags: "not-array", enabled: true };
    expect(v.isValid(def)).toBe(false);
  });

  it("rejects non-boolean enabled", () => {
    const def: any = { id: "t", name: "Test", description: "...", version: "1.0", tags: [], enabled: "yes" };
    expect(v.isValid(def)).toBe(false);
  });
});
