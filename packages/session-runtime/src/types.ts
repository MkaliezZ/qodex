export const SESSION_SCHEMA_VERSION = 1;

export type JsonPrimitive = string | number | boolean | null;
export type SafeJson = JsonPrimitive | SafeJson[] | { [key: string]: SafeJson };

export type SessionStatus =
  | "Active"
  | "RecoveryRequired"
  | "Interrupted"
  | "Completed"
  | "Failed"
  | "Cancelled"
  | "LimitReached";

export const UNIVERSAL_EVENT_TYPES = [
  "SESSION_CREATED",
  "USER_MESSAGE",
  "MODEL_MESSAGE",
  "TOOL_REQUESTED",
  "TOOL_COMPLETED",
  "ACTION_PROPOSED",
  "ACTION_APPROVED",
  "ACTION_DECIDED",
  "ACTION_DENIED",
  "ACTION_STARTED",
  "ACTION_COMPLETED",
  "ACTION_FAILED",
  "ARTIFACT_CREATED",
  "DELIVERY_COMPLETED",
  "SESSION_INTERRUPTED",
  "SESSION_FAILED",
  "SESSION_COMPLETED",
  "SESSION_CANCELLED",
  "SESSION_LIMIT_REACHED",
  "RECOVERY_REQUIRED",
  "RECOVERY_COMPLETED",
] as const;

export type UniversalEventType = typeof UNIVERSAL_EVENT_TYPES[number];

export type CodingEventType =
  | "PATCH_PROPOSED"
  | "PATCH_APPROVED"
  | "PATCH_STARTED"
  | "PATCH_APPLIED"
  | "PATCH_REJECTED"
  | "COMMAND_PROPOSED"
  | "COMMAND_APPROVED"
  | "COMMAND_DENIED"
  | "COMMAND_STARTED"
  | "COMMAND_COMPLETED"
  | "AGENT_STATE_CHANGED";

export type SessionEventType = UniversalEventType | CodingEventType;

export interface SafeMetadata {
  recordKey?: string;
  taskId?: string;
  toolCallId?: string;
  runtimeStatus?: string;
  runtimeType?: string;
  scriptId?: string;
  scriptVersion?: string;
  environmentId?: string;
  pythonVersion?: string;
  dependencyLockDigest?: string;
  actionId?: string;
  approvalId?: string;
  approvalGeneration?: number;
  decisionId?: string;
  decision?: "allow" | "deny" | "hold" | "error";
  policyVersion?: string;
  decisionSchemaVersion?: string;
  agentFuseCommit?: string;
  executionReceiptId?: string;
  artifactIds?: string[];
  executionStatus?: string;
  recoverable?: boolean;
  sensitiveContentRedacted?: boolean;
  [key: string]: SafeJson | undefined;
}

export interface SessionRecord {
  id: string;
  schemaVersion: number;
  title: string;
  status: SessionStatus;
  activeLeafId: string;
  projectBindingId: string | null;
  providerId: string | null;
  modelId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface SessionEntry {
  id: string;
  sessionId: string;
  parentEntryId: string | null;
  sequence: number;
  type: SessionEventType;
  payloadVersion: number;
  payload: SafeJson;
  safeMetadata: SafeMetadata;
  createdAt: string;
}

export interface NewSessionInput {
  id?: string;
  title: string;
  projectBindingId?: string | null;
  providerId?: string | null;
  modelId?: string | null;
  createdAt?: string;
}

export interface AppendEntryInput {
  id?: string;
  parentEntryId?: string | null;
  type: SessionEventType;
  payloadVersion?: number;
  payload?: SafeJson;
  safeMetadata?: SafeMetadata;
  createdAt?: string;
}

export interface SessionMutation {
  activeLeafId: string;
  status: SessionStatus;
  updatedAt: string;
  completedAt: string | null;
}

export interface ProjectBindingInput {
  bindingId: string;
  displayName: string;
  privateRootPath: string;
  projectFingerprint: string;
  lastOpenedAt: string;
}

export interface ProjectBinding {
  bindingId: string;
  displayName: string;
  projectFingerprint: string;
  lastOpenedAt: string;
}

export interface ProjectBindingCandidate {
  privateRootPath: string;
  projectFingerprint: string;
}

export interface PersistenceInfo {
  kind: "sqlite" | "memory" | "test";
  persistent: boolean;
  location: string | null;
  schemaVersion: number;
  message: string;
}

export interface PendingActionProjection {
  kind: "patch" | "command" | "action";
  actionId: string;
  proposalEntryId: string;
  payload: SafeJson;
  approved: boolean;
  started: boolean;
  settled: boolean;
  approvalId: string | null;
  approvalGeneration: number;
  decisionRecorded: boolean;
  decisionId: string | null;
  decision: "allow" | "deny" | "hold" | "error" | null;
  policyVersion: string | null;
  decisionSchemaVersion: string | null;
  agentFuseCommit: string | null;
  executionReceiptId: string | null;
  recoveryRequired: boolean;
  stale: boolean;
}

export interface RecoveryRequirement {
  reason: "patch_reapproval" | "command_reapproval" | "interrupted";
  executionStatus: "unknown_or_interrupted" | null;
}

export interface ProjectedSessionState {
  status: SessionStatus;
  lastEntry: SessionEntry;
  pendingAction: PendingActionProjection | null;
  recoveryRequirement: RecoveryRequirement | null;
  messageCount: number;
  toolCallCount: number;
  patchCount: number;
  commandCount: number;
  artifactCount: number;
  lastCommandResult: SafeJson | null;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface SessionSummary extends ProjectedSessionState {
  id: string;
  title: string;
  projectBindingId: string | null;
  projectDisplayName: string | null;
  providerId: string | null;
  modelId: string | null;
}

export interface RedactedSessionExport {
  schemaVersion: number;
  session: Omit<SessionRecord, "projectBindingId" | "activeLeafId"> & {
    projectDisplayName: string | null;
  };
  entries: SessionEntry[];
}
