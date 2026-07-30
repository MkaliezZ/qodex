import {
  CODING_PACK_MAX_CANDIDATE_COUNT,
  CODING_PACK_MAX_ELIGIBLE_CANDIDATE_BYTES,
  CODING_PACK_SELECTION_RULES_VERSION,
  DEFAULT_CODING_PACK_SELECTION_RULES,
  completeCodingPackSelectionFromReadPlan,
  createCodingPackManifestFromSelection,
  digestCodingPackCandidatePaths,
  planCodingPackCandidateReads,
  verifyCodingPackManifest,
  verifyCodingPackSelectionResult,
  type CodingPackManifest,
  type CodingPackPurpose,
  type CodingPackSelectionResult,
} from "@qodex/coding-pack-runtime";
import {
  CODING_PACK_PROJECT_SOURCE_MAX_BYTES,
  CodingPackProjectSourceError,
  isSafeProjectRelativePath,
  type CodingPackProjectSourceAdapter,
} from "@qodex/project-runtime";

export type CodingPackPreviewErrorCode =
  | "coding_pack_no_selection"
  | "coding_pack_project_changed"
  | "coding_pack_read_failed"
  | "coding_pack_source_too_large"
  | "coding_pack_selection_failed"
  | "coding_pack_preview_stale"
  | "coding_pack_confirmation_mismatch";

export class CodingPackPreviewError extends Error {
  constructor(readonly code: CodingPackPreviewErrorCode) {
    super(code);
    this.name = "CodingPackPreviewError";
  }
}

export interface CodingPackPreview {
  readonly projectBindingId: string;
  readonly projectGeneration: number;
  readonly selectedPathsDigest: string;
  readonly selection: CodingPackSelectionResult;
  readonly manifest: CodingPackManifest;
  readonly createdAt: string;
}

export interface CodingPackPreviewConfirmation {
  readonly confirmationId: string;
  readonly projectBindingId: string;
  readonly projectGeneration: number;
  readonly selectedPathsDigest: string;
  readonly sourceFingerprint: string;
  readonly packId: string;
  readonly manifestDigest: string;
  readonly confirmedAt: string;
}

export interface CodingPackPreviewBinding {
  readonly projectBindingId: string;
  readonly projectGeneration: number;
  readonly selectedPathsDigest: string;
  readonly purpose: CodingPackPurpose;
  readonly selectionRulesVersion: string;
}

export interface CreateCodingPackPreviewInput {
  readonly projectBindingId: string;
  readonly projectGeneration: number;
  readonly selectedPaths: readonly string[];
  readonly purpose: CodingPackPurpose;
  readonly source: CodingPackProjectSourceAdapter;
  readonly createdAt?: string;
}

export async function createSelectedFileCodingPackPreview(
  input: CreateCodingPackPreviewInput,
): Promise<Readonly<CodingPackPreview>> {
  if (
    !input.projectBindingId
    || !Number.isSafeInteger(input.projectGeneration)
    || input.projectGeneration < 1
  ) {
    throw new CodingPackPreviewError("coding_pack_project_changed");
  }

  const selectedPaths = canonicalSelectedPaths(input.selectedPaths);
  if (selectedPaths.length === 0) {
    throw new CodingPackPreviewError("coding_pack_no_selection");
  }
  if (selectedPaths.length > CODING_PACK_MAX_CANDIDATE_COUNT) {
    throw new CodingPackPreviewError("coding_pack_selection_failed");
  }

  try {
    const plan = await planCodingPackCandidateReads({
      purpose: input.purpose,
      selectionRules: DEFAULT_CODING_PACK_SELECTION_RULES,
      candidates: selectedPaths.map((relativePath) => ({
        relativePath,
        originCode: "explicit_selection" as const,
      })),
    });
    const reads: Array<{ relativePath: string; bytes: Uint8Array }> = [];
    let eligibleReadBytes = 0;

    for (const entry of plan.entries) {
      if (entry.disposition !== "read_required") continue;
      const relativePath = entry.relativePath;
      let bytes: Uint8Array;
      try {
        bytes = await input.source.readFileBytes(relativePath);
      } catch (error) {
        if (
          error instanceof CodingPackProjectSourceError
          && error.code === "coding_pack_source_too_large"
        ) {
          throw new CodingPackPreviewError("coding_pack_source_too_large");
        }
        throw new CodingPackPreviewError("coding_pack_read_failed");
      }
      if (!(bytes instanceof Uint8Array)) {
        throw new CodingPackPreviewError("coding_pack_read_failed");
      }
      if (bytes.byteLength > CODING_PACK_PROJECT_SOURCE_MAX_BYTES) {
        throw new CodingPackPreviewError("coding_pack_source_too_large");
      }
      eligibleReadBytes += bytes.byteLength;
      if (
        !Number.isSafeInteger(eligibleReadBytes)
        || eligibleReadBytes > CODING_PACK_MAX_ELIGIBLE_CANDIDATE_BYTES
      ) {
        throw new CodingPackPreviewError("coding_pack_selection_failed");
      }
      reads.push({ relativePath, bytes });
    }

    const selection = await completeCodingPackSelectionFromReadPlan({ plan, reads });
    if (selection.candidatePathsDigest !== plan.candidatePathsDigest) {
      throw new CodingPackPreviewError("coding_pack_selection_failed");
    }
    const createdAt = canonicalTimestamp(input.createdAt ?? new Date().toISOString());
    const manifest = await createCodingPackManifestFromSelection({
      selection,
      generatedAt: createdAt,
    });
    return Object.freeze({
      projectBindingId: input.projectBindingId,
      projectGeneration: input.projectGeneration,
      selectedPathsDigest: selection.candidatePathsDigest,
      selection,
      manifest,
      createdAt,
    });
  } catch (error) {
    if (error instanceof CodingPackPreviewError) throw error;
    throw new CodingPackPreviewError("coding_pack_selection_failed");
  }
}

export async function digestSelectedPaths(
  selectedPaths: readonly string[],
): Promise<string> {
  try {
    return await digestCodingPackCandidatePaths(canonicalSelectedPaths(selectedPaths));
  } catch {
    throw new CodingPackPreviewError("coding_pack_selection_failed");
  }
}

export function isCodingPackPreviewStale(
  preview: CodingPackPreview,
  current: CodingPackPreviewBinding,
): boolean {
  return preview.projectBindingId !== current.projectBindingId
    || preview.projectGeneration !== current.projectGeneration
    || preview.selectedPathsDigest !== current.selectedPathsDigest
    || preview.selection.purpose !== current.purpose
    || preview.selection.selectionRulesVersion !== current.selectionRulesVersion;
}

export async function confirmCodingPackPreview(
  preview: CodingPackPreview,
  current: CodingPackPreviewBinding,
  options: { confirmationId?: string; confirmedAt?: string } = {},
): Promise<Readonly<CodingPackPreviewConfirmation>> {
  await verifyPreviewIntegrity(preview);
  if (isCodingPackPreviewStale(preview, current)) {
    throw new CodingPackPreviewError("coding_pack_preview_stale");
  }
  const confirmationId = options.confirmationId ?? crypto.randomUUID();
  if (!confirmationId || confirmationId.length > 256) {
    throw new CodingPackPreviewError("coding_pack_confirmation_mismatch");
  }
  const confirmedAt = canonicalTimestamp(
    options.confirmedAt ?? new Date().toISOString(),
  );
  return Object.freeze({
    confirmationId,
    projectBindingId: preview.projectBindingId,
    projectGeneration: preview.projectGeneration,
    selectedPathsDigest: preview.selectedPathsDigest,
    sourceFingerprint: preview.selection.sourceFingerprint,
    packId: preview.selection.packId,
    manifestDigest: preview.manifest.manifestDigest,
    confirmedAt,
  });
}

export async function verifyCodingPackPreviewConfirmation(
  confirmation: unknown,
  preview: CodingPackPreview,
): Promise<void> {
  await verifyPreviewIntegrity(preview);
  const record = exactRecord(
    confirmation,
    [
      "confirmationId",
      "projectBindingId",
      "projectGeneration",
      "selectedPathsDigest",
      "sourceFingerprint",
      "packId",
      "manifestDigest",
      "confirmedAt",
    ],
  );
  if (
    typeof record.confirmationId !== "string"
    || !record.confirmationId
    || record.confirmationId.length > 256
    || record.projectBindingId !== preview.projectBindingId
    || record.projectGeneration !== preview.projectGeneration
    || record.selectedPathsDigest !== preview.selectedPathsDigest
    || record.sourceFingerprint !== preview.selection.sourceFingerprint
    || record.packId !== preview.selection.packId
    || record.manifestDigest !== preview.manifest.manifestDigest
  ) {
    throw new CodingPackPreviewError("coding_pack_confirmation_mismatch");
  }
  canonicalTimestamp(record.confirmedAt);
}

export const codingPackSelectionRulesVersion = CODING_PACK_SELECTION_RULES_VERSION;

async function verifyPreviewIntegrity(preview: CodingPackPreview): Promise<void> {
  try {
    const record = exactRecord(
      preview,
      [
        "projectBindingId",
        "projectGeneration",
        "selectedPathsDigest",
        "selection",
        "manifest",
        "createdAt",
      ],
    );
    if (
      typeof record.projectBindingId !== "string"
      || !record.projectBindingId
      || !Number.isSafeInteger(record.projectGeneration)
      || (record.projectGeneration as number) < 1
      || !isDigest(record.selectedPathsDigest)
    ) {
      throw new CodingPackPreviewError("coding_pack_confirmation_mismatch");
    }
    canonicalTimestamp(record.createdAt);
    await verifyCodingPackSelectionResult(record.selection);
    await verifyCodingPackManifest(record.manifest);
    const selection = record.selection as CodingPackSelectionResult;
    const manifest = record.manifest as CodingPackManifest;
    if (
      record.selectedPathsDigest !== selection.candidatePathsDigest
      || manifest.sourceFingerprint !== selection.sourceFingerprint
      || manifest.packId !== selection.packId
      || manifest.purpose !== selection.purpose
      || manifest.selectionRulesVersion !== selection.selectionRulesVersion
      || manifest.generatedAt !== record.createdAt
    ) {
      throw new CodingPackPreviewError("coding_pack_confirmation_mismatch");
    }
  } catch (error) {
    if (error instanceof CodingPackPreviewError) throw error;
    throw new CodingPackPreviewError("coding_pack_confirmation_mismatch");
  }
}

function canonicalSelectedPaths(selectedPaths: readonly string[]): readonly string[] {
  if (!Array.isArray(selectedPaths)) {
    throw new CodingPackPreviewError("coding_pack_selection_failed");
  }
  const unique = new Set<string>();
  for (const path of selectedPaths) {
    if (
      typeof path !== "string"
      || !isSafeProjectRelativePath(path)
      || !hasWellFormedUnicode(path)
      || unique.has(path)
    ) {
      throw new CodingPackPreviewError("coding_pack_selection_failed");
    }
    unique.add(path);
  }
  return Object.freeze([...unique].sort(compareUtf8));
}

function compareUtf8(left: string, right: string): number {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.min(leftBytes.byteLength, rightBytes.byteLength);
  for (let index = 0; index < length; index += 1) {
    const difference = leftBytes[index] - rightBytes[index];
    if (difference !== 0) return difference;
  }
  return leftBytes.byteLength - rightBytes.byteLength;
}

function hasWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function canonicalTimestamp(value: unknown): string {
  if (
    typeof value !== "string"
    || !value
    || Number.isNaN(Date.parse(value))
    || new Date(value).toISOString() !== value
  ) {
    throw new CodingPackPreviewError("coding_pack_confirmation_mismatch");
  }
  return value;
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new CodingPackPreviewError("coding_pack_confirmation_mismatch");
  }
  const record = value as Record<string, unknown>;
  const actualKeys = Object.keys(record).sort();
  const expectedKeys = [...keys].sort();
  if (
    actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new CodingPackPreviewError("coding_pack_confirmation_mismatch");
  }
  return record;
}

function isDigest(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}
