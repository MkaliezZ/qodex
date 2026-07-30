import {
  canonicalJson,
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
import {
  validateAndSortCodingPackExclusions,
  validateAndSortCodingPackSources,
  validateCodingPackBounds,
  validateCodingPackPathSets,
} from "./evidence.js";
import { CodingPackManifestError } from "./errors.js";
import { computeCodingPackSourceIdentity } from "./identity.js";
import { normalizeCodingPackSelectionResult } from "./selection-result.js";
import type {
  CodingPackExclusion,
  CodingPackFileEntry,
  CodingPackManifest,
  CodingPackManifestFromSelectionInput,
  CodingPackManifestInput,
  CodingPackPortableProject,
  CodingPackSourceInput,
} from "./types.js";
import {
  requireExactKeys,
  requirePortableMachineIdentifier,
  requirePlainRecord,
  validateDigest,
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
  requireExactKeys(record, ["relativePath", "bytes", "inclusionReasonCode"], "source input");
  const relativePath = validatePortablePath(record.relativePath);
  if (!(record.bytes instanceof Uint8Array)) {
    throw new CodingPackManifestError("invalid_input", "source input bytes must be Uint8Array.");
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(record.bytes);
  } catch {
    throw new CodingPackManifestError("invalid_utf8", "source input is not valid UTF-8.");
  }
  const inclusionReasonCode = requirePortableMachineIdentifier(
    record.inclusionReasonCode,
    "source input inclusionReasonCode",
    CODING_PACK_MAX_REASON_BYTES,
  );
  return Object.freeze({
    relativePath,
    sourceDigest: await sha256Bytes(record.bytes),
    byteCount: record.bytes.byteLength,
    encoding: "utf-8",
    inclusionReasonCode,
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
  const sources = validateAndSortCodingPackSources(record.sources, false);
  const exclusions = validateAndSortCodingPackExclusions(record.exclusions, false);
  validateCodingPackPathSets(sources, exclusions);
  validateCodingPackBounds(sources, rules.maxFiles, rules.maxFileBytes, rules.maxTotalBytes);
  const generatedAt = validateTimestamp(record.generatedAt);

  const identity = await computeCodingPackSourceIdentity({
    purpose,
    selectionRulesVersion: rules.version,
    sources,
    exclusions,
  });
  const withoutDigest = portableManifestWithoutDigest({
    packId: identity.packId,
    purpose,
    project,
    selectionRulesVersion: rules.version,
    sources,
    exclusions,
    sourceFingerprint: identity.sourceFingerprint,
    generatedAt,
  });
  const manifestDigest = await sha256Canonical(withoutDigest);

  return freezeManifest({
    ...withoutDigest,
    manifestDigest,
  } as unknown as CodingPackManifest);
}

export async function createCodingPackManifestFromSelection(
  input: CodingPackManifestFromSelectionInput,
): Promise<Readonly<CodingPackManifest>> {
  const record = requirePlainRecord(input, "manifest-from-selection input");
  requireExactKeys(
    record,
    ["selection", "project", "generatedAt"],
    "manifest-from-selection input",
  );
  const selection = await normalizeCodingPackSelectionResult(record.selection);
  const project = validatePortableProject(record.project);
  const generatedAt = validateTimestamp(record.generatedAt);
  const manifest = await createCodingPackManifest({
    purpose: selection.purpose,
    project,
    selectionRules: {
      ...DEFAULT_CODING_PACK_SELECTION_RULES,
      version: selection.selectionRulesVersion,
    },
    sources: selection.included,
    exclusions: selection.exclusions,
    generatedAt,
  });
  if (
    manifest.sourceFingerprint !== selection.sourceFingerprint
    || manifest.packId !== selection.packId
  ) {
    throw new CodingPackManifestError(
      "identity_mismatch",
      "Manifest identity does not match the bound selection.",
    );
  }
  return manifest;
}

export async function verifyCodingPackManifest(manifest: unknown): Promise<void> {
  const normalized = validateManifestShape(manifest);
  const expectedIdentity = await computeCodingPackSourceIdentity(normalized);
  if (normalized.sourceFingerprint !== expectedIdentity.sourceFingerprint) {
    throw new CodingPackManifestError(
      "identity_mismatch",
      "Coding Pack source fingerprint does not match its content.",
    );
  }
  if (normalized.packId !== expectedIdentity.packId) {
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
  const selectionRulesVersion = requirePortableMachineIdentifier(
    record.selectionRulesVersion,
    "manifest.selectionRulesVersion",
    128,
  );
  const sources = validateAndSortCodingPackSources(record.sources, true);
  const exclusions = validateAndSortCodingPackExclusions(record.exclusions, true);
  validateCodingPackPathSets(sources, exclusions);
  validateCodingPackBounds(
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
