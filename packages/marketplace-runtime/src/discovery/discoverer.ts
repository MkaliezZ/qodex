import { existsSync, readdirSync, statSync } from "fs";
import { AdapterRegistry } from "../adapters/adapters.js";
import type { SkillManifestV1 } from "../models/manifest.js";

export class SkillDiscoverer {
  constructor(private adapterRegistry: AdapterRegistry) {}
  async discover(dirPath: string): Promise<SkillManifestV1[]> {
    if (!existsSync(dirPath)) return [];
    const results: SkillManifestV1[] = [];
    // Single skill directory (has skill.json or SKILL.md)
    const adapter = await this.adapterRegistry.getAdapter(dirPath);
    if (adapter) {
      const imported = await adapter.import(dirPath);
      results.push(imported.manifest);
    } else {
      // Multi-skill directory
      try {
        for (const entry of readdirSync(dirPath)) {
          const full = `${dirPath}/${entry}`;
          if (statSync(full).isDirectory()) {
            const sub = await this.adapterRegistry.getAdapter(full);
            if (sub) {
              const imp = await sub.import(full);
              results.push(imp.manifest);
            }
          }
        }
      } catch { /* skip */ }
    }
    return results;
  }
}
