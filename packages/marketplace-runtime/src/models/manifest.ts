export interface SkillManifestV1 {
  id: string; name: string; description: string; version: string;
  author: string; license: string; tags: string[];
  compatibility: { qodex: string; source: "native" | "openclaw" | "claude-code" };
  locales?: Record<string, { name?: string; description?: string; tags?: string[] }>;
  homepage?: string; repository?: string; documentation?: string;
  createdAt?: string; updatedAt?: string;
}
export interface InstallResult { id: string; version: string; status: InstallStatus; path: string; }
export type InstallStatus = "installed" | "updated" | "failed" | "removed";
export interface InstallIndex { skills: Record<string, { manifest: SkillManifestV1; installedAt: string }>; }
