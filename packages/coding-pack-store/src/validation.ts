import {
  requireWellFormedUnicode,
  sha256Canonical,
  utf8ByteLength,
  type CanonicalValue,
} from "./canonical.js";
import { CodingPackStoreError } from "./errors.js";
import {
  CODING_PACK_AGENTFUSE_EXPORT_PROTOCOL,
  CODING_PACK_AGENTFUSE_EXPORT_TOOL,
  CODING_PACK_EVENT_VERSION,
  CODING_PACK_EXPORT_APPROVAL_SCHEMA_VERSION,
  CODING_PACK_EXPORT_FORMAT,
  CODING_PACK_EXPORT_PROPOSAL_SCHEMA_VERSION,
  type CodingPackAgentFuseExportRequestIdentity,
  type CodingPackConfirmedEventPayload,
  type CodingPackDecidedEventPayload,
  type CodingPackDestinationBinding,
  type CodingPackEvent,
  type CodingPackExportApproval,
  type CodingPackExportProposal,
  type CodingPackOperationRecord,
  type CodingPackPreviewConfirmationEvidence,
  type CodingPackPreviewIdentity,
  type CodingPackProposedEventPayload,
} from "./types.js";

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const PACK_ID_PATTERN = /^pack-[0-9a-f]{64}$/u;
const DESTINATION_BINDING_ID_PATTERN = /^destination-[0-9a-f]{24}$/u;
const CONTROL_PATTERN = /\p{Cc}/u;
const REASON_CODE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/u;
const MAX_ID_BYTES = 256;
const MAX_LABEL_BYTES = 256;
const MAX_EVENT_PAYLOAD_BYTES = 64 * 1024;
export const CODING_PACK_MAX_PROPOSAL_LIFETIME_MS = 86_400_000;
export const CODING_PACK_MAX_APPROVAL_LIFETIME_MS = 86_400_000;

const PROPOSAL_KEYS = [
  "schemaVersion",
  "operationId",
  "projectBindingId",
  "projectGeneration",
  "candidatePathsDigest",
  "sourceFingerprint",
  "packId",
  "manifestDigest",
  "destinationBindingId",
  "destinationFingerprint",
  "exportFormat",
  "createdAt",
  "expiresAt",
  "proposalDigest",
] as const;

const APPROVAL_KEYS = [
  "schemaVersion",
  "operationId",
  "proposalDigest",
  "approvedAt",
  "expiresAt",
] as const;

const OPERATION_KEYS = [
  "operationId",
  "state",
  "projectBindingId",
  "projectGeneration",
  "candidatePathsDigest",
  "sourceFingerprint",
  "packId",
  "manifestDigest",
  "destinationBindingId",
  "proposalDigest",
  "createdAt",
  "expiresAt",
  "lastEventSequence",
] as const;

const DESTINATION_KEYS = [
  "destinationBindingId",
  "destinationFingerprint",
  "displayLabel",
  "createdAt",
  "restartAvailable",
] as const;

const EVENT_KEYS = [
  "eventId",
  "operationId",
  "eventSequence",
  "eventType",
  "eventVersion",
  "recordedAt",
  "payloadDigest",
  "payload",
] as const;

const DECIDED_PAYLOAD_KEYS = [
  "decisionId",
  "requestDigest",
  "proposalDigest",
  "approvalEvidenceDigest",
  "agentFuseSourceCommit",
  "agentFusePackageVersion",
  "bridgeProtocol",
  "policyId",
  "policyDigest",
  "decision",
  "reasonCode",
  "evaluationStartedAt",
  "decidedAt",
] as const;

const AGENTFUSE_EXPORT_REQUEST_KEYS = [
  "protocolVersion",
  "operationId",
  "proposalDigest",
  "approvalEvidenceDigest",
  "candidatePathsDigest",
  "sourceFingerprint",
  "packId",
  "manifestDigest",
  "destinationBindingId",
  "destinationFingerprint",
  "exportFormat",
] as const;

export async function createProposalDigest(
  proposal: Omit<CodingPackExportProposal, "proposalDigest"> | CodingPackExportProposal,
): Promise<string> {
  const { proposalDigest: _ignored, ...digestable } =
    proposal as CodingPackExportProposal;
  return sha256Canonical(digestable);
}

export async function createEventPayloadDigest(
  payload: CodingPackEvent["payload"],
): Promise<string> {
  return sha256Canonical(payload as unknown as CanonicalValue);
}

export function createCodingPackAgentFuseExportRequestIdentity(
  proposal: CodingPackExportProposal,
  approvalEvidenceDigest: string,
): CodingPackAgentFuseExportRequestIdentity {
  return validateCodingPackAgentFuseExportRequestIdentity({
    protocolVersion: CODING_PACK_AGENTFUSE_EXPORT_PROTOCOL,
    operationId: proposal.operationId,
    proposalDigest: proposal.proposalDigest,
    approvalEvidenceDigest,
    candidatePathsDigest: proposal.candidatePathsDigest,
    sourceFingerprint: proposal.sourceFingerprint,
    packId: proposal.packId,
    manifestDigest: proposal.manifestDigest,
    destinationBindingId: proposal.destinationBindingId,
    destinationFingerprint: proposal.destinationFingerprint,
    exportFormat: CODING_PACK_EXPORT_FORMAT,
  });
}

export function validateCodingPackAgentFuseExportRequestIdentity(
  value: unknown,
): CodingPackAgentFuseExportRequestIdentity {
  const request = exactRecord(value, AGENTFUSE_EXPORT_REQUEST_KEYS);
  if (
    request.protocolVersion !== CODING_PACK_AGENTFUSE_EXPORT_PROTOCOL
    || request.exportFormat !== CODING_PACK_EXPORT_FORMAT
  ) {
    invalid();
  }
  requireOpaqueId(request.operationId);
  if (absolutePathLike(request.operationId)) invalid();
  requireDigest(request.proposalDigest);
  requireDigest(request.approvalEvidenceDigest);
  requireDigest(request.candidatePathsDigest);
  requireDigest(request.sourceFingerprint);
  requirePackId(request.packId);
  requireDigest(request.manifestDigest);
  requireDestinationBindingId(request.destinationBindingId);
  requireDigest(request.destinationFingerprint);
  return Object.freeze({
    ...(request as unknown as CodingPackAgentFuseExportRequestIdentity),
  });
}

export async function createCodingPackAgentFuseRequestDigest(
  request: CodingPackAgentFuseExportRequestIdentity,
): Promise<string> {
  const validated = validateCodingPackAgentFuseExportRequestIdentity(request);
  return sha256Canonical({
    toolIdentity: CODING_PACK_AGENTFUSE_EXPORT_TOOL,
    request: validated,
  } as unknown as CanonicalValue);
}

export async function validateCodingPackExportProposal(
  value: unknown,
): Promise<CodingPackExportProposal> {
  const proposal = exactRecord(value, PROPOSAL_KEYS);
  if (
    proposal.schemaVersion !== CODING_PACK_EXPORT_PROPOSAL_SCHEMA_VERSION
    || proposal.exportFormat !== CODING_PACK_EXPORT_FORMAT
  ) {
    invalid();
  }
  requireOpaqueId(proposal.operationId);
  requireOpaqueId(proposal.projectBindingId);
  requireGeneration(proposal.projectGeneration);
  requireDigest(proposal.candidatePathsDigest);
  requireDigest(proposal.sourceFingerprint);
  requirePackId(proposal.packId);
  requireDigest(proposal.manifestDigest);
  requireDestinationBindingId(proposal.destinationBindingId);
  requireDigest(proposal.destinationFingerprint);
  const createdAt = timestamp(proposal.createdAt);
  const expiresAt = timestamp(proposal.expiresAt);
  if (
    expiresAt <= createdAt
    || expiresAt - createdAt > CODING_PACK_MAX_PROPOSAL_LIFETIME_MS
  ) {
    invalid();
  }
  requireDigest(proposal.proposalDigest);
  const typed = proposal as unknown as CodingPackExportProposal;
  if (typed.proposalDigest !== await createProposalDigest(typed)) invalid();
  return Object.freeze({ ...typed });
}

export function validateCodingPackExportApproval(
  value: unknown,
  proposal?: CodingPackExportProposal,
  now: Date | null = new Date(),
): CodingPackExportApproval {
  const approval = exactRecord(value, APPROVAL_KEYS);
  if (approval.schemaVersion !== CODING_PACK_EXPORT_APPROVAL_SCHEMA_VERSION) {
    mismatch();
  }
  requireOpaqueId(approval.operationId, mismatch);
  requireDigest(approval.proposalDigest, mismatch);
  const approvedAt = timestamp(approval.approvedAt, mismatch);
  const expiresAt = timestamp(approval.expiresAt, mismatch);
  if (
    expiresAt <= approvedAt
    || expiresAt - approvedAt > CODING_PACK_MAX_APPROVAL_LIFETIME_MS
    || (now && expiresAt <= now.getTime())
  ) {
    mismatch();
  }
  if (proposal && (
    approval.operationId !== proposal.operationId
    || approval.proposalDigest !== proposal.proposalDigest
    || approvedAt >= timestamp(proposal.expiresAt)
    || expiresAt > timestamp(proposal.expiresAt)
  )) {
    mismatch();
  }
  return Object.freeze({ ...(approval as unknown as CodingPackExportApproval) });
}

export function validatePreviewBinding(
  preview: unknown,
  confirmation: unknown,
): {
  preview: CodingPackPreviewIdentity;
  confirmation: CodingPackPreviewConfirmationEvidence;
} {
  const previewRecord = exactRecord(preview, [
    "projectBindingId",
    "projectGeneration",
    "candidatePathsDigest",
    "sourceFingerprint",
    "packId",
    "manifestDigest",
  ]);
  const confirmationRecord = exactRecord(confirmation, [
    "projectBindingId",
    "projectGeneration",
    "selectedPathsDigest",
    "sourceFingerprint",
    "packId",
    "manifestDigest",
    "confirmedAt",
  ]);
  requireOpaqueId(previewRecord.projectBindingId);
  requireGeneration(previewRecord.projectGeneration);
  requireDigest(previewRecord.candidatePathsDigest);
  requireDigest(previewRecord.sourceFingerprint);
  requirePackId(previewRecord.packId);
  requireDigest(previewRecord.manifestDigest);
  requireOpaqueId(confirmationRecord.projectBindingId);
  requireGeneration(confirmationRecord.projectGeneration);
  requireDigest(confirmationRecord.selectedPathsDigest);
  requireDigest(confirmationRecord.sourceFingerprint);
  requirePackId(confirmationRecord.packId);
  requireDigest(confirmationRecord.manifestDigest);
  timestamp(confirmationRecord.confirmedAt);
  if (
    previewRecord.projectBindingId !== confirmationRecord.projectBindingId
    || previewRecord.projectGeneration !== confirmationRecord.projectGeneration
    || previewRecord.candidatePathsDigest !== confirmationRecord.selectedPathsDigest
    || previewRecord.sourceFingerprint !== confirmationRecord.sourceFingerprint
    || previewRecord.packId !== confirmationRecord.packId
    || previewRecord.manifestDigest !== confirmationRecord.manifestDigest
  ) {
    invalid();
  }
  return {
    preview: Object.freeze({ ...(previewRecord as unknown as CodingPackPreviewIdentity) }),
    confirmation: Object.freeze({
      ...(confirmationRecord as unknown as CodingPackPreviewConfirmationEvidence),
    }),
  };
}

export function validateDestinationBinding(value: unknown): CodingPackDestinationBinding {
  const binding = exactRecord(value, DESTINATION_KEYS);
  requireDestinationBindingId(binding.destinationBindingId, destinationUnavailable);
  requireDigest(binding.destinationFingerprint, destinationUnavailable);
  if (
    typeof binding.displayLabel !== "string"
    || !binding.displayLabel.trim()
    || !wellFormedWithinBytes(
      binding.displayLabel,
      MAX_LABEL_BYTES,
      "destination display label",
    )
    || CONTROL_PATTERN.test(binding.displayLabel)
  ) {
    destinationUnavailable();
  }
  timestamp(binding.createdAt, destinationUnavailable);
  if (typeof binding.restartAvailable !== "boolean") destinationUnavailable();
  return Object.freeze({ ...(binding as unknown as CodingPackDestinationBinding) });
}

export function validateOperationRecord(value: unknown): CodingPackOperationRecord {
  const operation = exactRecord(value, OPERATION_KEYS);
  requireOpaqueId(operation.operationId);
  if (
    operation.state !== "proposed"
    && operation.state !== "confirmed"
    && operation.state !== "decided_allow"
    && operation.state !== "decided_deny"
    && operation.state !== "decided_error"
  ) {
    invalid();
  }
  requireOpaqueId(operation.projectBindingId);
  requireGeneration(operation.projectGeneration);
  requireDigest(operation.candidatePathsDigest);
  requireDigest(operation.sourceFingerprint);
  requirePackId(operation.packId);
  requireDigest(operation.manifestDigest);
  requireDestinationBindingId(operation.destinationBindingId);
  requireDigest(operation.proposalDigest);
  const createdAt = timestamp(operation.createdAt);
  const expiresAt = timestamp(operation.expiresAt);
  if (
    expiresAt <= createdAt
    || expiresAt - createdAt > CODING_PACK_MAX_PROPOSAL_LIFETIME_MS
  ) {
    invalid();
  }
  const lastEventSequence = operation.lastEventSequence;
  if (
    typeof lastEventSequence !== "number"
    || !Number.isSafeInteger(lastEventSequence)
    || lastEventSequence < 1
  ) {
    invalid();
  }
  return Object.freeze({ ...(operation as unknown as CodingPackOperationRecord) });
}

export async function validateEvent(value: unknown): Promise<CodingPackEvent> {
  const event = exactRecord(value, EVENT_KEYS);
  requireOpaqueId(event.eventId);
  requireOpaqueId(event.operationId);
  const eventSequence = event.eventSequence;
  if (
    typeof eventSequence !== "number"
    || !Number.isSafeInteger(eventSequence)
    || eventSequence < 1
  ) {
    invalid();
  }
  if (
    event.eventType !== "PACK_PROPOSED"
    && event.eventType !== "PACK_CONFIRMED"
    && event.eventType !== "PACK_DECIDED"
  ) {
    invalid();
  }
  if (event.eventVersion !== CODING_PACK_EVENT_VERSION) invalid();
  timestamp(event.recordedAt);
  requireDigest(event.payloadDigest);
  const payload = event.eventType === "PACK_PROPOSED"
    ? await validateProposedPayload(event.payload)
    : event.eventType === "PACK_CONFIRMED"
      ? validateConfirmedPayload(event.payload)
      : validateDecidedPayload(event.payload);
  if (byteLength(payload) > MAX_EVENT_PAYLOAD_BYTES) invalid();
  if (event.payloadDigest !== await createEventPayloadDigest(payload)) invalid();
  return Object.freeze({
    ...(event as unknown as CodingPackEvent),
    payload,
  });
}

async function validateProposedPayload(value: unknown): Promise<CodingPackProposedEventPayload> {
  const payload = exactRecord(value, ["proposal"]);
  return Object.freeze({
    proposal: await validateCodingPackExportProposal(payload.proposal),
  });
}

function validateConfirmedPayload(value: unknown): CodingPackConfirmedEventPayload {
  const payload = exactRecord(value, ["approval"]);
  return Object.freeze({
    approval: validateCodingPackExportApproval(payload.approval, undefined, null),
  });
}

export function validateDecidedPayload(
  value: unknown,
): CodingPackDecidedEventPayload {
  const payload = exactRecord(value, DECIDED_PAYLOAD_KEYS);
  requireOpaqueId(payload.decisionId);
  requireDigest(payload.requestDigest);
  requireDigest(payload.proposalDigest);
  requireDigest(payload.approvalEvidenceDigest);
  if (
    payload.agentFuseSourceCommit
      !== "ec4b5842339dccfba0db62df7541920759203bc9"
    || payload.agentFusePackageVersion !== "3.6.0"
    || payload.bridgeProtocol !== "kerniq.agentfuse.bridge.v1"
    || payload.policyId !== "kerniq-coding-pack-export-v1"
    || payload.policyDigest
      !== "sha256:752a8bf1f251e5c05f07ddd8d820af3c5554fb37e3a47fbcf41933f614167d07"
    || (payload.decision !== "allow"
      && payload.decision !== "deny"
      && payload.decision !== "error")
    || typeof payload.reasonCode !== "string"
    || !REASON_CODE_PATTERN.test(payload.reasonCode)
  ) {
    invalid();
  }
  requireDigest(payload.policyDigest);
  timestamp(payload.evaluationStartedAt);
  timestamp(payload.decidedAt);
  return Object.freeze({
    ...(payload as unknown as CodingPackDecidedEventPayload),
  });
}

function exactRecord<const Keys extends readonly string[]>(
  value: unknown,
  keys: Keys,
): { [Key in Keys[number]]: unknown } {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record);
  const expected = new Set<string>(keys);
  if (
    actual.length !== expected.size
    || actual.some((key) => !expected.has(key))
  ) {
    invalid();
  }
  return record as { [Key in Keys[number]]: unknown };
}

function requireOpaqueId(
  value: unknown,
  fail: () => never = invalid,
): asserts value is string {
  if (
    typeof value !== "string"
    || !value
    || !wellFormedWithinBytes(value, MAX_ID_BYTES, "opaque identifier")
    || CONTROL_PATTERN.test(value)
  ) {
    fail();
  }
}

function absolutePathLike(value: string): boolean {
  return value.startsWith("/")
    || value.startsWith("\\")
    || /^[a-z]:[\\/]/iu.test(value)
    || value.toLowerCase().startsWith("file://");
}

function requirePackId(
  value: unknown,
  fail: () => never = invalid,
): asserts value is string {
  if (typeof value !== "string" || !PACK_ID_PATTERN.test(value)) fail();
}

function requireDestinationBindingId(
  value: unknown,
  fail: () => never = invalid,
): asserts value is string {
  if (typeof value !== "string" || !DESTINATION_BINDING_ID_PATTERN.test(value)) fail();
}

function requireDigest(
  value: unknown,
  fail: () => never = invalid,
): asserts value is string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) fail();
}

function requireGeneration(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) invalid();
}

function timestamp(value: unknown, fail: () => never = invalid): number {
  if (
    typeof value !== "string"
    || !wellFormedWithinBytes(value, 64, "timestamp")
  ) {
    fail();
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) fail();
  return parsed;
}

function byteLength(value: unknown): number {
  const serialized = JSON.stringify(value);
  if (typeof serialized !== "string") invalid();
  return utf8ByteLength(serialized, "event payload");
}

function wellFormedWithinBytes(value: string, maxBytes: number, label: string): boolean {
  try {
    requireWellFormedUnicode(value, label);
    return utf8ByteLength(value, label) <= maxBytes;
  } catch {
    return false;
  }
}

function invalid(): never {
  throw new CodingPackStoreError("coding_pack_proposal_invalid");
}

function mismatch(): never {
  throw new CodingPackStoreError("coding_pack_approval_mismatch");
}

function destinationUnavailable(): never {
  throw new CodingPackStoreError("coding_pack_destination_unavailable");
}
