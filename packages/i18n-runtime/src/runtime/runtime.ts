import { LocaleRegistry } from "../registry/registry.js";
import { LocaleResolver } from "../resolver/resolver.js";
import { FallbackEngine } from "../fallback/fallback.js";
import { I18nEventBus } from "../events/bus.js";
import { validateBundle, detectMissingKeys } from "../validation/validation.js";
import type { Locale, LocalePreference, TranslationKey } from "../models/locale.js";
import type { TranslationBundle, TranslationResult } from "../models/bundle.js";
import type { EventHandler } from "../models/events.js";

export class I18nRuntime {
  private registry = new LocaleRegistry();
  private resolver: LocaleResolver;
  private fallback = new FallbackEngine(this.registry);
  private eventBus = new I18nEventBus();
  private currentLocale: string;

  constructor(options?: { defaultLocale?: string }) {
    this.registry.setDefault(options?.defaultLocale ?? "en");
    this.resolver = new LocaleResolver(this.registry);
    this.currentLocale = this.registry.getDefault();

    // Register built-in locales
    this.registry.register({ code: "en", language: "en", label: "English", direction: "ltr" });
    this.registry.register({ code: "zh-CN", language: "zh", region: "CN", label: "中文", direction: "ltr" });
  }

  registerLocale(locale: Locale): void { this.registry.register(locale); }
  getLocale(code: string) { return this.registry.get(code); }
  listLocales() { return this.registry.list(); }
  getCurrentLocale() { return this.currentLocale; }

  setLocale(code: string): void {
    if (!this.registry.has(code)) throw new Error(`Unknown locale: ${code}`);
    this.currentLocale = code;
    this.eventBus.emit({ type: "locale:changed", locale: code, timestamp: Date.now() });
  }

  resolveLocale(prefs: LocalePreference): string {
    return this.resolver.resolve(prefs);
  }

  loadBundle(bundle: TranslationBundle): void {
    const v = validateBundle(bundle);
    if (!v.valid) throw new Error(`Invalid bundle: ${v.errors.join(", ")}`);
    this.fallback.loadBundle(bundle);
    this.eventBus.emit({ type: "bundle:loaded", locale: bundle.locale, namespace: bundle.namespace, keyCount: Object.keys(bundle.entries).length, timestamp: Date.now() });
  }

  t(key: TranslationKey, namespace = "app"): string {
    return this.fallback.resolve(key, this.currentLocale, namespace).value;
  }

  resolveKey(key: TranslationKey, namespace = "app"): TranslationResult {
    return this.fallback.resolve(key, this.currentLocale, namespace);
  }

  getLocalizedName(skillKey: string): string {
    return this.fallback.resolve(`${skillKey}.name`, this.currentLocale, "skills").value;
  }
  getLocalizedDescription(skillKey: string): string {
    return this.fallback.resolve(`${skillKey}.description`, this.currentLocale, "skills").value;
  }

  validateBundles(): Map<string, string[]> {
    const result = new Map<string, string[]>();
    const enBundles = this.fallback.getBundles("en");
    for (const locale of this.registry.list()) {
      if (locale.code === "en") continue;
      const missing: string[] = [];
      for (const enB of enBundles) {
        const targetBundles = this.fallback.getBundles(locale.code).filter((b) => b.namespace === enB.namespace);
        if (targetBundles.length === 0) { missing.push(`Namespace ${enB.namespace} missing`); continue; }
        missing.push(...detectMissingKeys(enB, targetBundles[0]).map((k) => `${enB.namespace}.${k}`));
      }
      if (missing.length > 0) result.set(locale.code, missing);
    }
    return result;
  }

  onChange(handler: EventHandler): () => void { return this.eventBus.subscribe(handler); }

  exportBundles(locale: string): TranslationBundle[] { return this.fallback.getBundles(locale); }
  importBundles(bundles: TranslationBundle[]): void { bundles.forEach((b) => this.loadBundle(b)); }
}
