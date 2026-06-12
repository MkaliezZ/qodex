import type { TranslationBundle, TranslationResult } from "../models/bundle.js";
import type { LocaleRegistry } from "../registry/registry.js";

export class FallbackEngine {
  private bundles = new Map<string, TranslationBundle>(); // key = `${locale}:${namespace}`
  constructor(private registry: LocaleRegistry) {}

  loadBundle(bundle: TranslationBundle): void {
    this.bundles.set(`${bundle.locale}:${bundle.namespace}`, bundle);
  }

  getBundles(locale: string): TranslationBundle[] {
    return Array.from(this.bundles.values()).filter((b) => b.locale === locale);
  }

  resolve(key: string, requestedLocale: string, namespace: string): TranslationResult {
    // Try requested locale first
    const direct = this.lookup(key, requestedLocale, namespace);
    if (direct) return { value: direct, sourceLocale: requestedLocale, fallbackUsed: false };

    // Try stripping region
    const hyphenIdx = requestedLocale.indexOf("-");
    if (hyphenIdx > 0) {
      const lang = requestedLocale.substring(0, hyphenIdx);
      const langMatch = this.lookup(key, lang, namespace);
      if (langMatch) return { value: langMatch, sourceLocale: lang, fallbackUsed: true };
    }

    // Fall back to default
    const def = this.lookup(key, this.registry.getDefault(), namespace);
    if (def) return { value: def, sourceLocale: this.registry.getDefault(), fallbackUsed: true };

    // Absolute last resort: return the key itself
    return { value: key, sourceLocale: "none", fallbackUsed: true };
  }

  private lookup(key: string, locale: string, namespace: string): string | null {
    const bundle = this.bundles.get(`${locale}:${namespace}`);
    if (!bundle) return null;

    // Support dot-notation keys
    const parts = key.split(".");
    let current: unknown = bundle.entries;
    for (const part of parts) {
      if (typeof current !== "object" || current === null) return null;
      current = (current as Record<string, unknown>)[part];
    }
    return typeof current === "string" ? current : null;
  }

  getAllKeys(locale: string, namespace: string): string[] {
    const bundle = this.bundles.get(`${locale}:${namespace}`);
    if (!bundle) return [];
    return this.flattenKeys(bundle.entries, "");
  }

  private flattenKeys(obj: Record<string, unknown>, prefix: string): string[] {
    const keys: string[] = [];
    for (const [k, v] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${k}` : k;
      if (typeof v === "object" && v !== null && !Array.isArray(v)) {
        keys.push(...this.flattenKeys(v as Record<string, unknown>, fullKey));
      } else {
        keys.push(fullKey);
      }
    }
    return keys;
  }
}
