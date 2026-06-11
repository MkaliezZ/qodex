import type { LoadedSkill } from "../models/skill.js";

export class SkillResolver {
  /**
   * Match a prompt against loaded skills using keyword matching.
   *
   * Simple approach: check if any skill's keywords (name, description, tags)
   * appear in the user's prompt.
   *
   * No embeddings, no semantic search, no LLM classification.
   */
  resolve(prompt: string, skills: LoadedSkill[]): LoadedSkill[] {
    if (!prompt || skills.length === 0) return [];

    const lowerPrompt = prompt.toLowerCase();
    const matched: LoadedSkill[] = [];

    for (const skill of skills) {
      if (!skill.definition.enabled) continue;

      const keywords = [
        skill.definition.name,
        skill.definition.description,
        ...skill.definition.tags,
      ].map((k) => k.toLowerCase());

      const matches = keywords.some((kw) => lowerPrompt.includes(kw));
      if (matches) matched.push(skill);
    }

    return matched;
  }

  /**
   * Check if a specific skill id is relevant to the prompt.
   */
  matches(prompt: string, skillId: string, skills: LoadedSkill[]): boolean {
    const skill = skills.find((s) => s.definition.id === skillId);
    if (!skill) return false;
    return this.resolve(prompt, [skill]).length > 0;
  }
}
