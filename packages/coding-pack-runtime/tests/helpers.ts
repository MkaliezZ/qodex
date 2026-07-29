import {
  DEFAULT_CODING_PACK_SELECTION_RULES,
  createCodingPackFileEntry,
  createCodingPackManifest,
  type CodingPackExclusion,
  type CodingPackFileEntry,
  type CodingPackManifest,
  type CodingPackManifestInput,
  type CodingPackPurpose,
  type CodingPackSelectionRules,
} from "../src/index.js";

export const GENERATED_AT = "2026-07-29T12:00:00Z";
export const OTHER_GENERATED_AT = "2026-07-29T12:00:01Z";
export const VALID_DIGEST = `sha256:${"a".repeat(64)}`;

export function rules(
  version = DEFAULT_CODING_PACK_SELECTION_RULES.version,
): CodingPackSelectionRules {
  return {
    ...DEFAULT_CODING_PACK_SELECTION_RULES,
    version,
  };
}

export async function source(
  relativePath: string,
  text = `content:${relativePath}`,
): Promise<CodingPackFileEntry> {
  return createCodingPackFileEntry({
    relativePath,
    bytes: new TextEncoder().encode(text),
    inclusionReason: "test fixture",
  });
}

export function evidence(
  relativePath: string,
  byteCount = 1,
  sourceDigest = VALID_DIGEST,
): CodingPackFileEntry {
  return {
    relativePath,
    sourceDigest,
    byteCount,
    encoding: "utf-8",
    inclusionReason: "test fixture",
  };
}

export async function manifest(options: {
  purpose?: CodingPackPurpose;
  projectLabel?: string;
  selectionRules?: CodingPackSelectionRules;
  sources?: readonly CodingPackFileEntry[];
  exclusions?: readonly CodingPackExclusion[];
  generatedAt?: string;
} = {}): Promise<CodingPackManifest> {
  const defaultSources = [await source("src/index.ts")];
  const input: CodingPackManifestInput = {
    purpose: options.purpose ?? "repository_orientation",
    selectionRules: options.selectionRules ?? rules(),
    sources: options.sources ?? defaultSources,
    exclusions: options.exclusions ?? [],
    generatedAt: options.generatedAt ?? GENERATED_AT,
  };
  if (options.projectLabel !== undefined) {
    return createCodingPackManifest({
      ...input,
      project: { projectLabel: options.projectLabel },
    });
  }
  return createCodingPackManifest(input);
}
