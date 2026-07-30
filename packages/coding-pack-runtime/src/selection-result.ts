import {
  CODING_PACK_MAX_CANDIDATE_COUNT,
  CODING_PACK_MAX_REASON_BYTES,
  CODING_PACK_SELECTION_RULES_VERSION,
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
import type {
  CodingPackCandidateOriginCode,
  CodingPackExclusion,
  CodingPackFileEntry,
  CodingPackSelectionResult,
  CodingPackSelectionTotals,
  CodingPackSelectionWarning,
} from "./types.js";
import {
  requireExactKeys,
  requirePlainRecord,
  requirePortableMachineIdentifier,
  validateDigest,
  validateExclusion,
  validatePackId,
  validatePurpose,
} from "./validation.js";

const ORIGIN_CODES: ReadonlySet<CodingPackCandidateOriginCode> = new Set([
  "explicit_selection",
  "purpose_rule",
  "project_default",
]);

const SELECTION_EXCLUSION_REASON_CODES: ReadonlySet<string> = new Set([
  "hard_private_path",
  "credential_like_name",
  "generated_directory",
  "vendor_directory",
  "binary_like_extension",
  "invalid_utf8",
  "file_size_limit",
  "file_count_limit",
  "aggregate_size_limit",
  "explicit_exclusion",
  "project_ignore",
]);

export async function verifyCodingPackSelectionResult(value: unknown): Promise<void> {
  await normalizeCodingPackSelectionResult(value);
}

export async function normalizeCodingPackSelectionResult(
  value: unknown,
): Promise<Readonly<CodingPackSelectionResult>> {
  const record = requirePlainRecord(value, "selection result");
  requireExactKeys(
    record,
    [
      "purpose",
      "selectionRulesVersion",
      "sourceFingerprint",
      "packId",
      "included",
      "exclusions",
      "warnings",
      "totals",
    ],
    "selection result",
  );
  const purpose = validatePurpose(record.purpose);
  const selectionRulesVersion = requirePortableMachineIdentifier(
    record.selectionRulesVersion,
    "selection result selectionRulesVersion",
    128,
  );
  if (selectionRulesVersion !== CODING_PACK_SELECTION_RULES_VERSION) {
    throw new CodingPackManifestError(
      "unsupported_rules",
      "Selection result uses an unsupported rules version.",
    );
  }
  const sourceFingerprint = validateDigest(
    record.sourceFingerprint,
    "selection result sourceFingerprint",
  );
  const packId = validatePackId(record.packId);
  const included = validateAndSortCodingPackSources(record.included, true);
  for (const entry of included) {
    if (!ORIGIN_CODES.has(entry.inclusionReasonCode as CodingPackCandidateOriginCode)) {
      throw new CodingPackManifestError(
        "invalid_input",
        "Selection result source uses an unsupported inclusion reason code.",
      );
    }
  }
  const exclusions = validateSelectionExclusions(record.exclusions);
  validateCodingPackPathSets(included, exclusions);
  assertNoPortablePathCollisions([...included, ...exclusions]);
  validateCodingPackBounds(
    included,
    DEFAULT_CODING_PACK_SELECTION_RULES.maxFiles,
    DEFAULT_CODING_PACK_SELECTION_RULES.maxFileBytes,
    DEFAULT_CODING_PACK_SELECTION_RULES.maxTotalBytes,
  );
  const warnings = validateSelectionWarnings(record.warnings);
  const totals = validateSelectionTotals(record.totals, included, exclusions);
  const identity = await computeCodingPackSourceIdentity({
    purpose,
    selectionRulesVersion,
    sources: included,
    exclusions,
  });
  if (sourceFingerprint !== identity.sourceFingerprint || packId !== identity.packId) {
    throw new CodingPackManifestError(
      "identity_mismatch",
      "Coding Pack selection identity does not match its evidence.",
    );
  }

  return freezeCodingPackSelectionResult({
    purpose,
    selectionRulesVersion,
    sourceFingerprint,
    packId,
    included,
    exclusions,
    warnings,
    totals,
  });
}

export function freezeCodingPackSelectionResult(
  result: CodingPackSelectionResult,
): Readonly<CodingPackSelectionResult> {
  const included = Object.freeze(result.included.map((entry) => Object.freeze({ ...entry })));
  const exclusions = Object.freeze(
    result.exclusions.map((exclusion) => Object.freeze({ ...exclusion })),
  );
  const warnings = Object.freeze(
    result.warnings.map((warning) => Object.freeze({ ...warning })),
  );
  const totals = Object.freeze({ ...result.totals });
  return Object.freeze({ ...result, included, exclusions, warnings, totals });
}

export function assertNoPortablePathCollisions(
  values: readonly { readonly relativePath: string }[],
): void {
  const exactPaths = new Set<string>();
  const caseFoldedPaths = new Map<string, string>();
  const normalizedPaths = new Map<string, string>();

  for (const value of values) {
    const path = value.relativePath;
    if (exactPaths.has(path)) {
      throw new CodingPackManifestError("duplicate_path", "Duplicate selection candidate path.");
    }
    exactPaths.add(path);

    const folded = path.toUpperCase().toLowerCase();
    const previousFolded = caseFoldedPaths.get(folded);
    if (previousFolded !== undefined && previousFolded !== path) {
      throw new CodingPackManifestError(
        "path_collision",
        "Selection paths have a conservative cross-platform case collision.",
      );
    }
    caseFoldedPaths.set(folded, path);

    const normalized = path.normalize("NFC");
    const previousNormalized = normalizedPaths.get(normalized);
    if (previousNormalized !== undefined && previousNormalized !== path) {
      throw new CodingPackManifestError(
        "path_collision",
        "Selection paths have a Unicode normalization collision.",
      );
    }
    normalizedPaths.set(normalized, path);
  }
}

function validateSelectionExclusions(value: unknown): CodingPackExclusion[] {
  if (!Array.isArray(value)) {
    throw new CodingPackManifestError("invalid_input", "exclusions must be an array.");
  }
  const exactExclusions = value.map((item) => {
    const record = requirePlainRecord(item, "selection exclusion");
    requireExactKeys(record, ["relativePath", "reasonCode"], "selection exclusion");
    const exclusion = validateExclusion(record);
    if (!SELECTION_EXCLUSION_REASON_CODES.has(exclusion.reasonCode)) {
      throw new CodingPackManifestError(
        "invalid_input",
        "Selection exclusion uses an unsupported reason code.",
      );
    }
    return exclusion;
  });
  return validateAndSortCodingPackExclusions(exactExclusions, true);
}

function validateSelectionWarnings(value: unknown): readonly CodingPackSelectionWarning[] {
  if (!Array.isArray(value)) {
    throw new CodingPackManifestError("invalid_input", "selection warnings must be an array.");
  }
  if (value.length > 0) {
    const record = requirePlainRecord(value[0], "selection warning");
    requireExactKeys(record, ["code", "relativePath"], "selection warning");
    requirePortableMachineIdentifier(
      record.code,
      "selection warning code",
      CODING_PACK_MAX_REASON_BYTES,
    );
    throw new CodingPackManifestError(
      "invalid_input",
      "The current selection rules version does not emit warnings.",
    );
  }
  return Object.freeze([]);
}

function validateSelectionTotals(
  value: unknown,
  included: readonly CodingPackFileEntry[],
  exclusions: readonly CodingPackExclusion[],
): Readonly<CodingPackSelectionTotals> {
  const record = requirePlainRecord(value, "selection totals");
  requireExactKeys(
    record,
    ["candidateCount", "includedCount", "excludedCount", "includedBytes"],
    "selection totals",
  );
  const totals: CodingPackSelectionTotals = {
    candidateCount: requireNonNegativeSafeInteger(record.candidateCount, "candidateCount"),
    includedCount: requireNonNegativeSafeInteger(record.includedCount, "includedCount"),
    excludedCount: requireNonNegativeSafeInteger(record.excludedCount, "excludedCount"),
    includedBytes: requireNonNegativeSafeInteger(record.includedBytes, "includedBytes"),
  };
  const expectedBytes = included.reduce((total, entry) => total + entry.byteCount, 0);
  if (
    totals.candidateCount !== included.length + exclusions.length
    || totals.includedCount !== included.length
    || totals.excludedCount !== exclusions.length
    || totals.includedBytes !== expectedBytes
    || totals.candidateCount > CODING_PACK_MAX_CANDIDATE_COUNT
  ) {
    throw new CodingPackManifestError(
      "invalid_input",
      "Selection totals do not match the selection evidence.",
    );
  }
  return Object.freeze(totals);
}

function requireNonNegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new CodingPackManifestError(
      "invalid_input",
      `Selection total ${label} must be a non-negative safe integer.`,
    );
  }
  return value as number;
}
