import {
  compareUtf8,
  sha256Canonical,
  type CanonicalValue,
} from "./canonical.js";
import {
  CODING_PACK_MAX_CANDIDATE_COUNT,
  CODING_PACK_MAX_ELIGIBLE_CANDIDATE_BYTES,
  CODING_PACK_SELECTION_RULES_VERSION,
  DEFAULT_CODING_PACK_SELECTION_RULES,
} from "./constants.js";
import { CodingPackManifestError } from "./errors.js";
import {
  computeCodingPackCandidatePathsDigest,
  computeCodingPackSourceIdentity,
} from "./identity.js";
import { createCodingPackFileEntry } from "./manifest.js";
import {
  assertNoPortablePathCollisions,
  freezeCodingPackSelectionResult,
} from "./selection-result.js";
import type {
  CodingPackCandidateMetadata,
  CodingPackCandidateOriginCode,
  CodingPackCandidateRead,
  CodingPackExclusion,
  CodingPackPurpose,
  CodingPackReadPlan,
  CodingPackReadPlanEntry,
  CodingPackSelectionInput,
  CodingPackSelectionResult,
  CodingPackSelectionRules,
} from "./types.js";
import {
  requireExactKeys,
  requirePlainRecord,
  validateDigest,
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

const PRIVATE_DIRECTORY_NAMES = new Set([".git", ".svn", ".hg"]);
const VENDOR_DIRECTORY_NAMES = new Set(["node_modules", "vendor"]);
const GENERATED_DIRECTORY_NAMES = new Set([
  "dist",
  "build",
  "coverage",
  "target",
  "__pycache__",
  ".pytest_cache",
  ".next",
  ".nuxt",
]);
const BINARY_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "ico", "pdf", "zip", "gz", "tar",
  "7z", "rar", "exe", "dll", "dylib", "so", "class", "jar", "woff", "woff2",
  "ttf", "otf", "mp3", "mp4", "mov", "avi", "db", "sqlite", "sqlite3",
]);

interface NormalizedMetadata {
  readonly relativePath: string;
  readonly originCode: CodingPackCandidateOriginCode;
  readonly ignoredByProjectRules: boolean;
  readonly explicitlyExcluded: boolean;
}

interface NormalizedCandidate extends NormalizedMetadata {
  readonly bytes: Uint8Array;
}

interface PlanSkeleton {
  readonly purpose: CodingPackPurpose;
  readonly selectionRules: Readonly<CodingPackSelectionRules>;
  readonly entries: readonly CodingPackReadPlanEntry[];
  readonly readRequiredCount: number;
  readonly excludedBeforeReadCount: number;
}

export async function digestCodingPackCandidatePaths(
  paths: readonly string[],
): Promise<string> {
  if (!Array.isArray(paths) || paths.length > CODING_PACK_MAX_CANDIDATE_COUNT) {
    throw new CodingPackManifestError(
      "bounds_exceeded",
      "Coding Pack candidate path count exceeds its reviewed limit.",
    );
  }
  const normalized = paths.map((path) => ({ relativePath: validatePortablePath(path) }));
  assertNoPortablePathCollisions(normalized);
  return computeCodingPackCandidatePathsDigest(normalized.map((entry) => entry.relativePath));
}

export async function planCodingPackCandidateReads(input: {
  readonly purpose: CodingPackPurpose;
  readonly selectionRules: CodingPackSelectionRules;
  readonly candidates: readonly CodingPackCandidateMetadata[];
}): Promise<Readonly<CodingPackReadPlan>> {
  const record = requirePlainRecord(input, "read plan input");
  requireExactKeys(record, ["purpose", "selectionRules", "candidates"], "read plan input");
  const purpose = validatePurpose(record.purpose);
  const selectionRules = requireReviewedRules(record.selectionRules);
  const candidates = validateMetadataArray(record.candidates, "read plan candidates");
  return finalizeReadPlan(buildPlanSkeleton(purpose, selectionRules, candidates));
}

export async function completeCodingPackSelectionFromReadPlan(input: {
  readonly plan: CodingPackReadPlan;
  readonly reads: readonly CodingPackCandidateRead[];
}): Promise<Readonly<CodingPackSelectionResult>> {
  const record = requirePlainRecord(input, "read plan completion input");
  requireExactKeys(record, ["plan", "reads"], "read plan completion input");
  const plan = await normalizeCodingPackReadPlan(record.plan);
  const reads = validateReads(record.reads);
  return completeSelection(planSkeletonFromPlan(plan), reads, plan.candidatePathsDigest);
}

export async function selectCodingPackSources(
  input: CodingPackSelectionInput,
): Promise<Readonly<CodingPackSelectionResult>> {
  const record = requirePlainRecord(input, "selection input");
  requireExactKeys(record, ["purpose", "selectionRules", "candidates"], "selection input");
  const purpose = validatePurpose(record.purpose);
  const selectionRules = requireReviewedRules(record.selectionRules);
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
  const skeleton = buildPlanSkeleton(purpose, selectionRules, candidates);
  const candidatePathsDigestPromise = computeCodingPackCandidatePathsDigest(
    skeleton.entries.map((entry) => entry.relativePath),
  );
  const reads = candidates
    .filter((candidate) =>
      skeleton.entries.find((entry) => entry.relativePath === candidate.relativePath)
        ?.disposition === "read_required"
    )
    .map((candidate) => ({
      relativePath: candidate.relativePath,
      bytes: candidate.bytes,
    }));
  const selectionPromise = completeSelection(
    skeleton,
    reads,
    candidatePathsDigestPromise,
  );
  const planPromise = finalizeReadPlan(skeleton, candidatePathsDigestPromise);
  const [selection, plan] = await Promise.all([selectionPromise, planPromise]);
  if (selection.candidatePathsDigest !== plan.candidatePathsDigest) {
    throw new CodingPackManifestError(
      "identity_mismatch",
      "Selection and read plan candidate identities differ.",
    );
  }
  return selection;
}

async function finalizeReadPlan(
  skeleton: PlanSkeleton,
  candidateDigestPromise = computeCodingPackCandidatePathsDigest(
    skeleton.entries.map((entry) => entry.relativePath),
  ),
): Promise<Readonly<CodingPackReadPlan>> {
  const candidatePathsDigest = await candidateDigestPromise;
  const withoutDigest = readPlanWithoutDigest(skeleton, candidatePathsDigest);
  const planDigest = await sha256Canonical(withoutDigest as unknown as CanonicalValue);
  return freezeReadPlan({
    ...withoutDigest,
    planDigest,
  } as CodingPackReadPlan);
}

async function normalizeCodingPackReadPlan(value: unknown): Promise<Readonly<CodingPackReadPlan>> {
  const record = requirePlainRecord(value, "Coding Pack read plan");
  requireExactKeys(
    record,
    [
      "purpose",
      "selectionRulesVersion",
      "candidatePathsDigest",
      "entries",
      "readRequiredCount",
      "excludedBeforeReadCount",
      "planDigest",
    ],
    "Coding Pack read plan",
  );
  const purpose = validatePurpose(record.purpose);
  if (record.selectionRulesVersion !== CODING_PACK_SELECTION_RULES_VERSION) {
    throw new CodingPackManifestError("unsupported_rules", "Read plan rules version is unsupported.");
  }
  const candidatePathsDigest = validateDigest(
    record.candidatePathsDigest,
    "read plan candidatePathsDigest",
  );
  const planDigest = validateDigest(record.planDigest, "read plan planDigest");
  const entries = validatePlanEntries(record.entries);
  const readRequiredCount = requireCount(record.readRequiredCount, "readRequiredCount");
  const excludedBeforeReadCount = requireCount(
    record.excludedBeforeReadCount,
    "excludedBeforeReadCount",
  );
  if (
    readRequiredCount !== entries.filter((entry) => entry.disposition === "read_required").length
    || excludedBeforeReadCount !== entries.filter((entry) => entry.disposition === "excluded").length
    || readRequiredCount + excludedBeforeReadCount !== entries.length
  ) {
    throw new CodingPackManifestError("invalid_input", "Read plan counts do not match its entries.");
  }
  const skeleton: PlanSkeleton = {
    purpose,
    selectionRules: DEFAULT_CODING_PACK_SELECTION_RULES,
    entries,
    readRequiredCount,
    excludedBeforeReadCount,
  };
  const expectedCandidateDigest = await computeCodingPackCandidatePathsDigest(
    entries.map((entry) => entry.relativePath),
  );
  if (candidatePathsDigest !== expectedCandidateDigest) {
    throw new CodingPackManifestError(
      "identity_mismatch",
      "Read plan candidate path digest does not match its entries.",
    );
  }
  const expectedPlanDigest = await sha256Canonical(
    readPlanWithoutDigest(skeleton, candidatePathsDigest) as unknown as CanonicalValue,
  );
  if (planDigest !== expectedPlanDigest) {
    throw new CodingPackManifestError(
      "identity_mismatch",
      "Read plan digest does not match its evidence.",
    );
  }
  return freezeReadPlan({
    ...readPlanWithoutDigest(skeleton, candidatePathsDigest),
    planDigest,
  } as CodingPackReadPlan);
}

function buildPlanSkeleton(
  purpose: CodingPackPurpose,
  selectionRules: Readonly<CodingPackSelectionRules>,
  candidates: readonly NormalizedMetadata[],
): PlanSkeleton {
  const sorted = [...candidates].sort((left, right) =>
    compareUtf8(left.relativePath, right.relativePath)
  );
  assertNoPortablePathCollisions(sorted);
  const entries = sorted.map((candidate) => {
    const exclusionReasonCode = classifyBeforeRead(candidate);
    return freezePlanEntry({
      relativePath: candidate.relativePath,
      originCode: candidate.originCode,
      ...(candidate.ignoredByProjectRules ? { ignoredByProjectRules: true as const } : {}),
      ...(candidate.explicitlyExcluded ? { explicitlyExcluded: true as const } : {}),
      disposition: exclusionReasonCode === undefined ? "read_required" : "excluded",
      ...(exclusionReasonCode === undefined ? {} : { exclusionReasonCode }),
    });
  });
  return Object.freeze({
    purpose,
    selectionRules,
    entries: Object.freeze(entries),
    readRequiredCount: entries.filter((entry) => entry.disposition === "read_required").length,
    excludedBeforeReadCount: entries.filter((entry) => entry.disposition === "excluded").length,
  });
}

async function completeSelection(
  skeleton: PlanSkeleton,
  reads: readonly CodingPackCandidateRead[],
  candidateDigest: string | Promise<string>,
): Promise<Readonly<CodingPackSelectionResult>> {
  const readMap = new Map(reads.map((read) => [read.relativePath, read.bytes]));
  if (readMap.size !== reads.length) {
    throw new CodingPackManifestError("duplicate_path", "Duplicate Coding Pack read result.");
  }
  const expectedReadPaths = skeleton.entries
    .filter((entry) => entry.disposition === "read_required")
    .map((entry) => entry.relativePath);
  if (
    reads.length !== expectedReadPaths.length
    || reads.some((read) => !expectedReadPaths.includes(read.relativePath))
    || expectedReadPaths.some((path) => !readMap.has(path))
  ) {
    throw new CodingPackManifestError(
      "invalid_input",
      "Read results do not exactly match the read-required plan entries.",
    );
  }

  const exclusions: CodingPackExclusion[] = skeleton.entries
    .filter((entry) => entry.disposition === "excluded")
    .map((entry) => ({
      relativePath: entry.relativePath,
      reasonCode: entry.exclusionReasonCode!,
    }));
  const validUtf8: Array<CodingPackReadPlanEntry & { readonly bytes: Uint8Array }> = [];
  let eligibleCandidateBytes = 0;
  for (const entry of skeleton.entries) {
    if (entry.disposition !== "read_required") continue;
    const bytes = readMap.get(entry.relativePath)!;
    if (bytes.byteLength > skeleton.selectionRules.maxFileBytes) {
      exclusions.push({ relativePath: entry.relativePath, reasonCode: "file_size_limit" });
      continue;
    }
    eligibleCandidateBytes += bytes.byteLength;
    if (
      !Number.isSafeInteger(eligibleCandidateBytes)
      || eligibleCandidateBytes > CODING_PACK_MAX_ELIGIBLE_CANDIDATE_BYTES
    ) {
      throw new CodingPackManifestError(
        "bounds_exceeded",
        "Coding Pack eligible candidate bytes exceed their reviewed limit.",
      );
    }
    if (!isValidUtf8(bytes)) {
      exclusions.push({ relativePath: entry.relativePath, reasonCode: "invalid_utf8" });
      continue;
    }
    validUtf8.push({ ...entry, bytes });
  }

  const accepted: typeof validUtf8 = [];
  let includedBytes = 0;
  for (const candidate of validUtf8) {
    if (accepted.length >= skeleton.selectionRules.maxFiles) {
      exclusions.push({ relativePath: candidate.relativePath, reasonCode: "file_count_limit" });
      continue;
    }
    if (includedBytes + candidate.bytes.byteLength > skeleton.selectionRules.maxTotalBytes) {
      exclusions.push({
        relativePath: candidate.relativePath,
        reasonCode: "aggregate_size_limit",
      });
      continue;
    }
    accepted.push(candidate);
    includedBytes += candidate.bytes.byteLength;
  }

  const includedPromise = Promise.all(accepted.map((candidate) =>
    createCodingPackFileEntry({
      relativePath: candidate.relativePath,
      bytes: candidate.bytes,
      inclusionReasonCode: candidate.originCode,
    })
  ));
  const included = await includedPromise;
  exclusions.sort((left, right) => compareUtf8(left.relativePath, right.relativePath));
  const candidatePathsDigest = await candidateDigest;
  const identity = await computeCodingPackSourceIdentity({
    purpose: skeleton.purpose,
    selectionRulesVersion: skeleton.selectionRules.version,
    sources: included,
    exclusions,
  });
  return freezeCodingPackSelectionResult({
    purpose: skeleton.purpose,
    selectionRulesVersion: skeleton.selectionRules.version,
    candidatePathsDigest,
    sourceFingerprint: identity.sourceFingerprint,
    packId: identity.packId,
    included,
    exclusions,
    warnings: [],
    totals: {
      candidateCount: skeleton.entries.length,
      includedCount: included.length,
      excludedCount: exclusions.length,
      includedBytes,
    },
  });
}

function validateMetadataArray(value: unknown, label: string): readonly NormalizedMetadata[] {
  if (!Array.isArray(value)) {
    throw new CodingPackManifestError("invalid_input", `${label} must be an array.`);
  }
  if (value.length > CODING_PACK_MAX_CANDIDATE_COUNT) {
    throw new CodingPackManifestError(
      "bounds_exceeded",
      "Coding Pack candidate count exceeds its reviewed limit.",
    );
  }
  return Object.freeze(value.map((candidate, index) =>
    validateMetadata(candidate, `${label} ${index}`)
  ));
}

function validateCandidate(value: unknown, index: number): Readonly<NormalizedCandidate> {
  const label = `selection candidate ${index}`;
  const record = requirePlainRecord(value, label);
  requireExactKeys(
    record,
    ["relativePath", "bytes", "originCode", "ignoredByProjectRules", "explicitlyExcluded"],
    label,
  );
  const metadata = normalizeMetadataFields(record, label);
  if (!(record.bytes instanceof Uint8Array)) {
    throw new CodingPackManifestError("invalid_input", `${label} bytes must be Uint8Array.`);
  }
  return Object.freeze({ ...metadata, bytes: record.bytes });
}

function validateMetadata(value: unknown, label: string): Readonly<NormalizedMetadata> {
  const record = requirePlainRecord(value, label);
  requireExactKeys(
    record,
    ["relativePath", "originCode", "ignoredByProjectRules", "explicitlyExcluded"],
    label,
  );
  return normalizeMetadataFields(record, label);
}

function normalizeMetadataFields(
  record: Record<string, unknown>,
  label: string,
): Readonly<NormalizedMetadata> {
  const relativePath = validatePortablePath(record.relativePath);
  if (
    typeof record.originCode !== "string"
    || !CANDIDATE_ORIGIN_CODES.has(record.originCode as CodingPackCandidateOriginCode)
  ) {
    throw new CodingPackManifestError("invalid_input", `${label} originCode is unsupported.`);
  }
  return Object.freeze({
    relativePath,
    originCode: record.originCode as CodingPackCandidateOriginCode,
    ignoredByProjectRules: optionalBoolean(record, "ignoredByProjectRules", label),
    explicitlyExcluded: optionalBoolean(record, "explicitlyExcluded", label),
  });
}

function validatePlanEntries(value: unknown): readonly CodingPackReadPlanEntry[] {
  if (!Array.isArray(value) || value.length > CODING_PACK_MAX_CANDIDATE_COUNT) {
    throw new CodingPackManifestError("bounds_exceeded", "Read plan entries exceed their limit.");
  }
  const entries = value.map((item, index) => {
    const label = `read plan entry ${index}`;
    const record = requirePlainRecord(item, label);
    requireExactKeys(
      record,
      [
        "relativePath",
        "originCode",
        "ignoredByProjectRules",
        "explicitlyExcluded",
        "disposition",
        "exclusionReasonCode",
      ],
      label,
    );
    const metadata = normalizeMetadataFields(record, label);
    if (record.disposition !== "read_required" && record.disposition !== "excluded") {
      throw new CodingPackManifestError("invalid_input", `${label} disposition is unsupported.`);
    }
    const expectedReason = classifyBeforeRead(metadata);
    if (
      (expectedReason === undefined && (
        record.disposition !== "read_required"
        || Object.prototype.hasOwnProperty.call(record, "exclusionReasonCode")
      ))
      || (expectedReason !== undefined && (
        record.disposition !== "excluded"
        || record.exclusionReasonCode !== expectedReason
      ))
    ) {
      throw new CodingPackManifestError(
        "identity_mismatch",
        "Read plan disposition does not match the shared pre-read classifier.",
      );
    }
    return freezePlanEntry({
      relativePath: metadata.relativePath,
      originCode: metadata.originCode,
      ...(metadata.ignoredByProjectRules ? { ignoredByProjectRules: true as const } : {}),
      ...(metadata.explicitlyExcluded ? { explicitlyExcluded: true as const } : {}),
      disposition: record.disposition,
      ...(expectedReason === undefined ? {} : { exclusionReasonCode: expectedReason }),
    });
  });
  const sorted = [...entries].sort((left, right) =>
    compareUtf8(left.relativePath, right.relativePath)
  );
  if (entries.some((entry, index) => entry.relativePath !== sorted[index]?.relativePath)) {
    throw new CodingPackManifestError("invalid_input", "Read plan entries are not canonical.");
  }
  assertNoPortablePathCollisions(entries);
  return Object.freeze(entries);
}

function validateReads(value: unknown): readonly CodingPackCandidateRead[] {
  if (!Array.isArray(value) || value.length > CODING_PACK_MAX_CANDIDATE_COUNT) {
    throw new CodingPackManifestError("bounds_exceeded", "Read results exceed their limit.");
  }
  return Object.freeze(value.map((item, index) => {
    const label = `read result ${index}`;
    const record = requirePlainRecord(item, label);
    requireExactKeys(record, ["relativePath", "bytes"], label);
    const relativePath = validatePortablePath(record.relativePath);
    if (!(record.bytes instanceof Uint8Array)) {
      throw new CodingPackManifestError("invalid_input", `${label} bytes must be Uint8Array.`);
    }
    return Object.freeze({ relativePath, bytes: record.bytes });
  }));
}

function planSkeletonFromPlan(plan: CodingPackReadPlan): PlanSkeleton {
  return Object.freeze({
    purpose: plan.purpose,
    selectionRules: DEFAULT_CODING_PACK_SELECTION_RULES,
    entries: plan.entries,
    readRequiredCount: plan.readRequiredCount,
    excludedBeforeReadCount: plan.excludedBeforeReadCount,
  });
}

function readPlanWithoutDigest(
  skeleton: PlanSkeleton,
  candidatePathsDigest: string,
): Omit<CodingPackReadPlan, "planDigest"> {
  return {
    purpose: skeleton.purpose,
    selectionRulesVersion: skeleton.selectionRules.version,
    candidatePathsDigest,
    entries: skeleton.entries.map((entry) => ({
      relativePath: entry.relativePath,
      originCode: entry.originCode,
      ...(entry.ignoredByProjectRules ? { ignoredByProjectRules: true } : {}),
      ...(entry.explicitlyExcluded ? { explicitlyExcluded: true } : {}),
      disposition: entry.disposition,
      ...(entry.exclusionReasonCode === undefined
        ? {}
        : { exclusionReasonCode: entry.exclusionReasonCode }),
    })),
    readRequiredCount: skeleton.readRequiredCount,
    excludedBeforeReadCount: skeleton.excludedBeforeReadCount,
  };
}

function freezeReadPlan(plan: CodingPackReadPlan): Readonly<CodingPackReadPlan> {
  return Object.freeze({
    ...plan,
    entries: Object.freeze(plan.entries.map((entry) => freezePlanEntry(entry))),
  });
}

function freezePlanEntry(entry: CodingPackReadPlanEntry): Readonly<CodingPackReadPlanEntry> {
  return Object.freeze({ ...entry });
}

function classifyBeforeRead(candidate: NormalizedMetadata): string | undefined {
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
  if (candidate.explicitlyExcluded) return "explicit_exclusion";
  if (candidate.ignoredByProjectRules) return "project_ignore";
  if (hasBinaryExtension(segments[segments.length - 1])) return "binary_like_extension";
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
  return separator >= 0
    && separator < basename.length - 1
    && BINARY_EXTENSIONS.has(basename.slice(separator + 1).toLowerCase());
}

function optionalBoolean(
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

function requireReviewedRules(value: unknown): Readonly<CodingPackSelectionRules> {
  const selectionRules = validateSelectionRules(value);
  if (selectionRules.version !== CODING_PACK_SELECTION_RULES_VERSION) {
    throw new CodingPackManifestError(
      "unsupported_rules",
      "Selection requires the reviewed KerniQ Coding Pack rules version.",
    );
  }
  return selectionRules;
}

function requireCount(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new CodingPackManifestError(
      "invalid_input",
      `Read plan ${label} must be a non-negative safe integer.`,
    );
  }
  return value as number;
}

function isValidUtf8(bytes: Uint8Array): boolean {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}
