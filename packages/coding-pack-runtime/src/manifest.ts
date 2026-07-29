import {
  canonicalJson,
  compareUtf8,
  sha256Bytes,
  sha256Canonical,
  type CanonicalObject,
  type CanonicalValue,
} from "./canonical.js";
import {
  CODING_PACK_MANIFEST_SCHEMA_VERSION,
  CODING_PACK_MAX_REASON_BYTES,
  CODING_PACK_VERSION,
  DEFAULT_CODING_PACK_SELECTION_RULES,
} from "./constants.js";
import { CodingPackManifestError } from "./errors.js";
import type {
  CodingPackExclusion,
  CodingPackFileEntry,
  CodingPackManifest,
  CodingPackManifestInput,
  CodingPackPortableProject,
  CodingPackSourceInput,
} from "./types.js";
import {
  requireBoundedText,
  requireExactKeys,
  requirePlainRecord,
  validateDigest,
  validateExclusion,
  validateFileEntry,
  validatePackId,
  validatePortablePath,
  validatePortableProject,
  validatePurpose,
  validateSelectionRules,
  validateTimestamp,
} from "./validation.js";

export async function createCodingPackFileEntry(
  input: CodingPackSourceInput,
): Promise<Readonly<CodingPackFileEntry>> {
  const record = requirePlainRecord(input, "source input");
  requireExactKeys(record, ["relativePath", "bytes", "inclusionReason"], "source input");
  const relativePath = validatePortablePath(record.relativePath);
  if (!(record.bytes instanceof Uint8Array)) {
    throw new CodingPackManifestError("invalid_input", "source input bytes must be Uint8Array.");
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(record.bytes);
  } catch {
    throw new CodingPackManifestError("invalid_utf8", "source input is not valid UTF-8.");
  }
  const inclusionReason = requireBoundedText(
    record.inclusionReason,
    "source input inclusionReason",
    CODING_PACK_MAX_REASON_BYTES,
  );
  return Object.freeze({
    relativePath,
    sourceDigest: await sha256Bytes(record.bytes),
    byteCount: record.bytes.byteLength,
    encoding: "utf-8",
    inclusionReason,
  });
}

export async function createCodingPackManifest(
  input: CodingPackManifestInput,
): Promise<Readonly<CodingPackManifest>> {
  const record = requirePlainRecord(input, "manifest input");
  requireExactKeys(
    record,
    ["purpose", "project", "selectionRules", "sources", "exclusions", "generatedAt"],
    "manifest input",
  );
  const purpose = validatePurpose(record.purpose);
  const project = validatePortableProject(record.project);
  const rules = validateSelectionRules(record.selectionRules);
  const sources = validateAndSortSources(record.sources, false);
  const exclusions = validateAndSortExclusions(record.exclusions, false);
  validatePathSets(sources, exclusions);
  validateBounds(sources, rules.maxFiles, rules.maxFileBytes, rules.maxTotalBytes);
  const generatedAt = validateTimestamp(record.generatedAt);

  const sourceFingerprint = await computeSourceFingerprint({
    purpose,
    selectionRulesVersion: rules.version,
    sources,
    exclusions,
  });
  const packId = `pack-${sourceFingerprint.slice("sha256:".length)}`;
  const withoutDigest = portableManifestWithoutDigest({
    packId,
    purpose,
    project,
    selectionRulesVersion: rules.version,
    sources,
    exclusions,
    sourceFingerprint,
    generatedAt,
  });
  const manifestDigest = await sha256Canonical(withoutDigest);

  return freezeManifest({
    ...withoutDigest,
    manifestDigest,
  } as unknown as CodingPackManifest);
}

export async function verifyCodingPackManifest(manifest: unknown): Promise<void> {
  const normalized = validateManifestShape(manifest);
  const expectedFingerprint = await computeSourceFingerprint(normalized);
  if (normalized.sourceFingerprint !== expectedFingerprint) {
    throw new CodingPackManifestError(
      "identity_mismatch",
      "Coding Pack source fingerprint does not match its content.",
    );
  }
  const expectedPackId = `pack-${expectedFingerprint.slice("sha256:".length)}`;
  if (normalized.packId !== expectedPackId) {
    throw new CodingPackManifestError(
      "identity_mismatch",
      "Coding Pack ID does not match its source fingerprint.",
    );
  }
  const expectedManifestDigest = await sha256Canonical(
    portableManifestWithoutDigest(normalized),
  );
  if (normalized.manifestDigest !== expectedManifestDigest) {
    throw new CodingPackManifestError(
      "identity_mismatch",
      "Coding Pack manifest digest does not match its content.",
    );
  }
}

export function serializeCodingPackManifest(manifest: unknown): string {
  return canonicalJson(validateManifestShape(manifest) as unknown as CanonicalValue);
}

function validateManifestShape(value: unknown): CodingPackManifest {
  const record = requirePlainRecord(value, "manifest");
  requireExactKeys(
    record,
    [
      "schemaVersion",
      "packVersion",
      "packId",
      "purpose",
      "project",
      "selectionRulesVersion",
      "sources",
      "exclusions",
      "sourceFingerprint",
      "generatedAt",
      "manifestDigest",
    ],
    "manifest",
  );
  if (record.schemaVersion !== CODING_PACK_MANIFEST_SCHEMA_VERSION) {
    throw new CodingPackManifestError("invalid_input", "Manifest schema version is unsupported.");
  }
  if (record.packVersion !== CODING_PACK_VERSION) {
    throw new CodingPackManifestError("invalid_input", "Coding Pack version is unsupported.");
  }
  const packId = validatePackId(record.packId);
  const purpose = validatePurpose(record.purpose);
  const project = validatePortableProject(record.project);
  const selectionRulesVersion = requireBoundedText(
    record.selectionRulesVersion,
    "manifest.selectionRulesVersion",
    128,
  );
  const sources = validateAndSortSources(record.sources, true);
  const exclusions = validateAndSortExclusions(record.exclusions, true);
  validatePathSets(sources, exclusions);
  validateBounds(
    sources,
    DEFAULT_CODING_PACK_SELECTION_RULES.maxFiles,
    DEFAULT_CODING_PACK_SELECTION_RULES.maxFileBytes,
    DEFAULT_CODING_PACK_SELECTION_RULES.maxTotalBytes,
  );
  const sourceFingerprint = validateDigest(
    record.sourceFingerprint,
    "manifest.sourceFingerprint",
  );
  const generatedAt = validateTimestamp(record.generatedAt);
  const manifestDigest = validateDigest(record.manifestDigest, "manifest.manifestDigest");

  return {
    schemaVersion: CODING_PACK_MANIFEST_SCHEMA_VERSION,
    packVersion: CODING_PACK_VERSION,
    packId,
    purpose,
    project,
    selectionRulesVersion,
    sources,
    exclusions,
    sourceFingerprint,
    generatedAt,
    manifestDigest,
  };
}

function validateAndSortSources(value: unknown, requireCanonicalOrder: boolean): CodingPackFileEntry[] {
  if (!Array.isArray(value)) {
    throw new CodingPackManifestError("invalid_input", "sources must be an array.");
  }
  const sources = value.map(validateFileEntry);
  if (requireCanonicalOrder) assertCanonicalOrder(sources, "source");
  const sorted = requireCanonicalOrder
    ? sources
    : [...sources].sort((left, right) => compareUtf8(left.relativePath, right.relativePath));
  assertUniquePaths(sorted, "source");
  return sorted;
}

function validateAndSortExclusions(
  value: unknown,
  requireCanonicalOrder: boolean,
): CodingPackExclusion[] {
  if (!Array.isArray(value)) {
    throw new CodingPackManifestError("invalid_input", "exclusions must be an array.");
  }
  const exclusions = value.map(validateExclusion);
  if (requireCanonicalOrder) assertCanonicalOrder(exclusions, "exclusion");
  const sorted = requireCanonicalOrder
    ? exclusions
    : [...exclusions].sort((left, right) => compareUtf8(left.relativePath, right.relativePath));
  assertUniquePaths(sorted, "exclusion");
  return sorted;
}

function assertCanonicalOrder(
  values: readonly { readonly relativePath: string }[],
  label: string,
): void {
  for (let index = 1; index < values.length; index += 1) {
    if (compareUtf8(values[index - 1].relativePath, values[index].relativePath) > 0) {
      throw new CodingPackManifestError(
        "invalid_input",
        `${label} entries are not in canonical UTF-8 byte order.`,
      );
    }
  }
}

function assertUniquePaths(
  values: readonly { readonly relativePath: string }[],
  label: string,
): void {
  for (let index = 1; index < values.length; index += 1) {
    if (values[index - 1].relativePath === values[index].relativePath) {
      throw new CodingPackManifestError("duplicate_path", `Duplicate ${label} path.`);
    }
  }
}

function validatePathSets(
  sources: readonly CodingPackFileEntry[],
  exclusions: readonly CodingPackExclusion[],
): void {
  const sourcePaths = new Set(sources.map((source) => source.relativePath));
  const overlap = exclusions.find((exclusion) => sourcePaths.has(exclusion.relativePath));
  if (overlap) {
    throw new CodingPackManifestError(
      "path_overlap",
      "A path cannot be both included and excluded.",
    );
  }
}

function validateBounds(
  sources: readonly CodingPackFileEntry[],
  maxFiles: number,
  maxFileBytes: number,
  maxTotalBytes: number,
): void {
  if (sources.length > maxFiles) {
    throw new CodingPackManifestError("bounds_exceeded", "Coding Pack file count exceeds its limit.");
  }
  let totalBytes = 0;
  for (const source of sources) {
    if (source.byteCount > maxFileBytes) {
      throw new CodingPackManifestError(
        "bounds_exceeded",
        "Coding Pack source exceeds the per-file byte limit.",
      );
    }
    totalBytes += source.byteCount;
    if (!Number.isSafeInteger(totalBytes) || totalBytes > maxTotalBytes) {
      throw new CodingPackManifestError(
        "bounds_exceeded",
        "Coding Pack aggregate source bytes exceed their limit.",
      );
    }
  }
}

async function computeSourceFingerprint(input: {
  readonly purpose: CodingPackManifest["purpose"];
  readonly selectionRulesVersion: string;
  readonly sources: readonly CodingPackFileEntry[];
  readonly exclusions: readonly CodingPackExclusion[];
}): Promise<string> {
  return sha256Canonical({
    schemaVersion: CODING_PACK_MANIFEST_SCHEMA_VERSION,
    packVersion: CODING_PACK_VERSION,
    purpose: input.purpose,
    selectionRulesVersion: input.selectionRulesVersion,
    sources: input.sources as unknown as CanonicalValue,
    exclusions: input.exclusions as unknown as CanonicalValue,
  });
}

function portableManifestWithoutDigest(input: {
  readonly packId: string;
  readonly purpose: CodingPackManifest["purpose"];
  readonly project: CodingPackPortableProject;
  readonly selectionRulesVersion: string;
  readonly sources: readonly CodingPackFileEntry[];
  readonly exclusions: readonly CodingPackExclusion[];
  readonly sourceFingerprint: string;
  readonly generatedAt: string;
}): CanonicalObject {
  return {
    schemaVersion: CODING_PACK_MANIFEST_SCHEMA_VERSION,
    packVersion: CODING_PACK_VERSION,
    packId: input.packId,
    purpose: input.purpose,
    project: input.project as unknown as CanonicalValue,
    selectionRulesVersion: input.selectionRulesVersion,
    sources: input.sources as unknown as CanonicalValue,
    exclusions: input.exclusions as unknown as CanonicalValue,
    sourceFingerprint: input.sourceFingerprint,
    generatedAt: input.generatedAt,
  };
}

function freezeManifest(manifest: CodingPackManifest): Readonly<CodingPackManifest> {
  const sources = Object.freeze(manifest.sources.map((source) => Object.freeze({ ...source })));
  const exclusions = Object.freeze(
    manifest.exclusions.map((exclusion) => Object.freeze({ ...exclusion })),
  );
  const project = Object.freeze({ ...manifest.project });
  return Object.freeze({ ...manifest, project, sources, exclusions });
}
