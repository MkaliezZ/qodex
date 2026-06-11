export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  tags: string[];
  enabled: boolean;
}

export interface LoadedSkill {
  definition: SkillDefinition;
  content: string;
  loadedAt: string;
}

export interface SkillEvent {
  type: "skill.loaded" | "skill.reloaded" | "skill.resolved" | "skill.unloaded";
  payload: Record<string, unknown>;
  timestamp: string;
}
