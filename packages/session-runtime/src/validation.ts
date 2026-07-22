import type { SafeJson, SafeMetadata, SessionEntry, SessionRecord } from "./types.js";
import { SESSION_SCHEMA_VERSION } from "./types.js";

const SECRET_KEY = /^(?:api.?key|authorization|authorizationHeader|cookie|cookies|credential|credentialId|secret|secretValue|token|headers?|rawEnvironment|environmentVariables|env)$/i;
const ABSOLUTE_PATH = /^(?:[A-Za-z]:[\\/]|\\\\|\/)/;

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
    if (looksLikeSecret(value)) throw new Error(`${path} appears to contain a credential value.`);
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
    if (SECRET_KEY.test(key)) throw new Error(`${path}.${key} is not safe ledger metadata.`);
    assertSafeJson(child, `${path}.${key}`);
  }
}

export function redactJson(value: SafeJson, options: { removeAbsolutePaths?: boolean } = {}): SafeJson {
  if (typeof value === "string") {
    if (looksLikeSecret(value)) return "[redacted-secret]";
    if (options.removeAbsolutePaths && ABSOLUTE_PATH.test(value)) return "[redacted-path]";
    return value;
  }
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((item) => redactJson(item, options));
  const result: Record<string, SafeJson> = {};
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) continue;
    result[key] = redactJson(child, options);
  }
  return result;
}

function looksLikeSecret(value: string): boolean {
  return /(?:Bearer\s+[A-Za-z0-9._~+\/-]{8,}|\bsk-[A-Za-z0-9_-]{12,}|(?:api[_-]?key|authorization)\s*[:=]\s*[^\s,;]{8,})/i.test(value);
}

function validateTimestamp(value: string): void {
  if (!value || Number.isNaN(Date.parse(value))) throw new Error("A valid ISO timestamp is required.");
}
