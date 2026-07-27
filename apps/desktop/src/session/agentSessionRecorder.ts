import {
  AgentCommandDecisionGateError,
  SettlementPersistenceError,
  type AgentCommandDecisionLifecycleInput,
  type AgentCommandDecisionReceipt,
  type AgentCommandResultLifecycleInput,
  type AgentCommandStartReceipt,
  type AgentCommandStartLifecycleInput,
  type AgentLoopTask,
  type AgentPatchLifecycleInput,
  type AgentPatchProposal,
  type AgentPatchResultLifecycleInput,
  type AgentSideEffectFailureInput,
  type AgentSideEffectLifecycle,
  type AgentTimelineEntry,
  type PendingCommandApproval,
  type ProjectCommandResult,
} from "@qodex/agent-runtime";
import type { AgentFuseAdapter } from "@qodex/agentfuse-adapter";
import {
  inspectSensitiveText,
  sanitizeSensitiveText,
  SessionRecorder,
  type AppendEntryInput,
  type SafeJson,
  type SessionRuntime,
} from "@qodex/session-runtime";
import {
  ProjectCommandDecisionPersistenceError,
} from "./projectCommandDecisionCoordinator";
import {
  ProjectCommandLiveDecisionGate,
  type LiveProjectCommandDecision,
  type LiveProjectCommandProposal,
} from "./projectCommandLiveDecisionGate";

export interface AgentSessionRecorderOptions {
  runtime: SessionRuntime;
  sessionId: string;
  onRecorded?: () => void | Promise<void>;
  commandDecisionAdapter?: AgentFuseAdapter;
  projectBindingId?: string;
  projectFingerprint?: string;
  clock?: () => Date;
}

export class AgentSessionLedgerRecorder implements AgentSideEffectLifecycle {
  private readonly recorder: SessionRecorder;
  private readonly seenTimeline = new Set<string>();
  private lastStatus: string | null = null;
  private stateSequence = 0;
  private pendingPatch: AgentPatchProposal | null = null;
  private pendingCommand: PendingCommandApproval | null = null;
  private settlementEvidenceUncertain = false;
  private readonly clock: () => Date;
  private readonly commandDecisionGate: ProjectCommandLiveDecisionGate | null;
  private readonly liveProposalOperations = new Map<
    string,
    Promise<LiveProjectCommandProposal>
  >();
  private readonly failedProposalActions = new Set<string>();
  private readonly liveDecisions = new Map<string, LiveProjectCommandDecision>();

  constructor(options: AgentSessionRecorderOptions) {
    this.recorder = new SessionRecorder(options.runtime, options.sessionId, options.onRecorded);
    this.clock = options.clock ?? (() => new Date());
    const gateValues = [
      options.commandDecisionAdapter,
      options.projectBindingId,
      options.projectFingerprint,
    ];
    if (gateValues.some(Boolean) && !gateValues.every(Boolean)) {
      throw new TypeError(
        "Project Command decision integration requires adapter, binding ID, and fingerprint.",
      );
    }
    this.commandDecisionGate = options.commandDecisionAdapter
      && options.projectBindingId
      && options.projectFingerprint
      ? new ProjectCommandLiveDecisionGate({
        runtime: options.runtime,
        recorder: this.recorder,
        adapter: options.commandDecisionAdapter,
        projectBindingId: options.projectBindingId,
        projectFingerprint: options.projectFingerprint,
        ...(options.clock ? { clock: options.clock } : {}),
      })
      : null;
  }

  recordUserMessage(text: string): void {
    this.recorder.record({
      type: "USER_MESSAGE",
      payload: { text: safeText(text) },
      safeMetadata: { recordKey: "user-message:1" },
    });
  }

  recordTask(task: AgentLoopTask): void {
    if (task.pendingPatch) this.pendingPatch = task.pendingPatch;
    if (task.pendingCommand) this.pendingCommand = task.pendingCommand;
    this.recordPendingActions(task);
    if (task.status !== this.lastStatus) {
      this.recordStateTransition(task);
      this.lastStatus = task.status;
    }
    for (const entry of task.timeline) {
      if (this.seenTimeline.has(entry.id)) continue;
      this.seenTimeline.add(entry.id);
      this.recordTimelineEntry(task, entry);
    }
  }

  async flush(): Promise<void> {
    await Promise.all(this.liveProposalOperations.values());
    if (this.failedProposalActions.size > 0) {
      throw new AgentCommandDecisionGateError("project_command_policy_error");
    }
    await this.recorder.flush();
  }

  async beforePatchApply(input: AgentPatchLifecycleInput): Promise<void> {
    await this.recorder.recordDurably({
      type: "PATCH_APPROVED",
      payload: { actionId: input.proposal.id },
      safeMetadata: {
        recordKey: `patch-approved:${input.proposal.id}`,
        taskId: input.taskId,
        actionId: input.proposal.id,
        approvalId: input.approvalId,
        approvalGeneration: 0,
      },
    });
    await this.recorder.recordDurably({
      type: "PATCH_STARTED",
      payload: { actionId: input.proposal.id },
      safeMetadata: {
        recordKey: `patch-started:${input.proposal.id}`,
        taskId: input.taskId,
        actionId: input.proposal.id,
        approvalId: input.approvalId,
        approvalGeneration: 0,
        executionReceiptId: input.executionReceiptId,
        executionStatus: "running",
      },
    });
  }

  async afterPatchApply(input: AgentPatchResultLifecycleInput): Promise<void> {
    const success = input.results.length === input.proposal.files.length
      && input.results.every((result) => result.success && result.readbackVerified === true);
    await this.recordSettlement("patch", input.proposal.id, input.executionReceiptId, {
      type: success ? "PATCH_APPLIED" : "ACTION_FAILED",
      payload: {
        actionId: input.proposal.id,
        status: success ? "success" : "failed",
        results: input.results.map((result) => ({
          path: result.path,
          success: result.success,
          readbackVerified: result.readbackVerified === true,
          ...(result.code ? { code: result.code } : {}),
        })),
      },
      safeMetadata: {
        recordKey: `patch-settled:${input.proposal.id}`,
        taskId: input.taskId,
        actionId: input.proposal.id,
        approvalId: input.approvalId,
        approvalGeneration: 0,
        executionReceiptId: input.executionReceiptId,
        executionStatus: success ? "success" : "failed",
      },
    });
  }

  async beforeCommandDecision(
    input: AgentCommandDecisionLifecycleInput,
  ): Promise<AgentCommandDecisionReceipt> {
    if (!this.commandDecisionGate) {
      throw new AgentCommandDecisionGateError("project_command_policy_error");
    }
    try {
      const proposed = await this.ensureLiveProposal(
        input.taskId,
        input.pending,
        this.clock().toISOString(),
      );
      const context = await this.commandDecisionGate.approveAndDecide(
        proposed,
        input.approvalId,
        input.signal,
      );
      if (context.decision.decision === "hold") {
        throw new AgentCommandDecisionGateError("project_command_policy_error");
      }
      if (context.decision.decision === "allow") {
        this.liveDecisions.set(context.proposal.actionId, context);
      } else {
        this.clearLiveCommand(context.proposal.actionId, context);
      }
      return {
        decisionId: context.decision.decisionId,
        decision: context.decision.decision,
        reasonCode: context.decision.reasonCode,
        summary: context.decision.summary,
      };
    } catch (error) {
      this.clearLiveCommand(input.pending.toolCall.id);
      if (error instanceof AgentCommandDecisionGateError) throw error;
      if (isAbortError(error)) {
        throw new AgentCommandDecisionGateError(
          "project_command_decision_cancelled",
        );
      }
      if (error instanceof ProjectCommandDecisionPersistenceError) {
        throw new AgentCommandDecisionGateError(
          "project_command_decision_persistence_failed",
        );
      }
      throw new AgentCommandDecisionGateError("project_command_policy_error");
    }
  }

  async beforeCommandStart(
    input: AgentCommandStartLifecycleInput,
  ): Promise<AgentCommandStartReceipt | void> {
    const actionId = input.pending.toolCall.id;
    if (this.commandDecisionGate) {
      const context = this.liveDecisions.get(actionId);
      if (
        !context
        || context.decision.decision !== "allow"
        || context.decision.decisionId !== input.decision.decisionId
      ) {
        throw new AgentCommandDecisionGateError(
          "project_command_start_persistence_failed",
        );
      }
      try {
        return await this.commandDecisionGate.recordStarted(
          context,
          input.pending,
          input.executionReceiptId,
          input.signal,
        );
      } catch (error) {
        this.clearLiveCommand(actionId, context);
        if (isAbortError(error)) {
          throw new AgentCommandDecisionGateError(
            "project_command_decision_cancelled",
          );
        }
        throw new AgentCommandDecisionGateError(
          "project_command_start_persistence_failed",
        );
      }
    }
    await this.recorder.recordDurably({
      type: "COMMAND_APPROVED",
      payload: { actionId },
      safeMetadata: {
        recordKey: `command-approved:${actionId}`,
        taskId: input.taskId,
        toolCallId: actionId,
        actionId,
        approvalId: input.approvalId,
        approvalGeneration: 0,
      },
    });
    await this.recorder.recordDurably({
      type: "COMMAND_STARTED",
      payload: { actionId, commandId: input.pending.command.id },
      safeMetadata: {
        recordKey: `command-started:${actionId}`,
        taskId: input.taskId,
        toolCallId: actionId,
        actionId,
        approvalId: input.approvalId,
        approvalGeneration: 0,
        executionReceiptId: input.executionReceiptId,
        executionStatus: "running",
      },
    });
  }

  async afterCommandComplete(input: AgentCommandResultLifecycleInput): Promise<void> {
    const actionId = input.pending.toolCall.id;
    const context = this.liveDecisions.get(actionId);
    try {
      await this.recordSettlement("command", actionId, input.executionReceiptId, {
        type: "COMMAND_COMPLETED",
        payload: { actionId, ...safeRecoveredCommandResult(input.result) },
        safeMetadata: {
          recordKey: `command-completed:${actionId}`,
          taskId: input.taskId,
          toolCallId: actionId,
          actionId,
          approvalId: input.approvalId,
          approvalGeneration: context ? context.approval.generation - 1 : 0,
          ...(context ? { decisionId: context.decision.decisionId } : {}),
          executionReceiptId: input.executionReceiptId,
          executionStatus: input.result.cancelled ? "cancelled" : "completed",
        },
      });
    } finally {
      this.clearLiveCommand(actionId, context);
    }
  }

  async afterSideEffectFailure(input: AgentSideEffectFailureInput): Promise<void> {
    const context = input.kind === "command"
      ? this.liveDecisions.get(input.actionId)
      : undefined;
    try {
      await this.recordSettlement(input.kind, input.actionId, input.executionReceiptId, {
        type: "ACTION_FAILED",
        payload: { actionId: input.actionId, reason: safeText(input.message) },
        safeMetadata: {
          recordKey: `${input.kind}-settled:${input.actionId}`,
          taskId: input.taskId,
          actionId: input.actionId,
          approvalId: input.approvalId,
          approvalGeneration: 0,
          executionReceiptId: input.executionReceiptId,
          executionStatus: "failed",
        },
      });
    } finally {
      if (input.kind === "command") {
        this.clearLiveCommand(input.actionId, context);
      }
    }
  }

  private async recordSettlement(
    kind: "patch" | "command",
    actionId: string,
    executionReceiptId: string,
    entry: AppendEntryInput,
  ): Promise<void> {
    try {
      await this.recorder.recordDurably(entry);
    } catch {
      this.settlementEvidenceUncertain = true;
      try {
        await this.recorder.recordDurably({
          type: "SESSION_INTERRUPTED",
          payload: { reason: "settlement_evidence_persistence_failed" },
          safeMetadata: {
            recordKey: `settlement-interrupted:${executionReceiptId}`,
            actionId,
            executionReceiptId,
            executionStatus: "unknown_or_interrupted",
          },
        });
      } catch {
        // The durable started receipt remains the authoritative restart evidence.
      }
      throw new SettlementPersistenceError(actionId, kind, executionReceiptId);
    }
  }

  private recordPendingActions(task: AgentLoopTask): void {
    if (task.pendingPatch) {
      const proposal = safePatch(task.pendingPatch);
      this.recorder.record({
        type: "PATCH_PROPOSED",
        payload: proposal.payload,
        safeMetadata: {
          recordKey: `patch-proposed:${task.pendingPatch.id}`,
          taskId: task.id,
          actionId: task.pendingPatch.id,
          runtimeStatus: task.status,
          recoverable: proposal.recoverable,
          sensitiveContentRedacted: !proposal.recoverable,
        },
        createdAt: task.pendingPatch.createdAt,
      });
    }
    if (task.pendingCommand) {
      if (this.commandDecisionGate) {
        const requestedAt = commandRequestedAt(
          task,
          task.pendingCommand.toolCall.id,
        );
        void this.ensureLiveProposal(
          task.id,
          task.pendingCommand,
          requestedAt,
        ).catch(() => {});
      } else {
        this.recorder.record({
          type: "COMMAND_PROPOSED",
          payload: commandProposalPayload(task.pendingCommand),
          safeMetadata: {
            recordKey: `command-proposed:${task.pendingCommand.toolCall.id}`,
            taskId: task.id,
            toolCallId: task.pendingCommand.toolCall.id,
            actionId: task.pendingCommand.toolCall.id,
            runtimeStatus: task.status,
          },
        });
      }
    }
  }

  private recordStateTransition(task: AgentLoopTask): void {
    this.stateSequence += 1;
    this.recorder.record({
      type: "AGENT_STATE_CHANGED",
      payload: {
        status: task.status,
        ...(task.error ? { reason: safeText(task.error) } : {}),
        ...(task.limitReason ? { limitReason: safeText(task.limitReason) } : {}),
      },
      safeMetadata: {
        recordKey: `agent-state:${task.id}:${this.stateSequence}:${task.status}`,
        taskId: task.id,
        runtimeStatus: task.status,
        executionStatus: this.settlementEvidenceUncertain
          ? "unknown_or_interrupted"
          : activeExecutionStatus(task.status),
      },
    });
  }

  private recordTimelineEntry(task: AgentLoopTask, entry: AgentTimelineEntry): void {
    const base = {
      taskId: task.id,
      recordKey: `agent-timeline:${entry.id}`,
      ...(entry.toolCallId ? { toolCallId: entry.toolCallId } : {}),
      ...(entry.actionId ? { actionId: entry.actionId } : {}),
    };
    switch (entry.kind) {
      case "model":
        this.recorder.record({
          type: "MODEL_MESSAGE",
          payload: { text: safeText(entry.summary) },
          safeMetadata: base,
          createdAt: entry.timestamp,
        });
        return;
      case "tool_request":
        this.recorder.record({
          type: "TOOL_REQUESTED",
          payload: {
            toolCallId: entry.toolCallId ?? entry.id,
            name: entry.title,
          },
          safeMetadata: base,
          createdAt: entry.timestamp,
        });
        return;
      case "tool_result":
        this.recorder.record({
          type: "TOOL_COMPLETED",
          payload: {
            toolCallId: entry.toolCallId ?? entry.id,
            name: entry.title.replace(/ result$/, ""),
            status: entry.status,
            summary: safeText(entry.summary),
            ...(entry.durationMs === undefined ? {} : { durationMs: entry.durationMs }),
          },
          safeMetadata: base,
          createdAt: entry.timestamp,
        });
        return;
      case "patch_proposal":
        if (this.pendingPatch && this.pendingPatch.id === entry.actionId) {
          const proposal = safePatch(this.pendingPatch);
          this.recorder.record({
            type: "PATCH_PROPOSED",
            payload: proposal.payload,
            safeMetadata: {
              ...base,
              recordKey: `patch-proposed:${this.pendingPatch.id}`,
              recoverable: proposal.recoverable,
              sensitiveContentRedacted: !proposal.recoverable,
            },
            createdAt: entry.timestamp,
          });
        }
        return;
      case "patch_approval":
        this.recordPatchTimeline(entry, base);
        return;
      case "command_approval":
        this.recordCommandApproval(entry, base);
        return;
      case "command_output":
        this.recordCommandOutput(entry, base);
        return;
      case "final":
        if (this.settlementEvidenceUncertain) return;
        this.recorder.record({
          type: "SESSION_COMPLETED",
          payload: { reason: safeText(entry.summary) },
          safeMetadata: base,
          createdAt: entry.timestamp,
        });
        return;
      case "failure":
        if (this.settlementEvidenceUncertain) return;
        this.recorder.record({
          type: task.status === "Cancelled" ? "SESSION_CANCELLED" : "SESSION_FAILED",
          payload: { reason: safeText(entry.summary) },
          safeMetadata: base,
          createdAt: entry.timestamp,
        });
        return;
      case "limit":
        if (this.settlementEvidenceUncertain) return;
        this.recorder.record({
          type: "SESSION_LIMIT_REACHED",
          payload: { reason: safeText(entry.summary) },
          safeMetadata: base,
          createdAt: entry.timestamp,
        });
    }
  }

  private recordPatchTimeline(
    entry: AgentTimelineEntry,
    metadata: Record<string, SafeJson>,
  ): void {
    const actionId = entry.actionId ?? this.pendingPatch?.id;
    if (!actionId) return;
    if (entry.title === "Patch approved") {
      this.recorder.record({
        type: "PATCH_APPROVED",
        payload: { actionId },
        safeMetadata: { ...metadata, recordKey: `patch-approved:${actionId}`, actionId },
        createdAt: entry.timestamp,
      });
      return;
    }
    if (entry.title.includes("applied") || entry.title.includes("apply failed")) {
      this.recorder.record({
        type: entry.status === "success" ? "PATCH_APPLIED" : "ACTION_FAILED",
        payload: { actionId, status: entry.status, summary: safeText(entry.summary) },
        safeMetadata: {
          ...metadata,
          recordKey: `patch-settled:${actionId}`,
          actionId,
          executionStatus: entry.status,
        },
        createdAt: entry.timestamp,
      });
      return;
    }
    if (entry.title.includes("rolled back")) {
      this.recorder.record({
        type: "ARTIFACT_CREATED",
        payload: { artifactId: entry.id, kind: "verified_rollback", summary: safeText(entry.summary) },
        safeMetadata: metadata,
        createdAt: entry.timestamp,
      });
      return;
    }
    this.recorder.record({
      type: "PATCH_REJECTED",
      payload: { actionId, reason: safeText(entry.title) },
      safeMetadata: { ...metadata, actionId },
      createdAt: entry.timestamp,
    });
  }

  private recordCommandApproval(entry: AgentTimelineEntry, metadata: Record<string, SafeJson>): void {
    const actionId = entry.actionId ?? this.pendingCommand?.toolCall.id;
    if (!actionId) return;
    if (this.commandDecisionGate) {
      if (entry.status !== "success") this.clearLiveCommand(actionId);
      if (entry.title !== "Command denied") return;
    }
    this.recorder.record({
      type: entry.status === "success" ? "COMMAND_APPROVED" : "COMMAND_DENIED",
      payload: { actionId, reason: safeText(entry.summary) },
      safeMetadata: {
        ...metadata,
        recordKey: entry.status === "success" ? `command-approved:${actionId}` : `command-denied:${actionId}`,
        actionId,
      },
      createdAt: entry.timestamp,
    });
  }

  private ensureLiveProposal(
    taskId: string,
    pending: PendingCommandApproval,
    requestedAt: string,
  ): Promise<LiveProjectCommandProposal> {
    const actionId = pending.toolCall.id;
    const existing = this.liveProposalOperations.get(actionId);
    if (existing) return existing;
    if (this.failedProposalActions.has(actionId)) {
      return Promise.reject(
        new AgentCommandDecisionGateError("project_command_policy_error"),
      );
    }
    if (!this.commandDecisionGate) {
      return Promise.reject(
        new AgentCommandDecisionGateError("project_command_policy_error"),
      );
    }
    let operation: Promise<LiveProjectCommandProposal>;
    operation = this.commandDecisionGate.propose(
      taskId,
      pending,
      requestedAt,
    ).catch((error) => {
      if (this.liveProposalOperations.get(actionId) === operation) {
        this.liveProposalOperations.delete(actionId);
      }
      this.failedProposalActions.add(actionId);
      throw error;
    });
    this.liveProposalOperations.set(actionId, operation);
    return operation;
  }

  private clearLiveCommand(
    actionId: string,
    context = this.liveDecisions.get(actionId),
  ): void {
    if (context) this.commandDecisionGate?.release(context);
    this.liveDecisions.delete(actionId);
    this.liveProposalOperations.delete(actionId);
    this.failedProposalActions.delete(actionId);
  }

  private recordCommandOutput(entry: AgentTimelineEntry, metadata: Record<string, SafeJson>): void {
    const actionId = entry.actionId ?? this.pendingCommand?.toolCall.id;
    if (!actionId) return;
    if (entry.status === "denied") {
      this.recorder.record({
        type: "COMMAND_DENIED",
        payload: { actionId, reason: safeText(entry.summary) },
        safeMetadata: { ...metadata, recordKey: `command-denied:${actionId}`, actionId },
        createdAt: entry.timestamp,
      });
      return;
    }
    this.recorder.record({
      type: "COMMAND_COMPLETED",
      payload: commandResultPayload(actionId, entry),
      safeMetadata: {
        ...metadata,
        recordKey: `command-completed:${actionId}`,
        actionId,
        executionStatus: entry.status,
      },
      createdAt: entry.timestamp,
    });
  }
}

function safePatch(proposal: AgentPatchProposal): { payload: SafeJson; recoverable: boolean } {
  const recoverable = !proposal.files.some((file) => (
    inspectSensitiveText(file.path).hasSensitiveText
    || inspectSensitiveText(file.oldContent).hasSensitiveText
    || inspectSensitiveText(file.newContent).hasSensitiveText
  ));
  const files: SafeJson[] = proposal.files.map((file): SafeJson => {
    if (recoverable) {
      return {
        path: safeText(file.path),
        oldContent: file.oldContent,
        newContent: file.newContent,
      };
    }
    return {
      path: safeText(file.path),
      contentRedacted: true,
    };
  });
  return {
    recoverable,
    payload: {
      actionId: proposal.id,
      taskId: proposal.taskId,
      summary: safeText(proposal.summary),
      createdAt: proposal.createdAt,
      files,
    },
  };
}

function commandProposalPayload(pending: PendingCommandApproval): SafeJson {
  return {
    actionId: pending.toolCall.id,
    toolCallId: pending.toolCall.id,
    command: {
      id: pending.command.id,
      label: safeText(pending.command.label),
      executable: safeText(pending.command.executable),
      args: pending.command.args.map(safeText),
      cwd: safeText(pending.command.cwd),
      source: pending.command.source,
      category: pending.command.category,
      catalogDigest: pending.command.catalogDigest ?? "unavailable",
    },
  };
}

function commandResultPayload(actionId: string, entry: AgentTimelineEntry): SafeJson {
  return {
    actionId,
    status: entry.status,
    summary: safeText(entry.summary),
    ...(entry.durationMs === undefined ? {} : { durationMs: entry.durationMs }),
  };
}

function safeText(value: string): string {
  return sanitizeSensitiveText(value);
}

function activeExecutionStatus(status: AgentLoopTask["status"]): string {
  if (status === "RunningCommand" || status === "ApplyingPatch") return "running";
  if (["Done", "Failed", "Cancelled", "LimitReached"].includes(status)) return "settled";
  return "active";
}

function commandRequestedAt(task: AgentLoopTask, toolCallId: string): string {
  for (let index = task.timeline.length - 1; index >= 0; index -= 1) {
    const entry = task.timeline[index];
    if (entry.kind === "tool_request" && entry.toolCallId === toolCallId) {
      return entry.timestamp;
    }
  }
  return new Date(task.updatedAt).toISOString();
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function safeRecoveredCommandResult(result: ProjectCommandResult): Record<string, SafeJson> {
  return {
    commandId: result.commandId,
    approved: result.approved,
    started: result.started,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    cancelled: result.cancelled,
    stdoutTruncated: result.stdoutTruncated,
    stderrTruncated: result.stderrTruncated,
    durationMs: result.durationMs,
  };
}
