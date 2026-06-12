import type { SkillAdapter } from "../models/adapter.js";
import { validateManifest } from "../manifest/schema.js";
import type { SkillManifestV1 } from "../models/manifest.js";
import { existsSync, readFileSync } from "fs";

export class QodexNativeAdapter implements SkillAdapter {
  format = "qodex-native"; version = "1.0.0";
  async canHandle(dirPath: string): Promise<boolean> {
    try { return existsSync(`${dirPath}/skill.json`) && existsSync(`${dirPath}/SKILL.md`); }
    catch { return false; }
  }
  async import(dirPath: string): Promise<{ manifest: SkillManifestV1; skillContent: string }> {
    const raw = readFileSync(`${dirPath}/skill.json`, "utf-8");
    const parsed = JSON.parse(raw);
    const result = validateManifest(parsed);
    if (!result.valid || !result.manifest) throw new Error(`Invalid skill.json: ${result.errors.join(", ")}`);
    const skillContent = readFileSync(`${dirPath}/SKILL.md`, "utf-8");
    return { manifest: result.manifest, skillContent };
  }
}

export class OpenClawAdapter implements SkillAdapter {
  format = "openclaw"; version = "1.0.0";
  async canHandle(dirPath: string): Promise<boolean> {
    try { return existsSync(`${dirPath}/SKILL.md`) && !existsSync(`${dirPath}/skill.json`); }
    catch { return false; }
  }
  async import(dirPath: string): Promise<{ manifest: SkillManifestV1; skillContent: string }> {
    const content = readFileSync(`${dirPath}/SKILL.md`, "utf-8");
    const nameMatch = content.match(/^#\s+(.+)/m);
    const name = nameMatch ? nameMatch[1].trim() : "Imported Skill";
    return { manifest: { id: `openclaw-${Date.now()}`, name, description: name, version: "1.0.0", author: "openclaw-import", license: "MIT", tags: [], compatibility: { qodex: ">=0.1.0", source: "openclaw" } }, skillContent: content };
  }
}

export class ClaudeCodeAdapter implements SkillAdapter {
  format = "claude-code"; version = "1.0.0";
  async canHandle(dirPath: string): Promise<boolean> {
    try { return existsSync(`${dirPath}/CLAUDE.md`); }
    catch { return false; }
  }
  async import(dirPath: string): Promise<{ manifest: SkillManifestV1; skillContent: string }> {
    const content = readFileSync(`${dirPath}/CLAUDE.md`, "utf-8");
    const nameMatch = content.match(/^#\s+(.+)/m);
    const name = nameMatch ? nameMatch[1].trim() : "Imported Claude Skill";
    return { manifest: { id: `claude-${Date.now()}`, name, description: name, version: "1.0.0", author: "claude-import", license: "MIT", tags: [], compatibility: { qodex: ">=0.1.0", source: "claude-code" } }, skillContent: content };
  }
}

export class AdapterRegistry {
  private adapters: SkillAdapter[] = [];
  register(adapter: SkillAdapter): void { this.adapters.push(adapter); }
  async detectFormat(dirPath: string): Promise<string | null> {
    for (const a of this.adapters) { if (await a.canHandle(dirPath)) return a.format; }
    return null;
  }
  async getAdapter(dirPath: string): Promise<SkillAdapter | null> {
    for (const a of this.adapters) { if (await a.canHandle(dirPath)) return a; }
    return null;
  }
}
