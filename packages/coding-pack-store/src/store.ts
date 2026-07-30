import { sha256Text } from "./canonical.js";
import { CodingPackStoreError } from "./errors.js";
import type {
  CodingPackDestinationBinding,
  CodingPackEvent,
  CodingPackExportApproval,
  CodingPackOperationRecord,
  CodingPackOperationSnapshot,
  CodingPackStoreAdapter,
  CodingPackStoreOptions,
  CreateCodingPackExportApprovalInput,
  CreateCodingPackExportProposalInput,
} from "./types.js";
import {
  CODING_PACK_EVENT_VERSION,
  CODING_PACK_EXPORT_APPROVAL_SCHEMA_VERSION,
  CODING_PACK_EXPORT_FORMAT,
  CODING_PACK_EXPORT_PROPOSAL_SCHEMA_VERSION,
} from "./types.js";
import {
  createEventPayloadDigest,
  createProposalDigest,
  validateCodingPackExportApproval,
  validateCodingPackExportProposal,
  validateDestinationBinding,
  validateEvent,
  validateOperationRecord,
  validatePreviewBinding,
} from "./validation.js";

const DEFAULT_LIFETIME_MS = 10 * 60 * 1000;

export class CodingPackStore {
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly proposalLifetimeMs: number;
  private readonly approvalLifetimeMs: number;

  constructor(
    private readonly adapter: CodingPackStoreAdapter,
    options: CodingPackStoreOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? (() => crypto.randomUUID());
    this.proposalLifetimeMs = positiveLifetime(options.proposalLifetimeMs);
    this.approvalLifetimeMs = positiveLifetime(options.approvalLifetimeMs);
  }

  async registerDestinationBinding(
    value: CodingPackDestinationBinding,
  ): Promise<CodingPackDestinationBinding> {
    const binding = validateDestinationBinding(value);
    try {
      await this.adapter.registerDestinationBinding(binding);
      return binding;
    } catch (error) {
      throw persistenceError(error);
    }
  }

  async createCodingPackExportProposal(
    input: CreateCodingPackExportProposalInput,
  ): Promise<CodingPackOperationSnapshot> {
    const { preview } = validatePreviewBinding(
      input.preview,
      input.previewConfirmation,
    );
    const destination = validateDestinationBinding(input.destination);
    const createdAt = canonicalTimestamp(input.createdAt ?? this.now().toISOString());
    const expiresAt = canonicalTimestamp(
      input.expiresAt
        ?? new Date(Date.parse(createdAt) + this.proposalLifetimeMs).toISOString(),
    );
    const proposalWithoutDigest = {
      schemaVersion: CODING_PACK_EXPORT_PROPOSAL_SCHEMA_VERSION,
      operationId: boundedId(input.operationId ?? this.createId()),
      projectBindingId: preview.projectBindingId,
      projectGeneration: preview.projectGeneration,
      candidatePathsDigest: preview.candidatePathsDigest,
      sourceFingerprint: preview.sourceFingerprint,
      packId: preview.packId,
      manifestDigest: preview.manifestDigest,
      destinationBindingId: destination.destinationBindingId,
      destinationFingerprint: destination.destinationFingerprint,
      exportFormat: CODING_PACK_EXPORT_FORMAT,
      createdAt,
      expiresAt,
    } as const;
    const proposal = await validateCodingPackExportProposal({
      ...proposalWithoutDigest,
      proposalDigest: await createProposalDigest(proposalWithoutDigest),
    });
    const payload = Object.freeze({ proposal });
    const proposedEvent = await validateEvent({
      eventId: boundedId(this.createId()),
      operationId: proposal.operationId,
      eventSequence: 1,
      eventType: "PACK_PROPOSED",
      eventVersion: CODING_PACK_EVENT_VERSION,
      recordedAt: createdAt,
      payloadDigest: await createEventPayloadDigest(payload),
      payload,
    });
    const operation = validateOperationRecord({
      operationId: proposal.operationId,
      state: "proposed",
      projectBindingId: proposal.projectBindingId,
      projectGeneration: proposal.projectGeneration,
      candidatePathsDigest: proposal.candidatePathsDigest,
      sourceFingerprint: proposal.sourceFingerprint,
      packId: proposal.packId,
      manifestDigest: proposal.manifestDigest,
      destinationBindingId: proposal.destinationBindingId,
      proposalDigest: proposal.proposalDigest,
      createdAt: proposal.createdAt,
      expiresAt: proposal.expiresAt,
      lastEventSequence: 1,
    });

    try {
      await this.adapter.createOperation(operation, proposedEvent);
    } catch (error) {
      throw persistenceError(error);
    }
    return this.getRequiredOperation(operation.operationId);
  }

  createCodingPackExportApproval(
    input: CreateCodingPackExportApprovalInput,
  ): CodingPackExportApproval {
    const approvedAt = canonicalTimestamp(input.approvedAt ?? this.now().toISOString());
    const expiresAt = canonicalTimestamp(
      input.expiresAt
        ?? new Date(Date.parse(approvedAt) + this.approvalLifetimeMs).toISOString(),
    );
    return validateCodingPackExportApproval({
      schemaVersion: CODING_PACK_EXPORT_APPROVAL_SCHEMA_VERSION,
      operationId: input.operationId,
      proposalDigest: input.proposalDigest,
      approvedAt,
      expiresAt,
    }, undefined, new Date(Date.parse(approvedAt) - 1));
  }

  async confirmCodingPackExportProposal(
    approvalValue: CodingPackExportApproval,
  ): Promise<CodingPackOperationSnapshot> {
    const structuralApproval = validateCodingPackExportApproval(
      approvalValue,
      undefined,
      new Date(Date.parse(approvalValue.approvedAt) - 1),
    );
    const snapshot = await this.getCodingPackOperation(structuralApproval.operationId);
    if (!snapshot) {
      throw new CodingPackStoreError("coding_pack_approval_mismatch");
    }
    if (snapshot.operation.state !== "proposed" || snapshot.approval) {
      throw new CodingPackStoreError("coding_pack_approval_mismatch");
    }
    const now = this.now();
    if (Date.parse(snapshot.proposal.expiresAt) <= now.getTime()) {
      throw new CodingPackStoreError("coding_pack_proposal_expired");
    }
    const approval = validateCodingPackExportApproval(
      structuralApproval,
      snapshot.proposal,
      now,
    );
    const payload = Object.freeze({ approval });
    const confirmedEvent = await validateEvent({
      eventId: boundedId(this.createId()),
      operationId: snapshot.operation.operationId,
      eventSequence: 2,
      eventType: "PACK_CONFIRMED",
      eventVersion: CODING_PACK_EVENT_VERSION,
      recordedAt: approval.approvedAt,
      payloadDigest: await createEventPayloadDigest(payload),
      payload,
    });
    const operation = validateOperationRecord({
      ...snapshot.operation,
      state: "confirmed",
      lastEventSequence: 2,
    });
    try {
      await this.adapter.appendConfirmation(operation, confirmedEvent);
    } catch (error) {
      throw persistenceError(error);
    }
    return this.getRequiredOperation(operation.operationId);
  }

  async getCodingPackOperation(
    operationId: string,
  ): Promise<CodingPackOperationSnapshot | null> {
    boundedId(operationId);
    let operationValue: CodingPackOperationRecord | null;
    let eventsValue: CodingPackEvent[];
    try {
      operationValue = await this.adapter.getOperation(operationId);
      if (!operationValue) return null;
      eventsValue = await this.adapter.listEvents(operationId);
    } catch {
      throw new CodingPackStoreError("coding_pack_store_unavailable");
    }
    const operation = validateOperationRecord(operationValue);
    const events = await Promise.all(eventsValue.map(validateEvent));
    const destination = await this.getDestination(operation.destinationBindingId);
    return reconstructSnapshot(operation, events, destination);
  }

  async listCodingPackEvents(operationId: string): Promise<readonly CodingPackEvent[]> {
    const snapshot = await this.getCodingPackOperation(operationId);
    return snapshot?.events ?? [];
  }

  async listCodingPackOperations(): Promise<readonly CodingPackOperationSnapshot[]> {
    let operations: CodingPackOperationRecord[];
    try {
      operations = await this.adapter.listOperations();
    } catch {
      throw new CodingPackStoreError("coding_pack_store_unavailable");
    }
    const snapshots = await Promise.all(operations.map((operation) => (
      this.getRequiredOperation(operation.operationId)
    )));
    return Object.freeze(snapshots.sort((left, right) => (
      right.operation.createdAt.localeCompare(left.operation.createdAt)
      || left.operation.operationId.localeCompare(right.operation.operationId)
    )));
  }

  private async getRequiredOperation(operationId: string): Promise<CodingPackOperationSnapshot> {
    const snapshot = await this.getCodingPackOperation(operationId);
    if (!snapshot) throw new CodingPackStoreError("coding_pack_store_unavailable");
    return snapshot;
  }

  private async getDestination(
    destinationBindingId: string,
  ): Promise<CodingPackDestinationBinding> {
    let value: CodingPackDestinationBinding | null;
    try {
      value = await this.adapter.getDestinationBinding(destinationBindingId);
    } catch {
      throw new CodingPackStoreError("coding_pack_store_unavailable");
    }
    if (!value) throw new CodingPackStoreError("coding_pack_destination_unavailable");
    return validateDestinationBinding(value);
  }
}

export async function createCodingPackDestinationBinding(input: {
  readonly privateIdentityMaterial: string;
  readonly displayLabel: string;
  readonly createdAt?: string;
  readonly restartAvailable: boolean;
}): Promise<CodingPackDestinationBinding> {
  if (
    typeof input.privateIdentityMaterial !== "string"
    || !input.privateIdentityMaterial
    || input.privateIdentityMaterial.length > 16 * 1024
  ) {
    throw new CodingPackStoreError("coding_pack_destination_unavailable");
  }
  const destinationFingerprint = await sha256Text(input.privateIdentityMaterial);
  return validateDestinationBinding({
    destinationBindingId: `destination-${destinationFingerprint.slice(7, 31)}`,
    destinationFingerprint,
    displayLabel: input.displayLabel,
    createdAt: canonicalTimestamp(input.createdAt ?? new Date().toISOString()),
    restartAvailable: input.restartAvailable,
  });
}

function reconstructSnapshot(
  operation: CodingPackOperationRecord,
  events: readonly CodingPackEvent[],
  destination: CodingPackDestinationBinding,
): CodingPackOperationSnapshot {
  if (
    events.length < 1
    || events.length > 2
    || operation.lastEventSequence !== events.length
  ) {
    invalid();
  }
  const eventIds = new Set<string>();
  events.forEach((event, index) => {
    if (
      event.operationId !== operation.operationId
      || event.eventSequence !== index + 1
      || eventIds.has(event.eventId)
    ) {
      invalid();
    }
    eventIds.add(event.eventId);
  });
  const firstEvent = events[0];
  if (
    !firstEvent
    || firstEvent.eventType !== "PACK_PROPOSED"
    || !("proposal" in firstEvent.payload)
  ) {
    invalid();
  }
  const proposal = firstEvent.payload.proposal;
  const secondEvent = events[1];
  if (
    secondEvent
    && (
      secondEvent.eventType !== "PACK_CONFIRMED"
      || !("approval" in secondEvent.payload)
    )
  ) {
    invalid();
  }
  const approval = secondEvent && "approval" in secondEvent.payload
    ? secondEvent.payload.approval
    : null;
  const expectedState = approval ? "confirmed" : "proposed";
  if (
    operation.state !== expectedState
    || operation.projectBindingId !== proposal.projectBindingId
    || operation.projectGeneration !== proposal.projectGeneration
    || operation.candidatePathsDigest !== proposal.candidatePathsDigest
    || operation.sourceFingerprint !== proposal.sourceFingerprint
    || operation.packId !== proposal.packId
    || operation.manifestDigest !== proposal.manifestDigest
    || operation.destinationBindingId !== proposal.destinationBindingId
    || operation.proposalDigest !== proposal.proposalDigest
    || operation.createdAt !== proposal.createdAt
    || operation.expiresAt !== proposal.expiresAt
    || destination.destinationBindingId !== proposal.destinationBindingId
    || destination.destinationFingerprint !== proposal.destinationFingerprint
  ) {
    invalid();
  }
  if (approval) {
    validateCodingPackExportApproval(
      approval,
      proposal,
      new Date(Date.parse(approval.approvedAt) - 1),
    );
  }
  return Object.freeze({
    operation,
    proposal,
    approval,
    destination,
    events: Object.freeze([...events]),
  });
}

function positiveLifetime(value: number | undefined): number {
  const selected = value ?? DEFAULT_LIFETIME_MS;
  if (!Number.isSafeInteger(selected) || selected < 1 || selected > 24 * 60 * 60 * 1000) {
    throw new CodingPackStoreError("coding_pack_proposal_invalid");
  }
  return selected;
}

function boundedId(value: string): string {
  if (
    typeof value !== "string"
    || !value
    || value.length > 256
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    invalid();
  }
  return value;
}

function canonicalTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) invalid();
  const canonical = new Date(parsed).toISOString();
  if (canonical !== value) invalid();
  return canonical;
}

function persistenceError(error: unknown): CodingPackStoreError {
  if (
    error instanceof CodingPackStoreError
    && error.code === "coding_pack_destination_unavailable"
  ) {
    return error;
  }
  return new CodingPackStoreError("coding_pack_persistence_failed");
}

function invalid(): never {
  throw new CodingPackStoreError("coding_pack_proposal_invalid");
}
