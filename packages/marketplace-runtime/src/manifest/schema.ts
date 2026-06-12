import type { SkillManifestV1 } from "../models/manifest.js";
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$/;

export function validateManifest(data: unknown): { valid: boolean; errors: string[]; manifest?: SkillManifestV1 } {
  const errors: string[] = [];
  if (!data || typeof data !== "object") return { valid: false, errors: ["Not an object"] };
  const m = data as Record<string, unknown>;
  if (!m.id || !ID_RE.test(String(m.id))) errors.push("Invalid id (kebab-case required)");
  if (!m.name || String(m.name).length > 200) errors.push("Invalid name");
  if (!m.version || !SEMVER_RE.test(String(m.version))) errors.push("Invalid version (SemVer required)");
  if (!m.author) errors.push("Missing author");
  if (!m.license) errors.push("Missing license");
  if (!m.compatibility || typeof m.compatibility !== "object") errors.push("Missing compatibility");
  else {
    const c = m.compatibility as Record<string, unknown>;
    if (!c.qodex || typeof c.qodex !== "string") errors.push("Missing compatibility.qodex");
    if (!c.source || !["native","openclaw","claude-code"].includes(String(c.source))) errors.push("Invalid compatibility.source");
  }
  const tags = Array.isArray(m.tags) ? (m.tags as string[]).slice(0, 10) : [];
  return errors.length === 0 ? { valid: true, errors: [], manifest: { ...m as unknown as SkillManifestV1, tags } } : { valid: false, errors };
}

export function parseManifest(json: string): { valid: boolean; errors: string[]; manifest?: SkillManifestV1 } {
  try { return validateManifest(JSON.parse(json)); }
  catch { return { valid: false, errors: ["Invalid JSON"] }; }
}
