export const CODING_PACK_STORE_SCHEMA_VERSION = "kerniq.coding-pack.store.v1" as const;
export const CODING_PACK_EXPORT_PROPOSAL_SCHEMA_VERSION =
  "kerniq.coding-pack.export-proposal.v1" as const;
export const CODING_PACK_EXPORT_APPROVAL_SCHEMA_VERSION =
  "kerniq.coding-pack.export-approval.v1" as const;
export const CODING_PACK_EXPORT_FORMAT = "kerniq-coding-pack-bundle-v1" as const;
export const CODING_PACK_EVENT_VERSION = 1 as const;

export type CodingPackOperationState = "proposed" | "confirmed";
export type CodingPackEventType = "PACK_PROPOSED" | "PACK_CONFIRMED";

export interface CodingPackDestinationBinding {
  readonly destinationBindingId: string;
  readonly destinationFingerprint: string;
  readonly displayLabel: string;
  readonly createdAt: string;
  readonly restartAvailable: boolean;
}

export interface CodingPackExportProposal {
  readonly schemaVersion: typeof CODING_PACK_EXPORT_PROPOSAL_SCHEMA_VERSION;
  readonly operationId: string;
  readonly projectBindingId: string;
  readonly projectGeneration: number;
  readonly candidatePathsDigest: string;
  readonly sourceFingerprint: string;
  readonly packId: string;
  readonly manifestDigest: string;
  readonly destinationBindingId: string;
  readonly destinationFingerprint: string;
  readonly exportFormat: typeof CODING_PACK_EXPORT_FORMAT;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly proposalDigest: string;
}

export interface CodingPackExportApproval {
  readonly schemaVersion: typeof CODING_PACK_EXPORT_APPROVAL_SCHEMA_VERSION;
  readonly operationId: string;
  readonly proposalDigest: string;
  readonly approvedAt: string;
  readonly expiresAt: string;
}

export interface CodingPackPreviewIdentity {
  readonly projectBindingId: string;
  readonly projectGeneration: number;
  readonly candidatePathsDigest: string;
  readonly sourceFingerprint: string;
  readonly packId: string;
  readonly manifestDigest: string;
}

export interface CodingPackPreviewConfirmationEvidence {
  readonly projectBindingId: string;
  readonly projectGeneration: number;
  readonly selectedPathsDigest: string;
  readonly sourceFingerprint: string;
  readonly packId: string;
  readonly manifestDigest: string;
  readonly confirmedAt: string;
}

export interface CodingPackOperationRecord {
  readonly operationId: string;
  readonly state: CodingPackOperationState;
  readonly projectBindingId: string;
  readonly projectGeneration: number;
  readonly candidatePathsDigest: string;
  readonly sourceFingerprint: string;
  readonly packId: string;
  readonly manifestDigest: string;
  readonly destinationBindingId: string;
  readonly proposalDigest: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly lastEventSequence: number;
}

export interface CodingPackProposedEventPayload {
  readonly proposal: CodingPackExportProposal;
}

export interface CodingPackConfirmedEventPayload {
  readonly approval: CodingPackExportApproval;
}

export type CodingPackEventPayload =
  | CodingPackProposedEventPayload
  | CodingPackConfirmedEventPayload;

export interface CodingPackEvent {
  readonly eventId: string;
  readonly operationId: string;
  readonly eventSequence: number;
  readonly eventType: CodingPackEventType;
  readonly eventVersion: typeof CODING_PACK_EVENT_VERSION;
  readonly recordedAt: string;
  readonly payloadDigest: string;
  readonly payload: CodingPackEventPayload;
}

export interface CodingPackOperationSnapshot {
  readonly operation: CodingPackOperationRecord;
  readonly proposal: CodingPackExportProposal;
  readonly approval: CodingPackExportApproval | null;
  readonly destination: CodingPackDestinationBinding;
  readonly events: readonly CodingPackEvent[];
}

export interface CreateCodingPackExportProposalInput {
  readonly preview: CodingPackPreviewIdentity;
  readonly previewConfirmation: CodingPackPreviewConfirmationEvidence;
  readonly destination: CodingPackDestinationBinding;
  readonly operationId?: string;
  readonly createdAt?: string;
  readonly expiresAt?: string;
}

export interface CreateCodingPackExportApprovalInput {
  readonly operationId: string;
  readonly proposalDigest: string;
  readonly approvedAt?: string;
  readonly expiresAt?: string;
}

export interface CodingPackStoreAdapter {
  registerDestinationBinding(binding: CodingPackDestinationBinding): Promise<void>;
  createOperation(
    operation: CodingPackOperationRecord,
    proposedEvent: CodingPackEvent,
  ): Promise<void>;
  appendConfirmation(
    operation: CodingPackOperationRecord,
    confirmedEvent: CodingPackEvent,
  ): Promise<void>;
  getOperation(operationId: string): Promise<CodingPackOperationRecord | null>;
  listOperations(): Promise<CodingPackOperationRecord[]>;
  listEvents(operationId: string): Promise<CodingPackEvent[]>;
  getDestinationBinding(
    destinationBindingId: string,
  ): Promise<CodingPackDestinationBinding | null>;
}

export interface CodingPackStoreOptions {
  readonly now?: () => Date;
  readonly createId?: () => string;
  readonly proposalLifetimeMs?: number;
  readonly approvalLifetimeMs?: number;
}
