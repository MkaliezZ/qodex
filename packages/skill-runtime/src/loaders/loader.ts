import type { SkillDefinition, LoadedSkill } from "../models/skill.js";
import { SkillValidator } from "../validators/validator.js";

export interface SkillDataProvider {
  listSkills(): Promise<string[]>;
  loadJson(id: string): Promise<SkillDefinition | null>;
  loadMd(id: string): Promise<string | null>;
}

const BUILT_IN_SKILLS: SkillDefinition[] = [
  { id: "react-review", name: "React Review", description: "Review React components for consistency, performance, and best practices.", version: "1.0.0", tags: ["react", "review", "frontend"], enabled: true },
  { id: "typescript-refactor", name: "TypeScript Refactor", description: "Refactor TypeScript code for better type safety and readability.", version: "1.0.0", tags: ["typescript", "refactor"], enabled: true },
  { id: "bug-hunter", name: "Bug Hunter", description: "Analyze code for common bugs, edge cases, and runtime errors.", version: "1.0.0", tags: ["debug", "testing"], enabled: false },
];

const BUILT_IN_CONTENT: Record<string, string> = {
  "react-review": "# React Review Skill\nReview React components.\n## Guidelines\n- Use functional components with hooks.\n- Prefer TypeScript strict mode.\n",
  "typescript-refactor": "# TypeScript Refactor Skill\nRefactor TypeScript code.\n## Guidelines\n- Prefer interfaces over type aliases.\n- Avoid `any`.\n",
  "bug-hunter": "# Bug Hunter Skill\nAnalyze code for bugs.\n## Guidelines\n- Check for null/undefined access.\n- Verify array bounds.\n",
};

export class BuiltInDataProvider implements SkillDataProvider {
  async listSkills(): Promise<string[]> {
    return BUILT_IN_SKILLS.map((s) => s.id);
  }
  async loadJson(id: string): Promise<SkillDefinition | null> {
    return BUILT_IN_SKILLS.find((s) => s.id === id) ?? null;
  }
  async loadMd(id: string): Promise<string | null> {
    return BUILT_IN_CONTENT[id] ?? null;
  }
}

export class SkillLoader {
  private provider: SkillDataProvider;
  private validator: SkillValidator;
  private cache = new Map<string, LoadedSkill>();

  constructor(provider?: SkillDataProvider, validator?: SkillValidator) {
    this.provider = provider ?? new BuiltInDataProvider();
    this.validator = validator ?? new SkillValidator();
  }

  async loadSkill(id: string): Promise<LoadedSkill> {
    const cached = this.cache.get(id);
    if (cached) return cached;

    const def = await this.provider.loadJson(id);
    if (!def) throw new Error(`Skill "${id}" not found`);

    const errors = this.validator.validate(def);
    if (errors.length > 0) {
      throw new Error(`Skill "${id}" validation failed: ${errors.map((e) => e.message).join("; ")}`);
    }

    const content = (await this.provider.loadMd(id)) ?? "";
    const loaded: LoadedSkill = { definition: def, content, loadedAt: new Date().toISOString() };
    this.cache.set(id, loaded);
    return loaded;
  }

  async loadAllSkills(): Promise<LoadedSkill[]> {
    const ids = await this.provider.listSkills();
    const results: LoadedSkill[] = [];
    for (const id of ids) {
      try { results.push(await this.loadSkill(id)); } catch { /* skip invalid */ }
    }
    return results;
  }

  async reloadSkill(id: string): Promise<LoadedSkill> {
    this.cache.delete(id);
    return this.loadSkill(id);
  }

  clearCache(): void { this.cache.clear(); }
  isCached(id: string): boolean { return this.cache.has(id); }
}
