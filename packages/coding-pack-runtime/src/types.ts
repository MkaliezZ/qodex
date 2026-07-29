import type {
  CODING_PACK_MANIFEST_SCHEMA_VERSION,
  CODING_PACK_VERSION,
} from "./constants.js";

export type CodingPackPurpose =
  | "repository_orientation"
  | "task_context"
  | "review_handoff";

export type CodingPackEncoding = "utf-8";

/**
 * Local authorization identity for later Desktop slices.
 *
 * This type is deliberately absent from CodingPackManifestInput and from the
 * portable manifest. v0.7.1 does not store or authorize it.
 */
export interface CodingPackLocalAuthority {
  readonly projectBindingId: string;
  readonly projectFingerprint: string;
}

export interface CodingPackPortableProject {
  readonly projectLabel?: string;
}

export interface CodingPackSelectionRules {
  readonly version: string;
  readonly maxFiles: number;
  readonly maxFileBytes: number;
  readonly maxTotalBytes: number;
}

export interface CodingPackSourceInput {
  readonly relativePath: string;
  readonly bytes: Uint8Array;
  readonly inclusionReason: string;
}

export interface CodingPackFileEntry {
  readonly relativePath: string;
  readonly sourceDigest: string;
  readonly byteCount: number;
  readonly encoding: CodingPackEncoding;
  readonly inclusionReason: string;
}

export interface CodingPackExclusion {
  readonly relativePath: string;
  readonly reasonCode: string;
  readonly detail?: string;
}

export interface CodingPackManifest {
  readonly schemaVersion: typeof CODING_PACK_MANIFEST_SCHEMA_VERSION;
  readonly packVersion: typeof CODING_PACK_VERSION;
  readonly packId: string;
  readonly purpose: CodingPackPurpose;
  readonly project: CodingPackPortableProject;
  readonly selectionRulesVersion: string;
  readonly sources: readonly CodingPackFileEntry[];
  readonly exclusions: readonly CodingPackExclusion[];
  readonly sourceFingerprint: string;
  readonly generatedAt: string;
  readonly manifestDigest: string;
}

export interface CodingPackManifestInput {
  readonly purpose: CodingPackPurpose;
  readonly project?: CodingPackPortableProject;
  readonly selectionRules: CodingPackSelectionRules;
  readonly sources: readonly CodingPackFileEntry[];
  readonly exclusions: readonly CodingPackExclusion[];
  readonly generatedAt: string;
}
