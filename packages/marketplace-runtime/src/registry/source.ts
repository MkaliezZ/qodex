import type { RegistrySource } from "./events.js";

const HTTPS_RE = /^https:\/\//i;

export function validateSource(s: unknown): { valid: boolean; errors: string[] } {
  const e: string[] = [];
  if (!s || typeof s !== "object") { e.push("Not an object"); return { valid: false, errors: e }; }
  const src = s as Record<string, unknown>;
  if (!src.id || typeof src.id !== "string") e.push("id required");
  if (!src.name || typeof src.name !== "string") e.push("name required");
  if (!src.url || typeof src.url !== "string") e.push("url required");
  else {
    const url = String(src.url);
    if (url.startsWith("file://")) e.push("file:// URLs not allowed");
    else if (url.startsWith("javascript:")) e.push("javascript: URLs not allowed");
    else if (!HTTPS_RE.test(url)) e.push("URL must use HTTPS");
  }
  return { valid: e.length === 0, errors: e };
}

export class SourceManager {
  private sources: RegistrySource[] = [];

  add(source: RegistrySource): void {
    const v = validateSource(source);
    if (!v.valid) throw new Error(`Invalid source: ${v.errors.join(", ")}`);
    if (this.sources.some((s) => s.id === source.id)) throw new Error(`Source "${source.id}" already exists`);
    this.sources.push({ ...source, enabled: source.enabled ?? true, priority: source.priority ?? 0 });
  }

  remove(id: string): boolean {
    const idx = this.sources.findIndex((s) => s.id === id);
    if (idx === -1) return false;
    this.sources.splice(idx, 1);
    return true;
  }

  list(): RegistrySource[] { return [...this.sources]; }
  get(id: string): RegistrySource | undefined { return this.sources.find((s) => s.id === id); }
  listEnabled(): RegistrySource[] { return this.sources.filter((s) => s.enabled); }
}
