import type { LoadedSkill } from "../models/skill.js";

export class SkillRegistry {
  private skills = new Map<string, LoadedSkill>();

  register(skill: LoadedSkill): void {
    this.skills.set(skill.definition.id, skill);
  }

  unregister(id: string): boolean {
    return this.skills.delete(id);
  }

  get(id: string): LoadedSkill | undefined {
    return this.skills.get(id);
  }

  list(): LoadedSkill[] {
    return Array.from(this.skills.values());
  }

  listEnabled(): LoadedSkill[] {
    return this.list().filter((s) => s.definition.enabled);
  }

  has(id: string): boolean {
    return this.skills.has(id);
  }

  clear(): void {
    this.skills.clear();
  }

  get size(): number {
    return this.skills.size;
  }
}
