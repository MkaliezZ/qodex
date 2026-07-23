import type { SafeJson, SafeMetadata, SessionEntry, SessionRecord } from "./types.js";
import { SESSION_SCHEMA_VERSION } from "./types.js";
import {
  inspectSensitiveText,
  isSensitiveFieldName,
  sanitizeSensitiveJson,
  sanitizeSensitiveText,
} from "./sensitive-text.js";

export interface SanitizedEntryData {
  payload: SafeJson;
  safeMetadata: SafeMetadata;
}

export function validateSession(session: SessionRecord): void {
  if (!session.id.trim() || !session.title.trim()) throw new Error("Session identity and title are required.");
  if (session.schemaVersion !== SESSION_SCHEMA_VERSION) throw new Error("Unsupported session schema version.");
  validateTimestamp(session.createdAt);
  validateTimestamp(session.updatedAt);
}

export function validateEntry(entry: SessionEntry): void {
  if (!entry.id.trim() || !entry.sessionId.trim() || !entry.type.trim()) throw new Error("Ledger entry identity is required.");
  if (!Number.isInteger(entry.sequence) || entry.sequence < 1) throw new Error("Ledger sequence must be a positive integer.");
  if (!Number.isInteger(entry.payloadVersion) || entry.payloadVersion < 1) throw new Error("Payload version must be positive.");
  validateTimestamp(entry.createdAt);
  assertSafeJson(entry.payload, "payload");
  assertSafeMetadata(entry.safeMetadata);
}

export function assertSafeMetadata(metadata: SafeMetadata): void {
  assertSafeJson(metadata as SafeJson, "safeMetadata");
}

export function assertSafeJson(value: SafeJson, path: string): void {
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "string") {
    if (inspectSensitiveText(value).hasSensitiveText) {
      throw new Error(`${path} contains recognised sensitive text.`);
    }
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${path} contains a non-finite number.`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafeJson(item, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (isSensitiveFieldName(key)) throw new Error(`${path}.${key} is not safe ledger metadata.`);
    assertSafeJson(child, `${path}.${key}`);
  }
}

export function sanitizeEntryForPersistence(
  type: SessionEntry["type"],
  payload: SafeJson,
  safeMetadata: SafeMetadata,
): SanitizedEntryData {
  if (type !== "PATCH_PROPOSED") {
    return {
      payload: sanitizeSensitiveJson(payload),
      safeMetadata: sanitizeSensitiveJson(safeMetadata as SafeJson) as SafeMetadata,
    };
  }

  const patch = isRecord(payload) ? payload : {};
  const files = Array.isArray(patch.files) ? patch.files : [];
  const sensitiveContent = files.some((file) => isRecord(file)
    && [file.path, file.oldContent, file.newContent].some((content) => (
      typeof content === "string" && inspectSensitiveText(content).hasSensitiveText
    )));
  if (!sensitiveContent) {
    return {
      payload: sanitizeSensitiveJson(payload),
      safeMetadata: sanitizeSensitiveJson(safeMetadata as SafeJson) as SafeMetadata,
    };
  }

  const sanitizedPatch = sanitizeSensitiveJson(patch) as Record<string, SafeJson>;
  sanitizedPatch.files = files.map((file): SafeJson => {
    if (!isRecord(file)) return {};
    return {
      path: typeof file.path === "string" ? sanitizeSensitiveText(file.path) : "[unavailable]",
      contentRedacted: true,
    };
  });
  return {
    payload: sanitizedPatch,
    safeMetadata: {
      ...(sanitizeSensitiveJson(safeMetadata as SafeJson) as SafeMetadata),
      recoverable: false,
      sensitiveContentRedacted: true,
    },
  };
}

export function redactJson(value: SafeJson): SafeJson {
  return sanitizeSensitiveJson(value);
}

function validateTimestamp(value: string): void {
  if (!value || Number.isNaN(Date.parse(value))) throw new Error("A valid ISO timestamp is required.");
}

function isRecord(value: SafeJson): value is Record<string, SafeJson> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
