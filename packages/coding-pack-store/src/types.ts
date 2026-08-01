export const CODING_PACK_STORE_SCHEMA_VERSION = "kerniq.coding-pack.store.v3" as const;
export const CODING_PACK_EXPORT_PLAN_SCHEMA_VERSION =
  "kerniq.coding-pack.export-plan.v1" as const;
export const CODING_PACK_EXPORT_PROPOSAL_SCHEMA_VERSION =
  "kerniq.coding-pack.export-proposal.v1" as const;
export const CODING_PACK_EXPORT_APPROVAL_SCHEMA_VERSION =
  "kerniq.coding-pack.export-approval.v1" as const;
export const CODING_PACK_EXPORT_FORMAT = "kerniq-coding-pack-bundle-v1" as const;
export const CODING_PACK_AGENTFUSE_EXPORT_PROTOCOL =
  "kerniq.coding-pack.agentfuse-export.v1" as const;
export const CODING_PACK_AGENTFUSE_EXPORT_TOOL =
  "kerniq.coding_pack.export" as const;
export const CODING_PACK_EVENT_VERSION = 1 as const;

export type CodingPackOperationState =
  | "proposed"
  | "confirmed"
  | "decided_allow"
  | "decided_deny"
  | "decided_error"
  | "export_started"
  | "export_completed"
  | "export_interrupted";
export type CodingPackEventType =
  | "PACK_PROPOSED"
  | "PACK_CONFIRMED"
  | "PACK_DECIDED"
  | "PACK_EXPORT_STARTED"
  | "PACK_EXPORT_COMPLETED"
  | "PACK_EXPORT_INTERRUPTED";

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

export interface CodingPackDecidedEventPayload {
  readonly decisionId: string;
  readonly requestDigest: string;
  readonly proposalDigest: string;
  readonly approvalEvidenceDigest: string;
  readonly agentFuseSourceCommit:
    "ec4b5842339dccfba0db62df7541920759203bc9";
  readonly agentFusePackageVersion: "3.6.0";
  readonly bridgeProtocol: "kerniq.agentfuse.bridge.v1";
  readonly policyId: "kerniq-coding-pack-export-v1";
  readonly policyDigest: string;
  readonly decision: "allow" | "deny" | "error";
  readonly reasonCode: string;
  readonly evaluationStartedAt: string;
  readonly decidedAt: string;
}

export interface CodingPackNativeExportPlan {
  readonly schemaVersion: typeof CODING_PACK_EXPORT_PLAN_SCHEMA_VERSION;
  readonly operationId: string;
  readonly exportAttemptId: string;
  readonly decisionId: string;
  readonly requestDigest: string;
  readonly proposalDigest: string;
  readonly candidatePathsDigest: string;
  readonly sourceFingerprint: string;
  readonly packId: string;
  readonly manifestDigest: string;
  readonly destinationBindingId: string;
  readonly destinationFingerprint: string;
  readonly targetName: string;
  readonly manifestByteCount: number;
  readonly sourceFileCount: number;
  readonly sourceTotalBytes: number;
  readonly exportStartedAt: string;
  readonly exportPlanDigest: string;
}

export interface CodingPackExportStartedEventPayload {
  readonly exportAttemptId: string;
  readonly exportPlanDigest: string;
  readonly decisionId: string;
  readonly requestDigest: string;
  readonly proposalDigest: string;
  readonly manifestDigest: string;
  readonly destinationBindingId: string;
  readonly destinationFingerprint: string;
  readonly targetName: string;
  readonly sourceFileCount: number;
  readonly sourceTotalBytes: number;
  readonly startedAt: string;
}

export interface CodingPackExportCompletedEventPayload {
  readonly exportAttemptId: string;
  readonly exportPlanDigest: string;
  readonly manifestDigest: string;
  readonly targetName: string;
  readonly sourceFileCount: number;
  readonly sourceTotalBytes: number;
  readonly completedAt: string;
}

export type CodingPackExportInterruptedPhaseCode =
  | "staging_create"
  | "manifest_write"
  | "source_write"
  | "flush"
  | "promotion"
  | "cleanup";

export interface CodingPackExportInterruptedEventPayload {
  readonly exportAttemptId: string;
  readonly exportPlanDigest: string;
  readonly phaseCode: CodingPackExportInterruptedPhaseCode;
  readonly physicalState: "not_promoted";
  readonly reasonCode: string;
  readonly interruptedAt: string;
}

export interface CodingPackAgentFuseExportRequestIdentity {
  readonly protocolVersion: typeof CODING_PACK_AGENTFUSE_EXPORT_PROTOCOL;
  readonly operationId: string;
  readonly proposalDigest: string;
  readonly approvalEvidenceDigest: string;
  readonly candidatePathsDigest: string;
  readonly sourceFingerprint: string;
  readonly packId: string;
  readonly manifestDigest: string;
  readonly destinationBindingId: string;
  readonly destinationFingerprint: string;
  readonly exportFormat: typeof CODING_PACK_EXPORT_FORMAT;
}

export type CodingPackEventPayload =
  | CodingPackProposedEventPayload
  | CodingPackConfirmedEventPayload
  | CodingPackDecidedEventPayload
  | CodingPackExportStartedEventPayload
  | CodingPackExportCompletedEventPayload
  | CodingPackExportInterruptedEventPayload;

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
  readonly decision: CodingPackDecidedEventPayload | null;
  readonly exportStarted: CodingPackExportStartedEventPayload | null;
  readonly exportCompleted: CodingPackExportCompletedEventPayload | null;
  readonly exportInterrupted: CodingPackExportInterruptedEventPayload | null;
  readonly destination: CodingPackDestinationBinding;
  readonly events: readonly CodingPackEvent[];
}

export interface CodingPackStoredSnapshotData {
  readonly operation: CodingPackOperationRecord;
  readonly events: readonly CodingPackEvent[];
  readonly destination: CodingPackDestinationBinding;
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

export interface RecordCodingPackExportDecisionInput {
  readonly operationId: string;
  readonly decision: CodingPackDecidedEventPayload;
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
  appendDecision(
    operation: CodingPackOperationRecord,
    decidedEvent: CodingPackEvent,
  ): Promise<void>;
  getOperationSnapshotData(
    operationId: string,
  ): Promise<CodingPackStoredSnapshotData | null>;
  listOperationIds(): Promise<readonly string[]>;
}

export interface CodingPackStoreOptions {
  readonly now?: () => Date;
  readonly createId?: () => string;
  readonly proposalLifetimeMs?: number;
  readonly approvalLifetimeMs?: number;
}
