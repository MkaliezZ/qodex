import type { ModelMessage, ModelProvider, ModelToolCall } from "@qodex/provider-sdk";

export type AgentLoopStatus =
  | "Idle"
  | "Planning"
  | "CallingModel"
  | "Streaming"
  | "ExecutingReadTool"
  | "WaitingForPatchApproval"
  | "ApplyingPatch"
  | "WaitingForCommandApproval"
  | "RunningCommand"
  | "Cancelling"
  | "ReturningToolResult"
  | "Done"
  | "Failed"
  | "Cancelled"
  | "LimitReached";

export type AgentTimelineKind =
  | "model"
  | "tool_request"
  | "tool_result"
  | "patch_proposal"
  | "patch_approval"
  | "command_approval"
  | "command_output"
  | "final"
  | "failure"
  | "limit";

export interface AgentTimelineEntry {
  id: string;
  kind: AgentTimelineKind;
  title: string;
  status: "pending" | "running" | "success" | "error" | "denied" | "cancelled" | "expired";
  summary: string;
  detail?: string;
  durationMs?: number;
  toolCallId?: string;
  actionId?: string;
  timestamp: string;
}

export interface AgentProjectFile {
  path: string;
  size?: number;
}

export interface AgentProjectAccess {
  listFiles(): AgentProjectFile[];
  readFile(path: string): Promise<string>;
  commandExecutionAvailable: boolean;
}

export type ProjectCommandCategory = "test" | "check" | "lint" | "typecheck" | "build";

export interface ProjectCommandDefinition {
  id: string;
  label: string;
  executable: string;
  args: string[];
  cwd: string;
  source: "package.json" | "cargo";
  category: ProjectCommandCategory;
  /** Digest of the exact catalog source used to resolve this command. */
  catalogDigest?: string;
}

export interface ProjectCommandResult {
  commandId: string;
  approved: boolean;
  started: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  cancelled: boolean;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  durationMs: number;
}

export interface ProjectCommandRunner {
  run(command: ProjectCommandDefinition, runId: string): Promise<ProjectCommandResult>;
  cancel?(runId: string): Promise<void> | void;
}

export interface AgentPatchFile {
  path: string;
  oldContent: string;
  newContent: string;
}

export interface AgentPatchProposal {
  id: string;
  taskId: string;
  contractVersion?: "1";
  summary: string;
  files: AgentPatchFile[];
  createdAt: string;
}

export interface AgentPatchError {
  code: string;
  message: string;
  path?: string;
}

export interface AgentPatchResult {
  success: boolean;
  path: string;
  error?: string;
  code?: string;
  readbackVerified?: boolean;
  rollbackSucceeded?: boolean;
}

export interface AgentPatchAdapter {
  prepare(response: string, taskId: string): Promise<{
    assistantText: string;
    proposal: AgentPatchProposal | null;
    error: AgentPatchError | null;
  }>;
  apply(proposal: AgentPatchProposal): Promise<AgentPatchResult[]>;
  reject(proposal: AgentPatchProposal): void;
  rollback(proposal: AgentPatchProposal): Promise<AgentPatchResult[]>;
}

export interface AgentPatchLifecycleInput {
  taskId: string;
  proposal: AgentPatchProposal;
  approvalId: string;
  executionReceiptId: string;
}

export interface AgentPatchResultLifecycleInput extends AgentPatchLifecycleInput {
  results: AgentPatchResult[];
}

export interface AgentCommandLifecycleInput {
  taskId: string;
  pending: PendingCommandApproval;
  approvalId: string;
  executionReceiptId: string;
}

export interface AgentCommandResultLifecycleInput extends AgentCommandLifecycleInput {
  result: ProjectCommandResult;
}

export interface AgentSideEffectFailureInput {
  taskId: string;
  kind: "patch" | "command";
  actionId: string;
  approvalId: string;
  executionReceiptId: string;
  message: string;
}

export type AgentSideEffectKind = "patch" | "command" | "action";

export const SETTLEMENT_PERSISTENCE_ERROR_MESSAGE =
  "The action started, but KerniQ could not persist its final outcome. "
  + "The physical result is unknown. The action will not be replayed.";

export class SettlementPersistenceError extends Error {
  readonly physicalOutcome = "unknown" as const;

  constructor(
    readonly actionId: string,
    readonly actionKind: AgentSideEffectKind,
    readonly executionReceiptId: string,
  ) {
    super(SETTLEMENT_PERSISTENCE_ERROR_MESSAGE);
    this.name = "SettlementPersistenceError";
  }
}

export function isSettlementPersistenceError(value: unknown): value is SettlementPersistenceError {
  return value instanceof SettlementPersistenceError;
}

export interface AgentSideEffectLifecycle {
  beforePatchApply(input: AgentPatchLifecycleInput): Promise<void>;
  afterPatchApply(input: AgentPatchResultLifecycleInput): Promise<void>;
  beforeCommandStart(input: AgentCommandLifecycleInput): Promise<void>;
  afterCommandComplete(input: AgentCommandResultLifecycleInput): Promise<void>;
  afterSideEffectFailure(input: AgentSideEffectFailureInput): Promise<void>;
}

export type PendingPatchDisposition =
  | "user_rejected"
  | "task_cancelled"
  | "task_expired"
  | "task_failed";

export interface PendingCommandApproval {
  toolCall: ModelToolCall;
  command: ProjectCommandDefinition;
}

export interface AgentLoopLimits {
  maxModelTurns: number;
  maxTotalToolCalls: number;
  maxSearchCalls: number;
  maxReadCalls: number;
  maxCommandCalls: number;
  maxPatchProposals: number;
  maxTaskDurationMs: number;
}

export interface AgentLoopTask {
  id: string;
  prompt: string;
  status: AgentLoopStatus;
  output: string;
  error: string | null;
  limitReason: string | null;
  conversation: ModelMessage[];
  timeline: AgentTimelineEntry[];
  pendingPatch: AgentPatchProposal | null;
  pendingCommand: PendingCommandApproval | null;
  patchHistory: AgentPatchProposal[];
  modelTurns: number;
  totalToolCalls: number;
  searchCalls: number;
  readCalls: number;
  commandCalls: number;
  patchProposals: number;
  startedAt: number;
  updatedAt: number;
}

export interface AgentLoopRuntimeOptions {
  provider: ModelProvider;
  modelId: string;
  project: AgentProjectAccess;
  patchAdapter: AgentPatchAdapter;
  commandRunner?: ProjectCommandRunner;
  sideEffectLifecycle?: AgentSideEffectLifecycle;
  limits?: Partial<AgentLoopLimits>;
  systemPrompt?: string;
  now?: () => number;
}

export interface AgentRollbackAvailability {
  allowed: boolean;
  reason?: string;
}

export type AgentLoopListener = (task: AgentLoopTask) => void;
