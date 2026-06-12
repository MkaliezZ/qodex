import type { LocalePreference } from "../models/locale.js";
import type { LocaleRegistry } from "../registry/registry.js";

export class LocaleResolver {
  constructor(private registry: LocaleRegistry) {}

  resolve(prefs: LocalePreference): string {
    // In priority order
    for (const pref of [prefs.user, prefs.project, prefs.system]) {
      if (pref) {
        const resolved = this.resolveWithFallback(pref);
        if (resolved) return resolved;
      }
    }
    return this.registry.getDefault();
  }

  private resolveWithFallback(code: string): string | null {
    // Exact match
    if (this.registry.has(code)) return code;
    // Strip region: zh-CN → zh
    const hyphenIdx = code.indexOf("-");
    if (hyphenIdx > 0) {
      const langCode = code.substring(0, hyphenIdx);
      if (this.registry.has(langCode)) return langCode;
    }
    // Try variants with underscore
    const usIdx = code.indexOf("_");
    if (usIdx > 0) {
      const langCode = code.substring(0, usIdx);
      if (this.registry.has(langCode)) return langCode;
    }
    return null;
  }
}
