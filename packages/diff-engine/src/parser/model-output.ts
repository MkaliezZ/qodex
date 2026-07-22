import type {
  PatchContractVersion,
  PatchError,
  PatchFile,
  PatchProposal,
} from "../models/patch.js";

export const PATCH_CONTRACT_VERSION: PatchContractVersion = "1";
export const PATCH_ENVELOPE_OPEN = "<KERNIQ_PATCH_V1>";
export const PATCH_ENVELOPE_CLOSE = "</KERNIQ_PATCH_V1>";

const ANY_PATCH_TAG = /<\/?KERNIQ_PATCH_V([^>]+)>/g;
const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".pdf", ".ico", ".svg",
  ".eot", ".ttf", ".woff", ".woff2", ".mp3", ".mp4", ".wav", ".mov",
  ".avi", ".zip", ".tar", ".gz", ".bz2", ".7z", ".rar", ".exe", ".dll",
  ".so", ".dylib", ".wasm",
]);

interface RawPatchContract {
  version: unknown;
  summary: unknown;
  files: unknown;
}

export interface ModelPatchParseResult {
  assistantText: string;
  proposal: PatchProposal | null;
  error: PatchError | null;
}

function errorResult(
  assistantText: string,
  code: PatchError["code"],
  message: string,
  path?: string,
): ModelPatchParseResult {
  return {
    assistantText,
    proposal: null,
    error: { code, message, ...(path ? { path } : {}) },
  };
}

function countOccurrences(value: string, marker: string): number {
  let count = 0;
  let offset = 0;
  while ((offset = value.indexOf(marker, offset)) !== -1) {
    count += 1;
    offset += marker.length;
  }
  return count;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isSafeProjectRelativePath(path: string): boolean {
  if (!path || path !== path.trim() || path.includes("\0") || path.includes("\\")) {
    return false;
  }
  if (path.startsWith("/") || path.startsWith("//") || /^[A-Za-z]:\//.test(path)) {
    return false;
  }
  const segments = path.split("/");
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

export function isUnsupportedBinaryPath(path: string): boolean {
  const lower = path.toLowerCase();
  for (const extension of BINARY_EXTENSIONS) {
    if (lower.endsWith(extension)) return true;
  }
  return false;
}

/**
 * Removes complete or currently-streaming patch envelopes from assistant text.
 * This keeps machine-readable replacement content out of the human timeline.
 */
export function extractAssistantText(response: string): string {
  const firstTag = response.search(/<KERNIQ_PATCH_V/);
  if (firstTag === -1) return response.trim();

  const before = response.slice(0, firstTag);
  const closeStart = response.indexOf(">", firstTag);
  if (closeStart === -1) return before.trim();

  const openingTag = response.slice(firstTag, closeStart + 1);
  const versionMatch = openingTag.match(/^<KERNIQ_PATCH_V([^>]+)>$/);
  if (!versionMatch) return before.trim();

  const closingTag = `</KERNIQ_PATCH_V${versionMatch[1]}>`;
  const closeIndex = response.indexOf(closingTag, closeStart + 1);
  if (closeIndex === -1) return before.trim();

  const after = response.slice(closeIndex + closingTag.length);
  return [before.trim(), after.trim()].filter(Boolean).join("\n\n");
}

export function parseModelPatchResponse(response: string, taskId: string): ModelPatchParseResult {
  const assistantText = extractAssistantText(response);
  const tags = [...response.matchAll(ANY_PATCH_TAG)];

  if (tags.length === 0) {
    return errorResult(
      assistantText,
      "patch_not_present",
      "The model response did not include a patch proposal.",
    );
  }

  const unsupportedTag = tags.find((match) => match[1] !== PATCH_CONTRACT_VERSION);
  if (unsupportedTag) {
    return errorResult(
      assistantText,
      "unsupported_patch_version",
      `Patch contract version ${unsupportedTag[1]} is not supported.`,
    );
  }

  const openCount = countOccurrences(response, PATCH_ENVELOPE_OPEN);
  const closeCount = countOccurrences(response, PATCH_ENVELOPE_CLOSE);
  if (openCount !== 1 || closeCount !== 1) {
    return errorResult(
      assistantText,
      "patch_parse_failed",
      "The model response must contain exactly one complete KERNIQ_PATCH_V1 envelope.",
    );
  }

  const openIndex = response.indexOf(PATCH_ENVELOPE_OPEN);
  const closeIndex = response.indexOf(PATCH_ENVELOPE_CLOSE);
  if (closeIndex < openIndex) {
    return errorResult(
      assistantText,
      "patch_parse_failed",
      "The patch envelope closing tag appears before its opening tag.",
    );
  }

  const rawJson = response.slice(openIndex + PATCH_ENVELOPE_OPEN.length, closeIndex).trim();
  let raw: RawPatchContract;
  try {
    raw = JSON.parse(rawJson) as RawPatchContract;
  } catch {
    return errorResult(
      assistantText,
      "patch_parse_failed",
      "The KERNIQ_PATCH_V1 envelope contains malformed JSON.",
    );
  }

  if (!isRecord(raw)) {
    return errorResult(assistantText, "invalid_patch_shape", "The patch payload must be a JSON object.");
  }
  if (typeof raw.version !== "string") {
    return errorResult(assistantText, "invalid_patch_shape", "Patch version must be a string.");
  }
  if (raw.version !== PATCH_CONTRACT_VERSION) {
    return errorResult(
      assistantText,
      "unsupported_patch_version",
      `Patch contract version ${String(raw.version)} is not supported.`,
    );
  }
  if (typeof raw.summary !== "string" || raw.summary.trim().length === 0) {
    return errorResult(assistantText, "invalid_patch_shape", "Patch summary must be a non-empty string.");
  }
  if (!Array.isArray(raw.files) || raw.files.length === 0) {
    return errorResult(assistantText, "invalid_patch_shape", "Patch files must be a non-empty array.");
  }

  const files: PatchFile[] = [];
  const seenPaths = new Set<string>();
  for (const candidate of raw.files) {
    if (!isRecord(candidate)) {
      return errorResult(assistantText, "invalid_patch_shape", "Every patch file must be an object.");
    }
    const { path, oldContent, newContent } = candidate;
    if (typeof path !== "string" || typeof oldContent !== "string" || typeof newContent !== "string") {
      return errorResult(
        assistantText,
        "invalid_patch_shape",
        "Each patch file requires string path, oldContent, and newContent fields.",
      );
    }
    if (!isSafeProjectRelativePath(path)) {
      return errorResult(assistantText, "unsafe_path", `Patch path is not project-relative: ${path}`, path);
    }
    if (seenPaths.has(path)) {
      return errorResult(assistantText, "duplicate_patch_path", `Patch path appears more than once: ${path}`, path);
    }
    if (isUnsupportedBinaryPath(path) || oldContent.includes("\0") || newContent.includes("\0")) {
      return errorResult(assistantText, "binary_file_unsupported", `Binary file patches are not supported: ${path}`, path);
    }
    if (oldContent === newContent) {
      return errorResult(assistantText, "invalid_patch_shape", `Patch does not change file content: ${path}`, path);
    }
    seenPaths.add(path);
    files.push({ path, oldContent, newContent });
  }

  return {
    assistantText,
    proposal: {
      id: crypto.randomUUID(),
      taskId,
      contractVersion: PATCH_CONTRACT_VERSION,
      summary: raw.summary,
      files,
      createdAt: new Date().toISOString(),
    },
    error: null,
  };
}
