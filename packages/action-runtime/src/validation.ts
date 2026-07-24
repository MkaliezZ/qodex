import { ActionRuntimeError } from "./errors.js";
import type {
  ActionApproval,
  ActionDecision,
  ActionOutcome,
  ActionProposal,
  ActionProposalInput,
  ActionStarted,
  JsonValue,
} from "./types.js";

const ACTION_SCHEMA_VERSION = "kerniq.action.v1";
export const DEFAULT_ACTION_JSON_SIZE_LIMIT = 64 * 1024;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const SAFE_ERROR_MESSAGE_PATTERN = /^[^\u0000-\u001f\u007f]*$/;
const RFC3339_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
type JsonValidationCode = "invalid_proposal" | "invalid_decision" | "invalid_outcome";

export async function createActionProposal(input: ActionProposalInput): Promise<ActionProposal> {
  const proposalWithoutDigest = {
    schemaVersion: ACTION_SCHEMA_VERSION,
    ...input,
  } satisfies Omit<ActionProposal, "proposalDigest">;
  validateProposalFields(proposalWithoutDigest);
  return {
    ...proposalWithoutDigest,
    proposalDigest: await computeProposalDigest(proposalWithoutDigest),
  };
}

export async function validateActionProposal(proposal: ActionProposal): Promise<void> {
  validateProposalFields(proposal);
  const expected = await computeProposalDigest(proposal);
  if (proposal.proposalDigest !== expected) {
    throw new ActionRuntimeError("invalid_proposal", "Action proposal digest does not match its content.");
  }
}

export function validateActionApproval(
  approval: ActionApproval,
  proposal?: ActionProposal,
  expectedGeneration?: number,
  now: Date = new Date(),
): void {
  requireText(approval.approvalId, "approvalId", "invalid_approval");
  requireText(approval.actionId, "actionId", "invalid_approval");
  requireText(approval.taskId, "taskId", "invalid_approval");
  if (!SHA256_PATTERN.test(approval.proposalDigest)) {
    throw new ActionRuntimeError("invalid_approval", "proposalDigest must be a SHA-256 digest.");
  }
  if (!Number.isInteger(approval.generation) || approval.generation <= 0) {
    throw new ActionRuntimeError("invalid_approval", "generation must be a positive integer.");
  }
  const approvedAt = timestamp(approval.approvedAt, "approvedAt", "invalid_approval");
  const expiresAt = timestamp(approval.expiresAt, "expiresAt", "invalid_approval");
  if (expiresAt <= now.getTime()) {
    throw new ActionRuntimeError("approval_expired", "Approval has expired.");
  }
  if (expiresAt <= approvedAt) {
    throw new ActionRuntimeError("invalid_approval", "expiresAt must be later than approvedAt.");
  }
  if (proposal && (
    approval.actionId !== proposal.actionId
    || approval.taskId !== proposal.taskId
    || approval.proposalDigest !== proposal.proposalDigest
  )) {
    throw new ActionRuntimeError("approval_mismatch", "Approval does not bind the exact action proposal.");
  }
  if (expectedGeneration !== undefined && approval.generation !== expectedGeneration) {
    throw new ActionRuntimeError(
      "approval_generation_mismatch",
      "Approval generation is stale or unexpected.",
    );
  }
}

export function validateActionDecision(
  decision: ActionDecision,
  proposal?: ActionProposal,
  evidenceSizeLimit = DEFAULT_ACTION_JSON_SIZE_LIMIT,
): void {
  requireText(decision.decisionId, "decisionId", "invalid_decision");
  requireText(decision.actionId, "actionId", "invalid_decision");
  if (proposal && decision.actionId !== proposal.actionId) {
    throw new ActionRuntimeError("decision_mismatch", "Decision does not match the action.");
  }
  if (!["allow", "deny", "hold", "error"].includes(decision.decision)) {
    throw new ActionRuntimeError("invalid_decision", "Decision value is unsupported.");
  }
  requireText(decision.reasonCode, "reasonCode", "invalid_decision");
  requireText(decision.summary, "summary", "invalid_decision");
  requireText(decision.policyVersion, "policyVersion", "invalid_decision");
  validateBoundedJsonValue(
    decision.evidence,
    evidenceSizeLimit,
    "invalid_decision",
    "Decision evidence",
  );
  timestamp(decision.decidedAt, "decidedAt", "invalid_decision");
}

export function validateActionStarted(
  started: ActionStarted,
  proposal?: ActionProposal,
  approval?: ActionApproval,
  decision?: ActionDecision,
  now: Date = new Date(),
): void {
  requireText(started.actionId, "actionId", "invalid_started");
  requireText(started.approvalId, "approvalId", "invalid_started");
  requireText(started.decisionId, "decisionId", "invalid_started");
  requireText(started.executionReceiptId, "executionReceiptId", "invalid_started");
  timestamp(started.startedAt, "startedAt", "invalid_started");
  if (proposal && started.actionId !== proposal.actionId) {
    throw new ActionRuntimeError("invalid_started", "Started receipt targets a different proposal.");
  }
  if (approval && started.approvalId !== approval.approvalId) {
    throw new ActionRuntimeError("invalid_started", "Started receipt targets a different approval.");
  }
  if (proposal && approval) {
    validateActionApproval(approval, proposal, approval.generation, now);
  }
  if (decision && (
    decision.decision !== "allow"
    || started.decisionId !== decision.decisionId
  )) {
    throw new ActionRuntimeError("invalid_started", "Started receipt requires the accepted allow decision.");
  }
}

export function validateActionOutcome(
  outcome: ActionOutcome,
  proposal?: ActionProposal,
  started?: ActionStarted,
  jsonSizeLimit = DEFAULT_ACTION_JSON_SIZE_LIMIT,
): void {
  requireText(outcome.actionId, "actionId", "invalid_outcome");
  requireText(outcome.executionReceiptId, "executionReceiptId", "invalid_outcome");
  if (!["completed", "failed", "cancelled", "unknown_or_interrupted"].includes(outcome.status)) {
    throw new ActionRuntimeError("invalid_outcome", "Outcome status is unsupported.");
  }
  timestamp(outcome.settledAt, "settledAt", "invalid_outcome");
  if (proposal && outcome.actionId !== proposal.actionId) {
    throw new ActionRuntimeError("invalid_outcome", "Outcome targets a different proposal.");
  }
  if (started && outcome.executionReceiptId !== started.executionReceiptId) {
    throw new ActionRuntimeError("invalid_outcome", "Outcome targets a different execution receipt.");
  }
  if (outcome.result !== undefined) {
    validateBoundedJsonValue(outcome.result, jsonSizeLimit, "invalid_outcome", "Outcome result");
  }
  if (outcome.error !== undefined) {
    requireText(outcome.error.code, "error.code", "invalid_outcome");
    requireText(outcome.error.message, "error.message", "invalid_outcome");
    if (
      outcome.error.message.length > 500
      || !SAFE_ERROR_MESSAGE_PATTERN.test(outcome.error.message)
    ) {
      throw new ActionRuntimeError("invalid_outcome", "Outcome error message is not safe.");
    }
  }
  if (outcome.status === "completed" && outcome.error !== undefined) {
    throw new ActionRuntimeError("invalid_outcome", "Completed outcome cannot contain an error.");
  }
  if (outcome.status !== "completed" && outcome.result !== undefined) {
    throw new ActionRuntimeError("invalid_outcome", "Non-completed outcome cannot contain a result.");
  }
  if (
    (outcome.status === "failed" || outcome.status === "cancelled")
    && outcome.error === undefined
  ) {
    throw new ActionRuntimeError("invalid_outcome", "Failed or cancelled outcome requires an error.");
  }
  if (outcome.status === "unknown_or_interrupted" && outcome.error?.code !== "settlement_persistence_failed") {
    throw new ActionRuntimeError(
      "invalid_outcome",
      "Interrupted settlement requires settlement_persistence_failed evidence.",
    );
  }
}

export async function computeProposalDigest(
  proposal: Omit<ActionProposal, "proposalDigest"> | ActionProposal,
): Promise<string> {
  const {
    proposalDigest: _ignored,
    ...digestable
  } = proposal as ActionProposal;
  const encoded = new TextEncoder().encode(canonicalJson(digestable as unknown as JsonValue));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoded);
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new ActionRuntimeError("invalid_proposal", "Action proposal contains a non-finite number.");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
}

function validateBoundedJsonValue(
  value: unknown,
  limit: number,
  code: JsonValidationCode,
  label: string,
): void {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new ActionRuntimeError(code, `${label} size limit is invalid.`);
  }
  assertJsonValue(value, code, label, new Set());
  const encoded = new TextEncoder().encode(canonicalJson(value as JsonValue));
  if (encoded.byteLength > limit) {
    throw new ActionRuntimeError(code, `${label} exceeds the configured size limit.`);
  }
}

function assertJsonValue(
  value: unknown,
  code: JsonValidationCode,
  label: string,
  ancestors: Set<object>,
): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return;
    throw new ActionRuntimeError(code, `${label} contains a non-finite number.`);
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      throw new ActionRuntimeError(code, `${label} contains a circular reference.`);
    }
    ancestors.add(value);
    for (const item of value) assertJsonValue(item, code, label, ancestors);
    ancestors.delete(value);
    return;
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new ActionRuntimeError(code, `${label} contains a non-JSON object.`);
    }
    if (ancestors.has(value)) {
      throw new ActionRuntimeError(code, `${label} contains a circular reference.`);
    }
    ancestors.add(value);
    for (const item of Object.values(value as Record<string, unknown>)) {
      assertJsonValue(item, code, label, ancestors);
    }
    ancestors.delete(value);
    return;
  }
  throw new ActionRuntimeError(code, `${label} is not valid JSON.`);
}

function requireText(
  value: unknown,
  fieldName: string,
  code: "invalid_approval" | "invalid_decision" | "invalid_started" | "invalid_outcome",
): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ActionRuntimeError(code, `${fieldName} must be a non-empty string.`);
  }
}

function timestamp(
  value: unknown,
  fieldName: string,
  code:
    | "invalid_proposal"
    | "invalid_approval"
    | "invalid_decision"
    | "invalid_started"
    | "invalid_outcome",
): number {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ActionRuntimeError(code, `${fieldName} must be a valid timestamp.`);
  }
  if (!RFC3339_PATTERN.test(value)) {
    throw new ActionRuntimeError(code, `${fieldName} must be an RFC 3339 timestamp.`);
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new ActionRuntimeError(code, `${fieldName} must be a valid timestamp.`);
  }
  return parsed;
}

function validateProposalFields(proposal: Omit<ActionProposal, "proposalDigest"> | ActionProposal): void {
  if (proposal.schemaVersion !== ACTION_SCHEMA_VERSION) {
    throw new ActionRuntimeError("invalid_proposal", "Unsupported action proposal schema version.");
  }
  for (const [name, value] of [
    ["actionId", proposal.actionId],
    ["taskId", proposal.taskId],
    ["actionType", proposal.actionType],
    ["title", proposal.title],
    ["summary", proposal.summary],
    ["requestedAt", proposal.requestedAt],
  ]) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new ActionRuntimeError("invalid_proposal", `${name} must be a non-empty string.`);
    }
  }
  if (!["read", "write", "process", "network", "external"].includes(proposal.risk)) {
    throw new ActionRuntimeError("invalid_proposal", "Action proposal risk is invalid.");
  }
  if (Number.isNaN(Date.parse(proposal.requestedAt))) {
    throw new ActionRuntimeError("invalid_proposal", "Action proposal requestedAt is invalid.");
  }
  timestamp(proposal.requestedAt, "requestedAt", "invalid_proposal");
  assertJsonValue(
    proposal.parameters,
    "invalid_proposal",
    "Action parameters",
    new Set(),
  );
  canonicalJson(proposal.parameters);
}
