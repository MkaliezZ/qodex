import { compareUtf8 } from "./canonical.js";
import {
  CODING_PACK_MAX_REASON_BYTES,
  CODING_PACK_SELECTION_RULES_VERSION,
} from "./constants.js";
import { CodingPackManifestError } from "./errors.js";
import { createCodingPackFileEntry } from "./manifest.js";
import type {
  CodingPackCandidateOriginCode,
  CodingPackExclusion,
  CodingPackFileEntry,
  CodingPackSelectionInput,
  CodingPackSelectionResult,
  CodingPackSelectionRules,
  CodingPackSelectionWarning,
} from "./types.js";
import {
  rejectPortableLocalIdentity,
  requireExactKeys,
  requirePlainRecord,
  requirePortableMachineIdentifier,
  validatePortablePath,
  validatePurpose,
  validateSelectionRules,
} from "./validation.js";

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
  readonly projectIgnoreReasonCode?: string;
  readonly explicitlyExcluded: boolean;
}

interface NormalizedSelectionInput {
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
  assertNoPathCollisions(candidates);

  const included: CodingPackFileEntry[] = [];
  const exclusions: CodingPackExclusion[] = [];
  let includedBytes = 0;

  for (const candidate of candidates) {
    const exclusionReasonCode = classifyCandidate(candidate);
    if (exclusionReasonCode !== undefined) {
      exclusions.push({
        relativePath: candidate.relativePath,
        reasonCode: exclusionReasonCode,
      });
      continue;
    }

    if (!isValidUtf8(candidate.bytes)) {
      exclusions.push({
        relativePath: candidate.relativePath,
        reasonCode: "invalid_utf8",
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

    if (included.length >= normalized.selectionRules.maxFiles) {
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

    const entry = await createCodingPackFileEntry({
      relativePath: candidate.relativePath,
      bytes: candidate.bytes,
      inclusionReasonCode: candidate.originCode,
    });
    included.push(entry);
    includedBytes += entry.byteCount;
  }

  return freezeSelectionResult({
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
  validatePurpose(record.purpose);
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
  const candidates = record.candidates.map((candidate, index) =>
    validateCandidate(candidate, index)
  );
  return {
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
      "projectIgnoreReasonCode",
      "explicitlyExcluded",
    ],
    label,
  );
  const relativePath = validatePortablePath(record.relativePath);
  rejectPortableLocalIdentity(relativePath, `${label} relativePath`);
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
  const projectIgnoreReasonCode = Object.prototype.hasOwnProperty.call(
    record,
    "projectIgnoreReasonCode",
  )
    ? requirePortableMachineIdentifier(
      record.projectIgnoreReasonCode,
      `${label} projectIgnoreReasonCode`,
      CODING_PACK_MAX_REASON_BYTES,
    )
    : undefined;

  return Object.freeze({
    relativePath,
    bytes: Uint8Array.from(record.bytes),
    originCode: record.originCode as CodingPackCandidateOriginCode,
    ignoredByProjectRules,
    ...(projectIgnoreReasonCode === undefined ? {} : { projectIgnoreReasonCode }),
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

function assertNoPathCollisions(candidates: readonly NormalizedCandidate[]): void {
  const exactPaths = new Set<string>();
  const caseFoldedPaths = new Map<string, string>();
  const normalizedPaths = new Map<string, string>();

  for (const candidate of candidates) {
    const path = candidate.relativePath;
    if (exactPaths.has(path)) {
      throw new CodingPackManifestError("duplicate_path", "Duplicate selection candidate path.");
    }
    exactPaths.add(path);

    const folded = path.toUpperCase().toLowerCase();
    const previousFolded = caseFoldedPaths.get(folded);
    if (previousFolded !== undefined && previousFolded !== path) {
      throw new CodingPackManifestError(
        "path_collision",
        "Selection candidate paths have a cross-platform case collision.",
      );
    }
    caseFoldedPaths.set(folded, path);

    const normalized = path.normalize("NFC");
    const previousNormalized = normalizedPaths.get(normalized);
    if (previousNormalized !== undefined && previousNormalized !== path) {
      throw new CodingPackManifestError(
        "path_collision",
        "Selection candidate paths have a Unicode normalization collision.",
      );
    }
    normalizedPaths.set(normalized, path);
  }
}

function classifyCandidate(candidate: NormalizedCandidate): string | undefined {
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
    return candidate.projectIgnoreReasonCode ?? "project_ignore";
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

function freezeSelectionResult(
  result: CodingPackSelectionResult,
): Readonly<CodingPackSelectionResult> {
  const included = Object.freeze(result.included.map((entry) => Object.freeze({ ...entry })));
  const exclusions = Object.freeze(
    result.exclusions.map((exclusion) => Object.freeze({ ...exclusion })),
  );
  const warnings = Object.freeze(
    result.warnings.map((warning: CodingPackSelectionWarning) =>
      Object.freeze({ ...warning })
    ),
  );
  const totals = Object.freeze({ ...result.totals });
  return Object.freeze({ included, exclusions, warnings, totals });
}
