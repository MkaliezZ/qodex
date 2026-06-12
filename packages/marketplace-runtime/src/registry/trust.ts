import type { TrustLevel, TrustMetadata } from "./events.js";

export function evaluateTrust(entry: { id: string; trust?: { level: TrustLevel } }): { allowed: boolean; warning?: string } {
  if (!entry.trust) return { allowed: true, warning: "Unverified publisher" };
  const level = entry.trust.level ?? "community";
  switch (level) {
    case "blocked": return { allowed: false, warning: `Package "${entry.id}" is blocked` };
    case "community": return { allowed: true, warning: entry.trust.warnings?.length ? entry.trust.warnings.join("; ") : undefined };
    case "verified": case "official": case "local": return { allowed: true };
    default: return { allowed: true, warning: "Unknown trust level" };
  }
}

export function isBlocked(trust?: Partial<TrustMetadata>): boolean {
  return trust?.level === "blocked";
}

export function isValidTrustLevel(level: string): level is TrustLevel {
  return ["local", "community", "verified", "official", "blocked"].includes(level);
}
