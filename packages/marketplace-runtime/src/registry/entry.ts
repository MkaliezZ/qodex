import type { RegistryEntry, RegistryVersion } from "./events.js";

const SEMVER_RE = /^\d+\.\d+\.\d+/;
const SHA256_RE = /^[a-f0-9]{64}$/i;
const HTTPS_RE = /^https:\/\//i;

export function validateEntry(entry: unknown): { valid: boolean; errors: string[] } {
  const e: string[] = [];
  if (!entry || typeof entry !== "object") { e.push("Not an object"); return { valid: false, errors: e }; }
  const en = entry as Record<string, unknown>;

  if (!validateId(en.id)) e.push("Invalid id");
  if (!en.name || typeof en.name !== "string" || en.name.length > 200) e.push("Invalid name");
  if (!en.description || typeof en.description !== "string") e.push("Invalid description");
  if (en.packageType !== "skill") e.push("Only packageType 'skill' supported in M15");
  if (!en.latestVersion || !SEMVER_RE.test(String(en.latestVersion))) e.push("Invalid latestVersion");
  if (!Array.isArray(en.versions) || en.versions.length === 0) e.push("versions required");
  else {
    for (const v of en.versions as unknown[]) {
      const ve = validateVersion(v);
      e.push(...ve.errors.map((x) => `version.${x}`));
    }
  }
  if (!en.publisher || typeof en.publisher !== "object") e.push("publisher required");
  if (!en.tags || !Array.isArray(en.tags)) e.push("tags required");
  if (typeof en.id === "string" && en.id.includes("<")) e.push("Potential XSS in id");
  if (typeof en.name === "string" && en.name.includes("<")) e.push("Potential XSS in name");
  if (typeof en.description === "string" && en.description.includes("<")) e.push("Potential XSS in description");
  return { valid: e.length === 0, errors: e };
}

function validateId(id: unknown): boolean {
  return typeof id === "string" && id.length > 0 && !id.includes("/") && !id.includes("..");
}

function validateVersion(v: unknown): { valid: boolean; errors: string[] } {
  const e: string[] = [];
  if (!v || typeof v !== "object") { e.push("Not an object"); return { valid: false, errors: e }; }
  const ver = v as Record<string, unknown>;
  if (!ver.version || !SEMVER_RE.test(String(ver.version))) e.push("Invalid version");
  if (!ver.manifestUrl || typeof ver.manifestUrl !== "string" || !HTTPS_RE.test(String(ver.manifestUrl))) e.push("manifestUrl must be HTTPS");
  if (!ver.packageUrl || typeof ver.packageUrl !== "string" || !HTTPS_RE.test(String(ver.packageUrl))) e.push("packageUrl must be HTTPS");
  if (ver.packageUrl && (!ver.checksum || !SHA256_RE.test(String(ver.checksum)))) e.push("checksum must be SHA-256 format");
  if (!ver.publishedAt) e.push("publishedAt required");
  return { valid: e.length === 0, errors: e };
}

export function validateCache(data: unknown): { valid: boolean; errors: string[] } {
  const e: string[] = [];
  if (!data || typeof data !== "object") { e.push("Not an object"); return { valid: false, errors: e }; }
  const d = data as Record<string, unknown>;
  if (!d.entries || typeof d.entries !== "object") e.push("entries required");
  return { valid: e.length === 0, errors: e };
}
