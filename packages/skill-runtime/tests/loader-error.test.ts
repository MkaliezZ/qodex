import { describe, it, expect } from "vitest";
import { SkillLoader } from "../src/index.js";

describe("Loader Error Handling", () => {
  it("throws for invalid definition", async () => {
    const provider: any = {
      listSkills: async () => ["bad"],
      loadJson: async () => ({ id: "", name: "", description: "", version: "", tags: [], enabled: true }),
      loadMd: async () => "",
    };
    const loader = new SkillLoader(provider);
    await expect(loader.loadSkill("bad")).rejects.toThrow("validation failed");
  });

  it("handles provider throwing on list", async () => {
    const provider: any = {
      listSkills: async () => { throw new Error("disk error"); },
      loadJson: async () => null,
      loadMd: async () => null,
    };
    const loader = new SkillLoader(provider);
    await expect(loader.loadAllSkills()).rejects.toThrow("disk error");
  });

  it("handles provider throwing on loadJson", async () => {
    const provider: any = {
      listSkills: async () => ["err"],
      loadJson: async () => { throw new Error("read error"); },
      loadMd: async () => null,
    };
    const loader = new SkillLoader(provider);
    await expect(loader.loadSkill("err")).rejects.toThrow();
  });
});
