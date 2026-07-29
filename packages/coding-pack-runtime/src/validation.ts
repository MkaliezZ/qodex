import {
  CODING_PACK_MAX_EXCLUSION_DETAIL_BYTES,
  CODING_PACK_MAX_PROJECT_LABEL_BYTES,
  CODING_PACK_MAX_REASON_BYTES,
  CODING_PACK_MAX_RELATIVE_PATH_BYTES,
  DEFAULT_CODING_PACK_SELECTION_RULES,
} from "./constants.js";
import { CodingPackManifestError } from "./errors.js";
import type {
  CodingPackExclusion,
  CodingPackFileEntry,
  CodingPackPortableProject,
  CodingPackPurpose,
  CodingPackSelectionRules,
} from "./types.js";

const encoder = new TextEncoder();
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const REASON_CODE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const RFC3339_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/;
const LOCAL_IDENTITY_FIELD_PATTERN =
  /\b(?:projectBindingId|projectFingerprint|privateRootPath|destinationHandle)\b/iu;
const LOCAL_PROJECT_ID_PATTERN = /\bproject-[0-9a-f]{16,}\b/iu;
const LOCAL_FINGERPRINT_PATTERN = /\bsha256:[0-9a-f]{64}\b/iu;
const DESTINATION_HANDLE_PATTERN = /\bdestination[-_]handle(?:[-_:][a-z0-9._-]+)?\b/iu;

export const CODING_PACK_PURPOSES: ReadonlySet<CodingPackPurpose> = new Set([
  "repository_orientation",
  "task_context",
  "review_handoff",
]);

export function requirePlainRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CodingPackManifestError("invalid_input", `${label} must be an object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new CodingPackManifestError("invalid_input", `${label} must be a plain object.`);
  }
  return value as Record<string, unknown>;
}

export function requireExactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const allowedKeys = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !allowedKeys.has(key));
  if (unknown.length > 0) {
    throw new CodingPackManifestError(
      "invalid_input",
      `${label} contains unsupported field "${unknown[0]}".`,
    );
  }
}

export function validatePurpose(value: unknown): CodingPackPurpose {
  if (typeof value !== "string" || !CODING_PACK_PURPOSES.has(value as CodingPackPurpose)) {
    throw new CodingPackManifestError("invalid_input", "Coding Pack purpose is unsupported.");
  }
  return value as CodingPackPurpose;
}

export function validatePortablePath(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new CodingPackManifestError("invalid_path", "Portable path must be non-empty.");
  }
  if (encoder.encode(value).byteLength > CODING_PACK_MAX_RELATIVE_PATH_BYTES) {
    throw new CodingPackManifestError("invalid_path", "Portable path exceeds its UTF-8 byte limit.");
  }
  if (CONTROL_CHARACTER_PATTERN.test(value)) {
    throw new CodingPackManifestError("invalid_path", "Portable path contains a control character.");
  }
  if (value.includes("\\")) {
    throw new CodingPackManifestError("invalid_path", "Portable path must use forward slashes.");
  }
  if (value.startsWith("/") || /^[A-Za-z]:/u.test(value) || value.startsWith("//")) {
    throw new CodingPackManifestError("invalid_path", "Portable path must be project-relative.");
  }
  if (value.endsWith("/")) {
    throw new CodingPackManifestError("invalid_path", "Portable path must not end with a slash.");
  }
  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new CodingPackManifestError("invalid_path", "Portable path contains an unsafe segment.");
  }
  return value;
}

export function validateSelectionRules(value: unknown): Readonly<CodingPackSelectionRules> {
  const record = requirePlainRecord(value, "selectionRules");
  requireExactKeys(
    record,
    ["version", "maxFiles", "maxFileBytes", "maxTotalBytes"],
    "selectionRules",
  );
  const version = requireBoundedText(record.version, "selectionRules.version", 128);
  const maxFiles = requirePositiveSafeInteger(record.maxFiles, "selectionRules.maxFiles");
  const maxFileBytes = requirePositiveSafeInteger(
    record.maxFileBytes,
    "selectionRules.maxFileBytes",
  );
  const maxTotalBytes = requirePositiveSafeInteger(
    record.maxTotalBytes,
    "selectionRules.maxTotalBytes",
  );

  if (
    maxFiles !== DEFAULT_CODING_PACK_SELECTION_RULES.maxFiles
    || maxFileBytes !== DEFAULT_CODING_PACK_SELECTION_RULES.maxFileBytes
    || maxTotalBytes !== DEFAULT_CODING_PACK_SELECTION_RULES.maxTotalBytes
  ) {
    throw new CodingPackManifestError(
      "unsupported_rules",
      "v0.7.1 supports only the reviewed Coding Pack numeric limits.",
    );
  }

  return Object.freeze({ version, maxFiles, maxFileBytes, maxTotalBytes });
}

export function validatePortableProject(value: unknown): Readonly<CodingPackPortableProject> {
  if (value === undefined) return Object.freeze({});
  const record = requirePlainRecord(value, "project");
  requireExactKeys(record, ["projectLabel"], "project");
  if (!Object.prototype.hasOwnProperty.call(record, "projectLabel")) {
    return Object.freeze({});
  }
  const projectLabel = requireBoundedText(
    record.projectLabel,
    "project.projectLabel",
    CODING_PACK_MAX_PROJECT_LABEL_BYTES,
  );
  return Object.freeze({ projectLabel });
}

export function validateFileEntry(value: unknown): Readonly<CodingPackFileEntry> {
  const record = requirePlainRecord(value, "source");
  requireExactKeys(
    record,
    ["relativePath", "sourceDigest", "byteCount", "encoding", "inclusionReason"],
    "source",
  );
  const relativePath = validatePortablePath(record.relativePath);
  const sourceDigest = validateDigest(record.sourceDigest, "source.sourceDigest");
  const byteCount = requireNonNegativeSafeInteger(record.byteCount, "source.byteCount");
  if (record.encoding !== "utf-8") {
    throw new CodingPackManifestError("invalid_input", "source.encoding must be utf-8.");
  }
  const inclusionReason = requireBoundedText(
    record.inclusionReason,
    "source.inclusionReason",
    CODING_PACK_MAX_REASON_BYTES,
  );
  return Object.freeze({
    relativePath,
    sourceDigest,
    byteCount,
    encoding: "utf-8",
    inclusionReason,
  });
}

export function validateExclusion(value: unknown): Readonly<CodingPackExclusion> {
  const record = requirePlainRecord(value, "exclusion");
  requireExactKeys(record, ["relativePath", "reasonCode", "detail"], "exclusion");
  const relativePath = validatePortablePath(record.relativePath);
  if (typeof record.reasonCode !== "string" || !REASON_CODE_PATTERN.test(record.reasonCode)) {
    throw new CodingPackManifestError(
      "invalid_input",
      "exclusion.reasonCode must be a bounded machine-readable code.",
    );
  }
  if (!Object.prototype.hasOwnProperty.call(record, "detail")) {
    return Object.freeze({ relativePath, reasonCode: record.reasonCode });
  }
  const detail = validateExclusionDetail(record.detail);
  return Object.freeze({ relativePath, reasonCode: record.reasonCode, detail });
}

function validateExclusionDetail(value: unknown): string {
  const detail = requireBoundedText(
    value,
    "exclusion.detail",
    CODING_PACK_MAX_EXCLUSION_DETAIL_BYTES,
  );
  if (detail.includes("/") || detail.includes("\\")) {
    throw new CodingPackManifestError(
      "invalid_input",
      "exclusion.detail must not contain path separators.",
    );
  }
  if (
    LOCAL_IDENTITY_FIELD_PATTERN.test(detail)
    || LOCAL_PROJECT_ID_PATTERN.test(detail)
    || LOCAL_FINGERPRINT_PATTERN.test(detail)
    || DESTINATION_HANDLE_PATTERN.test(detail)
  ) {
    throw new CodingPackManifestError(
      "invalid_input",
      "exclusion.detail must not contain local authority identity.",
    );
  }
  return detail;
}

export function validateDigest(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new CodingPackManifestError("invalid_digest", `${label} must be a SHA-256 digest.`);
  }
  return value;
}

export function validatePackId(value: unknown): string {
  if (typeof value !== "string" || !/^pack-[0-9a-f]{64}$/u.test(value)) {
    throw new CodingPackManifestError("invalid_input", "packId is malformed.");
  }
  return value;
}

export function validateTimestamp(value: unknown): string {
  if (typeof value !== "string") {
    throw new CodingPackManifestError("invalid_timestamp", "generatedAt must be RFC 3339.");
  }
  const match = RFC3339_PATTERN.exec(value);
  if (!match) {
    throw new CodingPackManifestError("invalid_timestamp", "generatedAt must be RFC 3339.");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (
    year < 1
    || month < 1
    || month > 12
    || day < 1
    || day > daysInMonth(year, month)
    || hour > 23
    || minute > 59
    || second > 59
  ) {
    throw new CodingPackManifestError("invalid_timestamp", "generatedAt is not a real timestamp.");
  }
  const zone = match[8];
  if (zone !== "Z") {
    const zoneHour = Number(zone.slice(1, 3));
    const zoneMinute = Number(zone.slice(4, 6));
    if (zoneHour > 23 || zoneMinute > 59) {
      throw new CodingPackManifestError("invalid_timestamp", "generatedAt has an invalid offset.");
    }
  }
  if (Number.isNaN(Date.parse(value))) {
    throw new CodingPackManifestError("invalid_timestamp", "generatedAt is not parseable.");
  }
  return value;
}

export function requireBoundedText(value: unknown, label: string, maxBytes: number): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value !== value.trim()
    || CONTROL_CHARACTER_PATTERN.test(value)
    || encoder.encode(value).byteLength > maxBytes
  ) {
    throw new CodingPackManifestError(
      "invalid_input",
      `${label} must be non-empty, trimmed, control-free, and bounded.`,
    );
  }
  return value;
}

function requirePositiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new CodingPackManifestError("invalid_input", `${label} must be a positive safe integer.`);
  }
  return value as number;
}

function requireNonNegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new CodingPackManifestError(
      "invalid_input",
      `${label} must be a non-negative safe integer.`,
    );
  }
  return value as number;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}
