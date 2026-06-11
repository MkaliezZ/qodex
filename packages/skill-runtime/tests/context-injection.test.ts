import { describe, it, expect } from "vitest";
import { SkillRuntime } from "../src/index.js";

describe("Context Injection (simulated ContextEngine integration)", () => {
  it("skill section fits between memory and files in assembly order", async () => {
    const rt = new SkillRuntime();
    await rt.initialize();

    const skills = rt.resolveSkills("TypeScript");
    const skillSection = rt.buildSkillSection(skills);

    // Simulate ContextEngine assembly order
    const parts = [
      "=== Project Rules ===",
      "=== Session Memory ===",
      skillSection,
      "=== Project Metadata ===",
      "=== Selected Files ===",
      "=== Task ===",
    ].filter(Boolean);

    const assembled = parts.join("\n\n");

    // Skills is between Memory and Metadata
    const rulesIdx = assembled.indexOf("Project Rules");
    const memoryIdx = assembled.indexOf("Session Memory");
    const skillsIdx = assembled.indexOf("Skills");
    const metaIdx = assembled.indexOf("Project Metadata");
    const filesIdx = assembled.indexOf("Selected Files");
    const taskIdx = assembled.indexOf("Task");

    expect(rulesIdx).toBeLessThan(memoryIdx);
    expect(memoryIdx).toBeLessThan(skillsIdx);
    expect(skillsIdx).toBeLessThan(metaIdx);
    expect(metaIdx).toBeLessThan(filesIdx);
    expect(filesIdx).toBeLessThan(taskIdx);

    // Skill content is present
    expect(assembled).toContain("TypeScript Refactor");
  });

  it("buildSkillSection handles multiple skills", async () => {
    const rt = new SkillRuntime();
    await rt.initialize();
    const skills = rt.resolveSkills("refactor React typescript");
    const section = rt.buildSkillSection(skills);
    expect(section).toContain("=== Skills ===");
    expect(skills.length).toBeGreaterThanOrEqual(1);
  });

  it("resolved skills appear in skill section", async () => {
    const rt = new SkillRuntime();
    await rt.initialize();
    const skills = rt.resolveSkills("review react");
    const section = rt.buildSkillSection(skills);
    expect(section).toContain("React Review");
    expect(section).toContain("functional components");
  });
});
