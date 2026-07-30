import { compareUtf8 } from "./canonical.js";
import {
  CODING_PACK_MAX_CANDIDATE_COUNT,
  CODING_PACK_MAX_ELIGIBLE_CANDIDATE_BYTES,
  CODING_PACK_SELECTION_RULES_VERSION,
} from "./constants.js";
import { CodingPackManifestError } from "./errors.js";
import { computeCodingPackSourceIdentity } from "./identity.js";
import { createCodingPackFileEntry } from "./manifest.js";
import {
  assertNoPortablePathCollisions,
  freezeCodingPackSelectionResult,
} from "./selection-result.js";
import type {
  CodingPackCandidateOriginCode,
  CodingPackExclusion,
  CodingPackSelectionInput,
  CodingPackSelectionResult,
  CodingPackSelectionRules,
  CodingPackPurpose,
} from "./types.js";
import {
  requireExactKeys,
  requirePlainRecord,
  validatePortablePath,
  validatePurpose,
  validateSelectionRules,
} from "./validation.js";

export { verifyCodingPackSelectionResult } from "./selection-result.js";

const CANDIDATE_ORIGIN_CODES: ReadonlySet<CodingPackCandidateOriginCode> = new Set([
  "explicit_selection",
  "purpose_rule",
  "project_default",
]);

const PRIVATE_DIRECTORY_NAMES: ReadonlySet<string> = new Set([
  ".git",
  ".svn",
  ".hg",
]);

const VENDOR_DIRECTORY_NAMES: ReadonlySet<string> = new Set([
  "node_modules",
  "vendor",
]);

const GENERATED_DIRECTORY_NAMES: ReadonlySet<string> = new Set([
  "dist",
  "build",
  "coverage",
  "target",
  "__pycache__",
  ".pytest_cache",
  ".next",
  ".nuxt",
]);

const BINARY_EXTENSIONS: ReadonlySet<string> = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "ico",
  "pdf",
  "zip",
  "gz",
  "tar",
  "7z",
  "rar",
  "exe",
  "dll",
  "dylib",
  "so",
  "class",
  "jar",
  "woff",
  "woff2",
  "ttf",
  "otf",
  "mp3",
  "mp4",
  "mov",
  "avi",
  "db",
  "sqlite",
  "sqlite3",
]);

interface NormalizedCandidate {
  readonly relativePath: string;
  readonly bytes: Uint8Array;
  readonly originCode: CodingPackCandidateOriginCode;
  readonly ignoredByProjectRules: boolean;
  readonly explicitlyExcluded: boolean;
}

interface NormalizedSelectionInput {
  readonly purpose: CodingPackPurpose;
  readonly selectionRules: Readonly<CodingPackSelectionRules>;
  readonly candidates: readonly NormalizedCandidate[];
}

export async function selectCodingPackSources(
  input: CodingPackSelectionInput,
): Promise<Readonly<CodingPackSelectionResult>> {
  const normalized = validateSelectionInput(input);
  const candidates = [...normalized.candidates].sort((left, right) =>
    compareUtf8(left.relativePath, right.relativePath)
  );
  assertNoPortablePathCollisions(candidates);

  const exclusions: CodingPackExclusion[] = [];
  const potentiallyEligible: NormalizedCandidate[] = [];
  let eligibleCandidateBytes = 0;

  for (const candidate of candidates) {
    const exclusionReasonCode = classifyBeforeDecoding(candidate);
    if (exclusionReasonCode !== undefined) {
      exclusions.push({
        relativePath: candidate.relativePath,
        reasonCode: exclusionReasonCode,
      });
      continue;
    }
    if (candidate.bytes.byteLength > normalized.selectionRules.maxFileBytes) {
      exclusions.push({
        relativePath: candidate.relativePath,
        reasonCode: "file_size_limit",
      });
      continue;
    }
    eligibleCandidateBytes += candidate.bytes.byteLength;
    if (
      !Number.isSafeInteger(eligibleCandidateBytes)
      || eligibleCandidateBytes > CODING_PACK_MAX_ELIGIBLE_CANDIDATE_BYTES
    ) {
      throw new CodingPackManifestError(
        "bounds_exceeded",
        "Coding Pack eligible candidate bytes exceed their reviewed limit.",
      );
    }
    potentiallyEligible.push(candidate);
  }

  const validUtf8: NormalizedCandidate[] = [];
  for (const candidate of potentiallyEligible) {
    if (!isValidUtf8(candidate.bytes)) {
      exclusions.push({
        relativePath: candidate.relativePath,
        reasonCode: "invalid_utf8",
      });
      continue;
    }
    validUtf8.push(candidate);
  }

  const accepted: NormalizedCandidate[] = [];
  let includedBytes = 0;
  for (const candidate of validUtf8) {
    if (accepted.length >= normalized.selectionRules.maxFiles) {
      exclusions.push({
        relativePath: candidate.relativePath,
        reasonCode: "file_count_limit",
      });
      continue;
    }
    if (includedBytes + candidate.bytes.byteLength > normalized.selectionRules.maxTotalBytes) {
      exclusions.push({
        relativePath: candidate.relativePath,
        reasonCode: "aggregate_size_limit",
      });
      continue;
    }
    accepted.push(candidate);
    includedBytes += candidate.bytes.byteLength;
  }

  const included = await Promise.all(accepted.map((candidate) =>
    createCodingPackFileEntry({
      relativePath: candidate.relativePath,
      bytes: candidate.bytes,
      inclusionReasonCode: candidate.originCode,
    })
  ));
  exclusions.sort((left, right) => compareUtf8(left.relativePath, right.relativePath));
  const identity = await computeCodingPackSourceIdentity({
    purpose: normalized.purpose,
    selectionRulesVersion: normalized.selectionRules.version,
    sources: included,
    exclusions,
  });

  return freezeCodingPackSelectionResult({
    purpose: normalized.purpose,
    selectionRulesVersion: normalized.selectionRules.version,
    sourceFingerprint: identity.sourceFingerprint,
    packId: identity.packId,
    included,
    exclusions,
    warnings: [],
    totals: {
      candidateCount: candidates.length,
      includedCount: included.length,
      excludedCount: exclusions.length,
      includedBytes,
    },
  });
}

function validateSelectionInput(value: unknown): NormalizedSelectionInput {
  const record = requirePlainRecord(value, "selection input");
  requireExactKeys(record, ["purpose", "selectionRules", "candidates"], "selection input");
  const purpose = validatePurpose(record.purpose);
  const selectionRules = validateSelectionRules(record.selectionRules);
  if (selectionRules.version !== CODING_PACK_SELECTION_RULES_VERSION) {
    throw new CodingPackManifestError(
      "unsupported_rules",
      "Selection requires the reviewed KerniQ Coding Pack rules version.",
    );
  }
  if (!Array.isArray(record.candidates)) {
    throw new CodingPackManifestError("invalid_input", "selection input candidates must be an array.");
  }
  if (record.candidates.length > CODING_PACK_MAX_CANDIDATE_COUNT) {
    throw new CodingPackManifestError(
      "bounds_exceeded",
      "Selection input candidate count exceeds its reviewed limit.",
    );
  }
  const candidates = record.candidates.map((candidate, index) =>
    validateCandidate(candidate, index)
  );
  return {
    purpose,
    selectionRules,
    candidates: Object.freeze(candidates),
  };
}

function validateCandidate(value: unknown, index: number): Readonly<NormalizedCandidate> {
  const label = `selection candidate ${index}`;
  const record = requirePlainRecord(value, label);
  requireExactKeys(
    record,
    [
      "relativePath",
      "bytes",
      "originCode",
      "ignoredByProjectRules",
      "explicitlyExcluded",
    ],
    label,
  );
  const relativePath = validatePortablePath(record.relativePath);
  if (!(record.bytes instanceof Uint8Array)) {
    throw new CodingPackManifestError("invalid_input", `${label} bytes must be Uint8Array.`);
  }
  if (
    typeof record.originCode !== "string"
    || !CANDIDATE_ORIGIN_CODES.has(record.originCode as CodingPackCandidateOriginCode)
  ) {
    throw new CodingPackManifestError("invalid_input", `${label} originCode is unsupported.`);
  }
  const ignoredByProjectRules = validateOptionalBoolean(
    record,
    "ignoredByProjectRules",
    label,
  );
  const explicitlyExcluded = validateOptionalBoolean(record, "explicitlyExcluded", label);

  return Object.freeze({
    relativePath,
    bytes: record.bytes,
    originCode: record.originCode as CodingPackCandidateOriginCode,
    ignoredByProjectRules,
    explicitlyExcluded,
  });
}

function validateOptionalBoolean(
  record: Record<string, unknown>,
  key: "ignoredByProjectRules" | "explicitlyExcluded",
  label: string,
): boolean {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return false;
  if (typeof record[key] !== "boolean") {
    throw new CodingPackManifestError("invalid_input", `${label} ${key} must be boolean.`);
  }
  return record[key] as boolean;
}

function classifyBeforeDecoding(candidate: NormalizedCandidate): string | undefined {
  const segments = candidate.relativePath.split("/");
  if (segments.some((segment) => PRIVATE_DIRECTORY_NAMES.has(segment.toLowerCase()))) {
    return "hard_private_path";
  }
  if (segments.some((segment) => VENDOR_DIRECTORY_NAMES.has(segment.toLowerCase()))) {
    return "vendor_directory";
  }
  if (segments.some((segment) => GENERATED_DIRECTORY_NAMES.has(segment.toLowerCase()))) {
    return "generated_directory";
  }
  if (isCredentialLikeName(segments[segments.length - 1])) {
    return "credential_like_name";
  }
  if (candidate.explicitlyExcluded) {
    return "explicit_exclusion";
  }
  if (candidate.ignoredByProjectRules) {
    return "project_ignore";
  }
  if (hasBinaryExtension(segments[segments.length - 1])) {
    return "binary_like_extension";
  }
  return undefined;
}

function isCredentialLikeName(basename: string): boolean {
  const name = basename.toLowerCase();
  return name === ".env"
    || name.startsWith(".env.")
    || name.endsWith(".pem")
    || name.endsWith(".key")
    || name === "id_rsa"
    || name === "id_dsa"
    || name === "id_ed25519"
    || name === "credentials.json"
    || (name.startsWith("service-account") && name.endsWith(".json"))
    || name === ".npmrc"
    || name === ".pypirc"
    || name === "netrc";
}

function hasBinaryExtension(basename: string): boolean {
  const separator = basename.lastIndexOf(".");
  if (separator < 0 || separator === basename.length - 1) return false;
  return BINARY_EXTENSIONS.has(basename.slice(separator + 1).toLowerCase());
}

function isValidUtf8(bytes: Uint8Array): boolean {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}
