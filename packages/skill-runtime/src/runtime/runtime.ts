import { SkillLoader } from "../loaders/loader.js";
import type { SkillDataProvider } from "../loaders/loader.js";
import { SkillRegistry } from "../registry/registry.js";
import { SkillResolver } from "../resolver/resolver.js";
import type { LoadedSkill, SkillEvent } from "../models/skill.js";

type EventHandler = (event: SkillEvent) => void;

export class SkillRuntime {
  readonly loader: SkillLoader;
  readonly registry: SkillRegistry;
  readonly resolver: SkillResolver;
  private handlers = new Set<EventHandler>();

  constructor(provider?: SkillDataProvider) {
    this.loader = new SkillLoader(provider);
    this.registry = new SkillRegistry();
    this.resolver = new SkillResolver();
  }

  async initialize(): Promise<void> {
    try {
      const skills = await this.loader.loadAllSkills();
      for (const skill of skills) {
        this.registry.register(skill);
        this.emit("skill.loaded", { id: skill.definition.id, name: skill.definition.name });
      }
    } catch {
      // Silently continue — no skills loaded
    }
  }

  async reloadSkill(id: string): Promise<LoadedSkill> {
    const skill = await this.loader.reloadSkill(id);
    this.registry.register(skill);
    this.emit("skill.reloaded", { id, name: skill.definition.name });
    return skill;
  }

  async reloadAll(): Promise<void> {
    this.loader.clearCache();
    this.registry.clear();
    await this.initialize();
  }

  unloadSkill(id: string): void {
    this.registry.unregister(id);
    this.loader.clearCache();
    this.emit("skill.unloaded", { id });
  }

  resolveSkills(prompt: string): LoadedSkill[] {
    const matched = this.resolver.resolve(prompt, this.registry.listEnabled());
    for (const skill of matched) {
      this.emit("skill.resolved", { id: skill.definition.id, name: skill.definition.name });
    }
    return matched;
  }

  buildSkillSection(skills: LoadedSkill[]): string {
    if (skills.length === 0) return "";
    const parts: string[] = [];
    parts.push("=== Skills ===");
    parts.push("");
    for (const skill of skills) {
      parts.push(`Skill: ${skill.definition.name}`);
      parts.push(`Description: ${skill.definition.description}`);
      parts.push("");
      parts.push(skill.content);
      parts.push("---");
      parts.push("");
    }
    return parts.join("\n");
  }

  subscribe(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private emit(type: SkillEvent["type"], payload: Record<string, unknown>): void {
    const event: SkillEvent = { type, payload, timestamp: new Date().toISOString() };
    for (const h of this.handlers) { try { h(event); } catch { /* swallow */ } }
  }
}
