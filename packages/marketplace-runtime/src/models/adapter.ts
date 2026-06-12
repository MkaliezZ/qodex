import type { SkillManifestV1 } from "./manifest.js";
export interface SkillAdapter { format: string; version: string; canHandle(dirPath: string): Promise<boolean>; import(dirPath: string): Promise<{ manifest: SkillManifestV1; skillContent: string }>; }
