import { sha256Canonical, type CanonicalValue } from "./canonical.js";
import { CodingPackStoreError } from "./errors.js";
import {
  CODING_PACK_EVENT_VERSION,
  CODING_PACK_EXPORT_APPROVAL_SCHEMA_VERSION,
  CODING_PACK_EXPORT_FORMAT,
  CODING_PACK_EXPORT_PROPOSAL_SCHEMA_VERSION,
  type CodingPackConfirmedEventPayload,
  type CodingPackDestinationBinding,
  type CodingPackEvent,
  type CodingPackExportApproval,
  type CodingPackExportProposal,
  type CodingPackOperationRecord,
  type CodingPackPreviewConfirmationEvidence,
  type CodingPackPreviewIdentity,
  type CodingPackProposedEventPayload,
} from "./types.js";

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const MAX_ID_LENGTH = 256;
const MAX_LABEL_LENGTH = 256;
const MAX_EVENT_PAYLOAD_BYTES = 64 * 1024;

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
  requireId(proposal.operationId);
  requireId(proposal.projectBindingId);
  requireGeneration(proposal.projectGeneration);
  requireDigest(proposal.candidatePathsDigest);
  requireDigest(proposal.sourceFingerprint);
  requireId(proposal.packId);
  requireDigest(proposal.manifestDigest);
  requireId(proposal.destinationBindingId);
  requireDigest(proposal.destinationFingerprint);
  const createdAt = timestamp(proposal.createdAt);
  const expiresAt = timestamp(proposal.expiresAt);
  if (expiresAt <= createdAt) invalid();
  requireDigest(proposal.proposalDigest);
  const typed = proposal as unknown as CodingPackExportProposal;
  if (typed.proposalDigest !== await createProposalDigest(typed)) invalid();
  return Object.freeze({ ...typed });
}

export function validateCodingPackExportApproval(
  value: unknown,
  proposal?: CodingPackExportProposal,
  now: Date = new Date(),
): CodingPackExportApproval {
  const approval = exactRecord(value, APPROVAL_KEYS);
  if (approval.schemaVersion !== CODING_PACK_EXPORT_APPROVAL_SCHEMA_VERSION) {
    mismatch();
  }
  requireId(approval.operationId, mismatch);
  requireDigest(approval.proposalDigest, mismatch);
  const approvedAt = timestamp(approval.approvedAt, mismatch);
  const expiresAt = timestamp(approval.expiresAt, mismatch);
  if (expiresAt <= approvedAt || expiresAt <= now.getTime()) mismatch();
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
  requireId(previewRecord.projectBindingId);
  requireGeneration(previewRecord.projectGeneration);
  requireDigest(previewRecord.candidatePathsDigest);
  requireDigest(previewRecord.sourceFingerprint);
  requireId(previewRecord.packId);
  requireDigest(previewRecord.manifestDigest);
  requireId(confirmationRecord.projectBindingId);
  requireGeneration(confirmationRecord.projectGeneration);
  requireDigest(confirmationRecord.selectedPathsDigest);
  requireDigest(confirmationRecord.sourceFingerprint);
  requireId(confirmationRecord.packId);
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
  requireId(binding.destinationBindingId);
  requireDigest(binding.destinationFingerprint);
  if (
    typeof binding.displayLabel !== "string"
    || !binding.displayLabel.trim()
    || binding.displayLabel.length > MAX_LABEL_LENGTH
    || /[\u0000-\u001f\u007f]/u.test(binding.displayLabel)
  ) {
    destinationUnavailable();
  }
  timestamp(binding.createdAt, destinationUnavailable);
  if (typeof binding.restartAvailable !== "boolean") destinationUnavailable();
  return Object.freeze({ ...(binding as unknown as CodingPackDestinationBinding) });
}

export function validateOperationRecord(value: unknown): CodingPackOperationRecord {
  const operation = exactRecord(value, OPERATION_KEYS);
  requireId(operation.operationId);
  if (operation.state !== "proposed" && operation.state !== "confirmed") invalid();
  requireId(operation.projectBindingId);
  requireGeneration(operation.projectGeneration);
  requireDigest(operation.candidatePathsDigest);
  requireDigest(operation.sourceFingerprint);
  requireId(operation.packId);
  requireDigest(operation.manifestDigest);
  requireId(operation.destinationBindingId);
  requireDigest(operation.proposalDigest);
  const createdAt = timestamp(operation.createdAt);
  const expiresAt = timestamp(operation.expiresAt);
  if (expiresAt <= createdAt) invalid();
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
  requireId(event.eventId);
  requireId(event.operationId);
  const eventSequence = event.eventSequence;
  if (
    typeof eventSequence !== "number"
    || !Number.isSafeInteger(eventSequence)
    || eventSequence < 1
  ) {
    invalid();
  }
  if (event.eventType !== "PACK_PROPOSED" && event.eventType !== "PACK_CONFIRMED") invalid();
  if (event.eventVersion !== CODING_PACK_EVENT_VERSION) invalid();
  timestamp(event.recordedAt);
  requireDigest(event.payloadDigest);
  const payload = event.eventType === "PACK_PROPOSED"
    ? await validateProposedPayload(event.payload)
    : validateConfirmedPayload(event.payload);
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
  const approvalValue = payload.approval as { approvedAt?: unknown } | null;
  const approvedAt = approvalValue && typeof approvalValue.approvedAt === "string"
    ? Date.parse(approvalValue.approvedAt)
    : Number.NaN;
  return Object.freeze({
    approval: validateCodingPackExportApproval(
      payload.approval,
      undefined,
      new Date(Number.isFinite(approvedAt) ? approvedAt - 1 : 0),
    ),
  });
}

function exactRecord<const Keys extends readonly string[]>(
  value: unknown,
  keys: Keys,
): { [Key in Keys[number]]: unknown } {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    invalid();
  }
  return record as { [Key in Keys[number]]: unknown };
}

function requireId(value: unknown, fail: () => never = invalid): asserts value is string {
  if (
    typeof value !== "string"
    || !value
    || value.length > MAX_ID_LENGTH
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    fail();
  }
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
  if (typeof value !== "string") fail();
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) fail();
  return parsed;
}

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
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
