import type { TranslationBundle } from "../models/bundle.js";

export function validateBundle(bundle: TranslationBundle): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!bundle.locale) errors.push("Missing locale");
  if (!bundle.namespace) errors.push("Missing namespace");
  if (!bundle.entries || typeof bundle.entries !== "object") errors.push("Missing or invalid entries");
  return { valid: errors.length === 0, errors };
}

export function detectMissingKeys(base: TranslationBundle, target: TranslationBundle): string[] {
  const missing: string[] = [];
  const baseKeys = flattenKeys(base.entries, "");
  for (const key of baseKeys) {
    const parts = key.split(".");
    let current: unknown = target.entries;
    let found = true;
    for (const part of parts) {
      if (typeof current !== "object" || current === null) { found = false; break; }
      current = (current as Record<string, unknown>)[part];
    }
    if (!found || typeof current !== "string") missing.push(key);
  }
  return missing;
}

function flattenKeys(obj: Record<string, unknown>, prefix: string): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      keys.push(...flattenKeys(v as Record<string, unknown>, fullKey));
    } else keys.push(fullKey);
  }
  return keys;
}
