import type {
  AgentGovernanceEvidence,
  ControlPlaneSessionLedger,
  ControlPlaneWorkerSession,
  ControlPlaneWorkerSessionInput,
  ReconciliationResult,
  WorkerRun,
} from "@qodex/multi-agent-runtime";
import {
  SessionRecorder,
  type AppendEntryInput,
  type SafeJson,
  type SessionRuntime,
} from "@qodex/session-runtime";

export class DesktopControlPlaneSessionLedger implements ControlPlaneSessionLedger {
  constructor(
    private readonly runtime: SessionRuntime,
    private readonly onRecorded?: () => void | Promise<void>,
    private readonly randomId: () => string = () => crypto.randomUUID(),
  ) {}

  async createWorkerSession(
    input: ControlPlaneWorkerSessionInput,
  ): Promise<ControlPlaneWorkerSession> {
    const sessionId = this.randomId();
    await this.runtime.createSession({
      id: sessionId,
      title: `${input.taskTitle} · ${input.backendId}`,
      providerId: input.backendId,
      modelId: input.admission.model ?? null,
    });
    const session = Object.freeze({
      sessionId,
      workerRunId: input.workerRunId,
      backendId: input.backendId,
    });
    await this.record(sessionId, {
      type: "AGENT_STATE_CHANGED",
      payload: {
        status: "queued",
        summary: "Control-plane worker queued after durable session creation.",
        governanceRequired: input.governanceRequired,
      },
      safeMetadata: {
        recordKey: `${input.workerRunId}:session-bound`,
        controlPlaneTaskId: input.taskId,
        taskId: input.taskId,
        workerRunId: input.workerRunId,
        agentId: input.backendId,
        agentKind: input.backendKind,
        agentVersion: input.admission.version,
        governanceTier: input.admission.capabilities.governanceTier,
        governanceMode: input.admission.capabilities.governanceMode,
        runtimeStatus: "queued",
      },
    });
    return session;
  }

  async recordWorkerResult(
    worker: WorkerRun,
    reconciliation: ReconciliationResult,
  ): Promise<void> {
    if (!worker.sessionId) throw new Error("A product WorkerRun is missing its durable session ID.");
    try {
      for (const [index, entry] of worker.lifecycle.entries()) {
        if (index === 0) continue;
        await this.record(worker.sessionId, {
          type: "AGENT_STATE_CHANGED",
          payload: { status: entry.status, summary: entry.summary },
          safeMetadata: workerMetadata(worker, `${worker.runId}:lifecycle:${index}`, {
            runtimeStatus: entry.status,
          }),
          createdAt: entry.at,
        });
      }
      for (const [index, observation] of worker.observations.entries()) {
        await this.record(worker.sessionId, {
          type: "AGENT_STATE_CHANGED",
          payload: {
            status: observation.kind,
            summary: observation.summary,
          },
          safeMetadata: workerMetadata(worker, `${worker.runId}:observation:${index}`),
          createdAt: observation.at,
        });
      }
      for (const [index, finding] of (worker.result?.findings ?? []).entries()) {
        await this.record(worker.sessionId, {
          type: "MODEL_MESSAGE",
          payload: {
            summary: finding.finding,
            evidence: finding.evidence,
            severity: finding.severity,
            smallestFix: finding.smallestFix,
            files: [...finding.files],
          },
          safeMetadata: workerMetadata(worker, `${worker.runId}:finding:${index}`),
        });
      }
      for (const evidence of worker.governance.evidence) {
        await this.recordGovernanceEvidence(worker, evidence);
      }
      await this.record(worker.sessionId, terminalEntry(worker, reconciliation));
    } catch (error) {
      await this.recordInterrupted(worker).catch(() => {});
      throw error;
    }
  }

  async recordWorkerFailure(session: ControlPlaneWorkerSession, error: unknown): Promise<void> {
    await this.record(session.sessionId, {
      type: "SESSION_FAILED",
      payload: {
        reason: error instanceof Error ? error.message : "Control-plane worker admission failed.",
      },
      safeMetadata: {
        recordKey: `${session.workerRunId}:product-failure`,
        workerRunId: session.workerRunId,
        agentId: session.backendId,
        runtimeStatus: "failed",
      },
    });
  }

  private async recordGovernanceEvidence(
    worker: WorkerRun,
    evidence: AgentGovernanceEvidence,
  ): Promise<void> {
    await this.record(worker.sessionId!, {
      type: "TOOL_REQUESTED",
      payload: {
        name: evidence.toolName,
        summary: evidence.actionSummary,
        modelToolCallObserved: fact(evidence.modelToolCallObserved),
        preExecuteObserved: fact(evidence.preExecuteObserved),
      },
      safeMetadata: workerMetadata(worker, `${worker.runId}:tool:${evidence.toolCallId}:requested`, {
        toolCallId: evidence.toolCallId,
      }),
    });
    await this.record(worker.sessionId!, {
      type: "TOOL_COMPLETED",
      payload: {
        name: evidence.toolName,
        summary: `Governance ${evidence.outcome.replace(/_/g, " ")}.`,
        status: evidence.outcome,
        decision: fact(evidence.policyDecision),
        decisionReason: evidence.policyReason,
        dispatchOccurred: fact(evidence.dispatchOccurred),
        toolBodyStarted: fact(evidence.toolBodyStarted),
        physicalSideEffect: fact(evidence.physicalSideEffect),
        provenance: {
          runtimeSource: evidence.provenance.runtimeSource,
          modelProvider: evidence.provenance.modelProvider,
          model: evidence.provenance.model,
          policyAdapter: evidence.provenance.policyAdapter,
          captureMethod: evidence.provenance.captureMethod,
        },
      },
      safeMetadata: workerMetadata(worker, `${worker.runId}:tool:${evidence.toolCallId}:settled`, {
        toolCallId: evidence.toolCallId,
        governanceDecision: evidence.policyDecision.value,
        governanceOutcome: evidence.outcome,
      }),
    });
  }

  private async recordInterrupted(worker: WorkerRun): Promise<void> {
    if (!worker.sessionId) return;
    await this.record(worker.sessionId, {
      type: "SESSION_INTERRUPTED",
      payload: { reason: "control_plane_evidence_persistence_failed" },
      safeMetadata: workerMetadata(worker, `${worker.runId}:persistence-interrupted`, {
        executionStatus: "unknown_or_interrupted",
      }),
    });
  }

  private async record(sessionId: string, entry: AppendEntryInput): Promise<void> {
    const recorder = new SessionRecorder(this.runtime, sessionId, this.onRecorded);
    await recorder.recordDurably(entry);
  }
}

function workerMetadata(
  worker: WorkerRun,
  recordKey: string,
  extra: AppendEntryInput["safeMetadata"] = {},
): NonNullable<AppendEntryInput["safeMetadata"]> {
  return {
    recordKey,
    controlPlaneTaskId: worker.taskId,
    taskId: worker.taskId,
    workerRunId: worker.runId,
    agentId: worker.agentId,
    agentKind: worker.agentKind,
    agentVersion: worker.agentVersion,
    governanceTier: worker.governance.tier,
    governanceMode: worker.governance.mode,
    ...extra,
  };
}

function fact(value: { readonly value: SafeJson; readonly provenance: string }): SafeJson {
  return { value: value.value, provenance: value.provenance };
}

function terminalEntry(
  worker: WorkerRun,
  reconciliation: ReconciliationResult,
): AppendEntryInput {
  const common = {
    payload: {
      reason: worker.error ?? "Control-plane worker settled.",
      reconciliation: reconciliation.classification,
      reconciliationSummary: reconciliation.summary,
    },
    safeMetadata: workerMetadata(worker, `${worker.runId}:terminal`, {
      runtimeStatus: worker.status,
    }),
    createdAt: worker.endedAt,
  } as const;
  if (worker.status === "completed") return { type: "SESSION_COMPLETED", ...common };
  if (worker.status === "cancelled") return { type: "SESSION_CANCELLED", ...common };
  if (worker.status === "failed") return { type: "SESSION_FAILED", ...common };
  return { type: "SESSION_INTERRUPTED", ...common };
}
