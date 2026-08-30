import type { AgentGovernanceEvidence } from "./governance.js";

export type ControlPlaneTaskStatus = "queued" | "running" | "completed" | "failed";

export type WorkerRunStatus =
  | "queued"
  | "starting"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "unknown";

export type SupervisorClassification =
  | "AGREEMENT"
  | "PARTIAL_AGREEMENT"
  | "DISAGREEMENT"
  | "UNRESOLVED";

export type GovernanceTier = "OPAQUE" | "OBSERVED" | "GOVERNED";

export type GovernanceMode =
  | "none"
  | "host_dispatch"
  | "pre_dispatch_plugin"
  | "external_decision";

export interface AgentBackendCapabilities {
  readonly supportsStreaming: boolean;
  readonly supportsCancel: boolean;
  readonly supportsToolEvents: boolean;
  readonly governanceTier: GovernanceTier;
  readonly governanceMode: GovernanceMode;
  readonly supportsResume: boolean;
}

export interface AgentBackendAdmission {
  readonly version: string;
  readonly model?: string;
  readonly capabilities: AgentBackendCapabilities;
}

export interface ControlPlaneWorkerRequirement {
  readonly backendId: string;
  readonly sessionId?: string;
  readonly governanceRequired?: boolean;
}

export interface ControlPlaneTaskInput {
  readonly taskId: string;
  readonly title: string;
  readonly workspace: string;
  readonly prompt: string;
  readonly workers?: readonly ControlPlaneWorkerRequirement[];
}

export interface AgentBackendTaskInput {
  readonly taskId: string;
  readonly title: string;
  readonly workspace: string;
  readonly prompt: string;
  readonly workerRunId: string;
  readonly sessionId?: string;
  readonly governanceRequired: boolean;
}

export interface AgentObservation {
  readonly kind:
    | "process_started"
    | "tool_observed"
    | "message_observed"
    | "process_completed";
  readonly at: string;
  readonly summary: string;
}

export interface ReviewFinding {
  readonly finding: string;
  readonly evidence: string;
  readonly severity: "critical" | "high" | "medium" | "low";
  readonly smallestFix: string;
  readonly files: readonly string[];
}

export interface AgentTaskResult {
  readonly findings: readonly ReviewFinding[];
  readonly rawResultReference: string;
}

export interface AgentBackendTaskOutput {
  readonly result: AgentTaskResult;
  readonly governanceEvidence: readonly AgentGovernanceEvidence[];
}

/**
 * Product-level control-plane backend.
 *
 * This contract owns runtime admission and bounded task transport only. It
 * does not approve actions, evaluate policy, execute KerniQ tools, or own the
 * Universal Session Ledger.
 */
export interface AgentBackend {
  readonly id: string;
  readonly kind: string;
  probeCapabilities(): Promise<AgentBackendAdmission>;
  startTask(
    input: AgentBackendTaskInput,
    observe: (observation: AgentObservation) => void,
  ): Promise<AgentBackendTaskOutput>;
  stop?(workerRunId: string): Promise<void>;
}

/** @deprecated Use AgentBackend. */
export type AgentAdapter = AgentBackend;

/** @deprecated Use AgentBackendCapabilities. */
export type AgentAdapterCapabilities = AgentBackendCapabilities;

export interface WorkerLifecycleEntry {
  readonly status: WorkerRunStatus;
  readonly at: string;
  readonly summary: string;
}

export interface WorkerGovernance {
  readonly tier: GovernanceTier;
  readonly mode: GovernanceMode;
  readonly evidence: readonly AgentGovernanceEvidence[];
}

export interface WorkerRun {
  readonly runId: string;
  readonly taskId: string;
  readonly sessionId?: string;
  readonly agentId: string;
  readonly agentKind: string;
  readonly agentVersion: string;
  readonly model?: string;
  readonly capabilities: AgentBackendCapabilities;
  readonly governance: WorkerGovernance;
  readonly status: WorkerRunStatus;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly lifecycle: readonly WorkerLifecycleEntry[];
  readonly observations: readonly AgentObservation[];
  readonly result?: AgentTaskResult;
  readonly error?: string;
}

export interface ReconciliationResult {
  readonly classification: SupervisorClassification;
  readonly sharedFiles: readonly string[];
  readonly matchedFindings: readonly MatchedFindingPair[];
  readonly agentOnlyFiles: Readonly<Record<string, readonly string[]>>;
  readonly summary: string;
}

export interface MatchedFindingPair {
  readonly leftAgentId: string;
  readonly rightAgentId: string;
  readonly files: readonly string[];
  readonly similarity: number;
}

export interface ControlPlaneTaskResult {
  readonly taskId: string;
  readonly title: string;
  readonly status: ControlPlaneTaskStatus;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly workers: readonly WorkerRun[];
  readonly reconciliation: ReconciliationResult;
}

export function createAgentBackendCapabilities(
  input: AgentBackendCapabilities,
): AgentBackendCapabilities {
  validateGovernanceCapability(input.governanceTier, input.governanceMode);
  return Object.freeze({ ...input });
}

function validateGovernanceCapability(tier: GovernanceTier, mode: GovernanceMode): void {
  if (tier === "GOVERNED" && mode === "none") {
    throw new TypeError("A governed backend must declare its governance mode.");
  }
  if (tier === "OPAQUE" && mode !== "none") {
    throw new TypeError("An opaque backend cannot claim a governance integration mode.");
  }
}
