import { compareUtf8 } from "./canonical.js";
import { CodingPackManifestError } from "./errors.js";
import type {
  CodingPackExclusion,
  CodingPackFileEntry,
} from "./types.js";
import {
  validateExclusion,
  validateFileEntry,
} from "./validation.js";

export function validateAndSortCodingPackSources(
  value: unknown,
  requireCanonicalOrder: boolean,
): CodingPackFileEntry[] {
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

export function validateAndSortCodingPackExclusions(
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

export function validateCodingPackPathSets(
  sources: readonly CodingPackFileEntry[],
  exclusions: readonly CodingPackExclusion[],
): void {
  const sourcePaths = new Set(sources.map((source) => source.relativePath));
  if (exclusions.some((exclusion) => sourcePaths.has(exclusion.relativePath))) {
    throw new CodingPackManifestError(
      "path_overlap",
      "A path cannot be both included and excluded.",
    );
  }
}

export function validateCodingPackBounds(
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
