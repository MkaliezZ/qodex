export type ControlPlaneTaskStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed";

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

export type GovernanceTier = "OBSERVED" | "GOVERNED";

export interface AgentAdapterCapabilities {
  readonly supportsStreaming: boolean;
  readonly supportsCancel: boolean;
  readonly supportsToolEvents: boolean;
  readonly supportsExternalGovernance: boolean;
  readonly governanceTier: GovernanceTier;
  readonly supportsResume: boolean;
}

export interface ControlPlaneTaskInput {
  readonly taskId: string;
  readonly title: string;
  readonly workspace: string;
  readonly prompt: string;
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

export interface AgentAdapter {
  readonly id: string;
  readonly kind: string;
  readonly version: string;
  readonly capabilities: AgentAdapterCapabilities;
  runTask(
    input: ControlPlaneTaskInput,
    observe: (observation: AgentObservation) => void,
  ): Promise<AgentTaskResult>;
  cancel?(taskId: string): Promise<void>;
}

export interface WorkerLifecycleEntry {
  readonly status: WorkerRunStatus;
  readonly at: string;
  readonly summary: string;
}

export interface WorkerRun {
  readonly runId: string;
  readonly taskId: string;
  readonly agentId: string;
  readonly agentKind: string;
  readonly agentVersion: string;
  readonly capabilities: AgentAdapterCapabilities;
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

export interface GovernanceLimitationEvidence {
  readonly action: "git push";
  readonly interception: "not_proven";
  readonly decision: "unknown";
  readonly dispatchOccurred: "unknown";
  readonly handlerStarted: "unknown";
  readonly outcome: "not_tested";
  readonly reason: string;
}

export interface ControlPlaneTaskResult {
  readonly taskId: string;
  readonly title: string;
  readonly status: ControlPlaneTaskStatus;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly workers: readonly WorkerRun[];
  readonly reconciliation: ReconciliationResult;
  readonly governance: GovernanceLimitationEvidence;
}
