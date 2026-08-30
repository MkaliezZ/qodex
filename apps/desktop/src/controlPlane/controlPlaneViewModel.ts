import type {
  AgentBackendAdmission,
  AgentGovernanceEvidence,
  ControlPlaneTaskResult,
  EvidenceFact,
  EvidenceTruthValue,
  GovernanceMode,
  GovernanceTier,
  WorkerRunStatus,
} from "@qodex/multi-agent-runtime";

export interface GovernanceEvidenceView {
  readonly toolName: string;
  readonly outcome: string;
  readonly decision: string;
  readonly dispatch: "YES" | "NO" | "UNKNOWN";
  readonly execution: "YES" | "NO" | "UNKNOWN";
  readonly evidence: "PROVEN" | "PARTIAL";
}

export interface ControlPlaneWorkerView {
  readonly id: string;
  readonly label: string;
  readonly model: string;
  readonly tier: GovernanceTier;
  readonly mode: GovernanceMode;
  readonly status: WorkerRunStatus;
  readonly evidence: readonly GovernanceEvidenceView[];
}

export interface ControlPlaneViewModel {
  readonly taskId: string;
  readonly title: string;
  readonly status: "running" | ControlPlaneTaskResult["status"];
  readonly workers: readonly ControlPlaneWorkerView[];
  readonly reconciliation: ControlPlaneTaskResult["reconciliation"] | null;
}

export function runningControlPlaneView(
  taskId: string,
  title: string,
  admissions: Readonly<Record<string, AgentBackendAdmission>>,
): ControlPlaneViewModel {
  return {
    taskId,
    title,
    status: "running",
    workers: [
      pendingWorker("codex", "Codex", admissions.codex),
      pendingWorker("dsh-deepseek", "DSH · DeepSeek", admissions["dsh-deepseek"]),
    ],
    reconciliation: null,
  };
}

export function settledControlPlaneView(result: ControlPlaneTaskResult): ControlPlaneViewModel {
  return {
    taskId: result.taskId,
    title: result.title,
    status: result.status,
    workers: result.workers.map((worker) => ({
      id: worker.agentId,
      label: workerLabel(worker.agentId),
      model: worker.model ?? "Not reported",
      tier: worker.governance.tier,
      mode: worker.governance.mode,
      status: worker.status,
      evidence: worker.governance.evidence.map(governanceEvidenceView),
    })),
    reconciliation: result.reconciliation,
  };
}

export function failedControlPlaneView(view: ControlPlaneViewModel): ControlPlaneViewModel {
  return {
    ...view,
    status: "failed",
    workers: view.workers.map((worker) => ({ ...worker, status: "failed" })),
  };
}

export function governanceFactLabel(
  fact: EvidenceFact<EvidenceTruthValue>,
): "YES" | "NO" | "UNKNOWN" {
  if (fact.provenance !== "observed") return "UNKNOWN";
  if (fact.value === true) return "YES";
  if (fact.value === false) return "NO";
  return "UNKNOWN";
}

function pendingWorker(
  id: string,
  label: string,
  admission: AgentBackendAdmission | undefined,
): ControlPlaneWorkerView {
  return {
    id,
    label,
    model: admission?.model ?? "Probing",
    tier: admission?.capabilities.governanceTier ?? "OPAQUE",
    mode: admission?.capabilities.governanceMode ?? "none",
    status: "running",
    evidence: [],
  };
}

function governanceEvidenceView(evidence: AgentGovernanceEvidence): GovernanceEvidenceView {
  const dispatch = governanceFactLabel(evidence.dispatchOccurred);
  const execution = governanceFactLabel(evidence.toolBodyStarted);
  return {
    toolName: evidence.toolName,
    outcome: evidence.outcome.toUpperCase(),
    decision: String(evidence.policyDecision.value).toUpperCase(),
    dispatch,
    execution,
    evidence: dispatch !== "UNKNOWN" && execution !== "UNKNOWN" ? "PROVEN" : "PARTIAL",
  };
}

function workerLabel(id: string): string {
  if (id === "codex") return "Codex";
  if (id === "dsh-deepseek") return "DSH · DeepSeek";
  return id;
}
