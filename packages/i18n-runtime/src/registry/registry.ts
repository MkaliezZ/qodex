import type { Locale } from "../models/locale.js";
export class LocaleRegistry {
  private locales = new Map<string, Locale>();
  private defaultCode = "en";

  setDefault(code: string): void { this.defaultCode = code; }
  getDefault(): string { return this.defaultCode; }

  register(locale: Locale): void { this.locales.set(locale.code, locale); }
  remove(code: string): boolean { return this.locales.delete(code); }
  get(code: string): Locale | undefined { return this.locales.get(code); }
  has(code: string): boolean { return this.locales.has(code); }
  list(): Locale[] { return Array.from(this.locales.values()); }
}
