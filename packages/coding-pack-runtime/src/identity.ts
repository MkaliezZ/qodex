import {
  sha256Canonical,
  type CanonicalValue,
} from "./canonical.js";
import {
  CODING_PACK_MANIFEST_SCHEMA_VERSION,
  CODING_PACK_VERSION,
} from "./constants.js";
import type {
  CodingPackExclusion,
  CodingPackFileEntry,
  CodingPackPurpose,
} from "./types.js";

export interface CodingPackSourceIdentityInput {
  readonly purpose: CodingPackPurpose;
  readonly selectionRulesVersion: string;
  readonly sources: readonly CodingPackFileEntry[];
  readonly exclusions: readonly CodingPackExclusion[];
}

export interface CodingPackSourceIdentity {
  readonly sourceFingerprint: string;
  readonly packId: string;
}

export async function computeCodingPackSourceIdentity(
  input: CodingPackSourceIdentityInput,
): Promise<Readonly<CodingPackSourceIdentity>> {
  const sourceFingerprint = await sha256Canonical({
    schemaVersion: CODING_PACK_MANIFEST_SCHEMA_VERSION,
    packVersion: CODING_PACK_VERSION,
    purpose: input.purpose,
    selectionRulesVersion: input.selectionRulesVersion,
    sources: input.sources as unknown as CanonicalValue,
    exclusions: input.exclusions as unknown as CanonicalValue,
  });
  return Object.freeze({
    sourceFingerprint,
    packId: `pack-${sourceFingerprint.slice("sha256:".length)}`,
  });
}
