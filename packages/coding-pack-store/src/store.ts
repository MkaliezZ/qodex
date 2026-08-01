import {
  compareUtf8,
  requireWellFormedUnicode,
  sha256Text,
  utf8ByteLength,
} from "./canonical.js";
import { CodingPackStoreError } from "./errors.js";
import type {
  CodingPackDestinationBinding,
  CodingPackDecidedEventPayload,
  CodingPackEvent,
  CodingPackExportApproval,
  CodingPackOperationRecord,
  CodingPackOperationSnapshot,
  CodingPackStoredSnapshotData,
  CodingPackStoreAdapter,
  CodingPackStoreOptions,
  CreateCodingPackExportApprovalInput,
  CreateCodingPackExportProposalInput,
  RecordCodingPackExportDecisionInput,
} from "./types.js";
import {
  CODING_PACK_EVENT_VERSION,
  CODING_PACK_EXPORT_APPROVAL_SCHEMA_VERSION,
  CODING_PACK_EXPORT_FORMAT,
  CODING_PACK_EXPORT_PROPOSAL_SCHEMA_VERSION,
} from "./types.js";
import {
  createCodingPackAgentFuseExportRequestIdentity,
  createCodingPackAgentFuseRequestDigest,
  createEventPayloadDigest,
  createProposalDigest,
  CODING_PACK_MAX_APPROVAL_LIFETIME_MS,
  CODING_PACK_MAX_PROPOSAL_LIFETIME_MS,
  validateCodingPackExportApproval,
  validateCodingPackExportProposal,
  validateDestinationBinding,
  validateDecidedPayload,
  validateEvent,
  validateOperationRecord,
  validatePreviewBinding,
} from "./validation.js";

const DEFAULT_LIFETIME_MS = 10 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const CONTROL_PATTERN = /\p{Cc}/u;

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
    rejectFutureTimestamp(createdAt, this.now());
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
    rejectFutureTimestamp(approvedAt, this.now(), true);
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

  async recordCodingPackExportDecision(
    input: RecordCodingPackExportDecisionInput,
  ): Promise<CodingPackOperationSnapshot> {
    const operationId = boundedId(input.operationId);
    const decision = validateDecidedPayload(input.decision);
    const snapshot = await this.getCodingPackOperation(operationId);
    if (
      !snapshot
      || snapshot.operation.state !== "confirmed"
      || !snapshot.approval
      || snapshot.decision
      || snapshot.events.length !== 2
      || snapshot.events[1]?.eventType !== "PACK_CONFIRMED"
    ) {
      throw new CodingPackStoreError("coding_pack_approval_mismatch");
    }
    const now = this.now();
    const evaluationStartedAt = Date.parse(decision.evaluationStartedAt);
    const decidedAt = Date.parse(decision.decidedAt);
    const approvalExpiresAt = Date.parse(snapshot.approval.expiresAt);
    const proposalExpiresAt = Date.parse(snapshot.proposal.expiresAt);
    if (
      decision.proposalDigest !== snapshot.proposal.proposalDigest
      || decision.approvalEvidenceDigest !== snapshot.events[1].payloadDigest
      || evaluationStartedAt < Date.parse(snapshot.approval.approvedAt)
      || evaluationStartedAt >= approvalExpiresAt
      || evaluationStartedAt >= proposalExpiresAt
      || decidedAt < evaluationStartedAt
      || (decision.decision !== "error" && (
        decidedAt >= approvalExpiresAt
        || decidedAt >= proposalExpiresAt
      ))
    ) {
      throw new CodingPackStoreError("coding_pack_approval_mismatch");
    }
    const expectedRequestDigest = await createCodingPackAgentFuseRequestDigest(
      createCodingPackAgentFuseExportRequestIdentity(
        snapshot.proposal,
        snapshot.events[1].payloadDigest,
      ),
    );
    if (decision.requestDigest !== expectedRequestDigest) {
      throw new CodingPackStoreError("coding_pack_approval_mismatch");
    }
    rejectFutureTimestamp(decision.evaluationStartedAt, now, true);
    rejectFutureTimestamp(decision.decidedAt, now, true);
    const decidedEvent = await validateEvent({
      eventId: boundedId(this.createId()),
      operationId,
      eventSequence: 3,
      eventType: "PACK_DECIDED",
      eventVersion: CODING_PACK_EVENT_VERSION,
      recordedAt: decision.decidedAt,
      payloadDigest: await createEventPayloadDigest(decision),
      payload: decision,
    });
    const operation = validateOperationRecord({
      ...snapshot.operation,
      state: decisionState(decision.decision),
      lastEventSequence: 3,
    });
    try {
      await this.adapter.appendDecision(operation, decidedEvent);
    } catch (error) {
      throw persistenceError(error);
    }
    return this.getRequiredOperation(operationId);
  }

  async getCodingPackOperation(
    operationId: string,
  ): Promise<CodingPackOperationSnapshot | null> {
    boundedId(operationId);
    let snapshotValue: CodingPackStoredSnapshotData | null;
    try {
      snapshotValue = await this.adapter.getOperationSnapshotData(operationId);
    } catch {
      throw new CodingPackStoreError("coding_pack_store_unavailable");
    }
    if (!snapshotValue) return null;
    const operation = validateOperationRecord(snapshotValue.operation);
    const events = await Promise.all(snapshotValue.events.map(validateEvent));
    const destination = validateDestinationBinding(snapshotValue.destination);
    return reconstructSnapshot(operation, events, destination);
  }

  async listCodingPackEvents(operationId: string): Promise<readonly CodingPackEvent[]> {
    const snapshot = await this.getCodingPackOperation(operationId);
    return snapshot?.events ?? [];
  }

  async listCodingPackOperations(): Promise<readonly CodingPackOperationSnapshot[]> {
    let operationIds: readonly string[];
    try {
      operationIds = await this.adapter.listOperationIds();
    } catch {
      throw new CodingPackStoreError("coding_pack_store_unavailable");
    }
    const snapshots = await Promise.all(operationIds.map((operationId) => (
      this.getRequiredOperation(boundedId(operationId))
    )));
    return Object.freeze(snapshots.sort((left, right) => (
      compareUtf8(right.operation.createdAt, left.operation.createdAt)
      || compareUtf8(left.operation.operationId, right.operation.operationId)
    )));
  }

  private async getRequiredOperation(operationId: string): Promise<CodingPackOperationSnapshot> {
    const snapshot = await this.getCodingPackOperation(operationId);
    if (!snapshot) throw new CodingPackStoreError("coding_pack_store_unavailable");
    return snapshot;
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
    || !wellFormedWithinBytes(input.privateIdentityMaterial, 16 * 1024)
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

async function reconstructSnapshot(
  operation: CodingPackOperationRecord,
  events: readonly CodingPackEvent[],
  destination: CodingPackDestinationBinding,
): Promise<CodingPackOperationSnapshot> {
  if (
    events.length < 1
    || events.length > 5
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
  const thirdEvent = events[2];
  if (
    thirdEvent
    && (
      thirdEvent.eventType !== "PACK_DECIDED"
      || !("decision" in thirdEvent.payload)
    )
  ) {
    invalid();
  }
  const decision = thirdEvent && "decision" in thirdEvent.payload
    ? thirdEvent.payload
    : null;
  const fourthEvent = events[3];
  if (
    fourthEvent
    && (
      fourthEvent.eventType !== "PACK_EXPORT_STARTED"
      || !("startedAt" in fourthEvent.payload)
    )
  ) {
    invalid();
  }
  const exportStarted = fourthEvent && "startedAt" in fourthEvent.payload
    ? fourthEvent.payload
    : null;
  const fifthEvent = events[4];
  if (
    fifthEvent
    && fifthEvent.eventType !== "PACK_EXPORT_COMPLETED"
    && fifthEvent.eventType !== "PACK_EXPORT_INTERRUPTED"
  ) {
    invalid();
  }
  const exportCompleted = fifthEvent
    && fifthEvent.eventType === "PACK_EXPORT_COMPLETED"
    && "completedAt" in fifthEvent.payload
    ? fifthEvent.payload
    : null;
  const exportInterrupted = fifthEvent
    && fifthEvent.eventType === "PACK_EXPORT_INTERRUPTED"
    && "interruptedAt" in fifthEvent.payload
    ? fifthEvent.payload
    : null;
  if (fifthEvent && !exportCompleted && !exportInterrupted) invalid();
  const expectedState = exportCompleted
    ? "export_completed"
    : exportInterrupted
      ? "export_interrupted"
      : exportStarted
        ? "export_started"
        : decision
          ? decisionState(decision.decision)
          : approval
            ? "confirmed"
            : "proposed";
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
    if (
      firstEvent.recordedAt !== proposal.createdAt
      || secondEvent?.recordedAt !== approval.approvedAt
      || Date.parse(approval.approvedAt) < Date.parse(proposal.createdAt)
    ) {
      invalid();
    }
    validateCodingPackExportApproval(
      approval,
      proposal,
      null,
    );
  } else if (firstEvent.recordedAt !== proposal.createdAt) {
    invalid();
  }
  if (decision) {
    const expectedRequestDigest = await createCodingPackAgentFuseRequestDigest(
      createCodingPackAgentFuseExportRequestIdentity(
        proposal,
        secondEvent?.payloadDigest ?? "",
      ),
    );
    if (
      !approval
      || decision.proposalDigest !== proposal.proposalDigest
      || decision.approvalEvidenceDigest !== secondEvent?.payloadDigest
      || decision.requestDigest !== expectedRequestDigest
      || thirdEvent?.recordedAt !== decision.decidedAt
      || Date.parse(decision.evaluationStartedAt) < Date.parse(approval.approvedAt)
      || Date.parse(decision.evaluationStartedAt) >= Date.parse(approval.expiresAt)
      || Date.parse(decision.evaluationStartedAt) >= Date.parse(proposal.expiresAt)
      || Date.parse(decision.decidedAt) < Date.parse(decision.evaluationStartedAt)
      || (decision.decision !== "error" && (
        Date.parse(decision.decidedAt) >= Date.parse(approval.expiresAt)
        || Date.parse(decision.decidedAt) >= Date.parse(proposal.expiresAt)
      ))
    ) {
      invalid();
    }
    validateDecidedPayload(decision);
  }
  if (exportStarted) {
    if (
      !approval
      || !decision
      || decision.decision !== "allow"
      || fourthEvent?.recordedAt !== exportStarted.startedAt
      || exportStarted.decisionId !== decision.decisionId
      || exportStarted.requestDigest !== decision.requestDigest
      || exportStarted.proposalDigest !== proposal.proposalDigest
      || exportStarted.manifestDigest !== proposal.manifestDigest
      || exportStarted.destinationBindingId !== proposal.destinationBindingId
      || exportStarted.destinationFingerprint !== proposal.destinationFingerprint
      || Date.parse(exportStarted.startedAt) < Date.parse(decision.decidedAt)
      || Date.parse(exportStarted.startedAt) >= Date.parse(proposal.expiresAt)
      || Date.parse(exportStarted.startedAt) >= Date.parse(approval.expiresAt)
    ) {
      invalid();
    }
  }
  if (exportCompleted) {
    if (
      !exportStarted
      || fifthEvent?.recordedAt !== exportCompleted.completedAt
      || exportCompleted.exportAttemptId !== exportStarted.exportAttemptId
      || exportCompleted.exportPlanDigest !== exportStarted.exportPlanDigest
      || exportCompleted.manifestDigest !== exportStarted.manifestDigest
      || exportCompleted.targetName !== exportStarted.targetName
      || exportCompleted.sourceFileCount !== exportStarted.sourceFileCount
      || exportCompleted.sourceTotalBytes !== exportStarted.sourceTotalBytes
      || Date.parse(exportCompleted.completedAt) < Date.parse(exportStarted.startedAt)
    ) {
      invalid();
    }
  }
  if (exportInterrupted) {
    if (
      !exportStarted
      || fifthEvent?.recordedAt !== exportInterrupted.interruptedAt
      || exportInterrupted.exportAttemptId !== exportStarted.exportAttemptId
      || exportInterrupted.exportPlanDigest !== exportStarted.exportPlanDigest
      || Date.parse(exportInterrupted.interruptedAt) < Date.parse(exportStarted.startedAt)
    ) {
      invalid();
    }
  }
  return Object.freeze({
    operation,
    proposal,
    approval,
    decision,
    exportStarted,
    exportCompleted,
    exportInterrupted,
    destination,
    events: Object.freeze([...events]),
  });
}

function decisionState(
  decision: CodingPackDecidedEventPayload["decision"],
): CodingPackOperationRecord["state"] {
  if (decision === "allow") return "decided_allow";
  if (decision === "deny") return "decided_deny";
  return "decided_error";
}

function positiveLifetime(value: number | undefined): number {
  const selected = value ?? DEFAULT_LIFETIME_MS;
  if (
    !Number.isSafeInteger(selected)
    || selected < 1
    || selected > Math.min(
      CODING_PACK_MAX_PROPOSAL_LIFETIME_MS,
      CODING_PACK_MAX_APPROVAL_LIFETIME_MS,
    )
  ) {
    throw new CodingPackStoreError("coding_pack_proposal_invalid");
  }
  return selected;
}

function boundedId(value: string): string {
  if (
    typeof value !== "string"
    || !value
    || !wellFormedWithinBytes(value, 256)
    || CONTROL_PATTERN.test(value)
  ) {
    invalid();
  }
  return value;
}

function canonicalTimestamp(value: string): string {
  try {
    requireWellFormedUnicode(value, "timestamp");
  } catch {
    invalid();
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) invalid();
  const canonical = new Date(parsed).toISOString();
  if (canonical !== value) invalid();
  return canonical;
}

function rejectFutureTimestamp(
  value: string,
  now: Date,
  approval = false,
): void {
  if (Date.parse(value) > now.getTime() + MAX_CLOCK_SKEW_MS) {
    if (approval) {
      throw new CodingPackStoreError("coding_pack_approval_mismatch");
    }
    invalid();
  }
}

function wellFormedWithinBytes(value: string, maxBytes: number): boolean {
  try {
    requireWellFormedUnicode(value, "identity");
    return utf8ByteLength(value, "identity") <= maxBytes;
  } catch {
    return false;
  }
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
