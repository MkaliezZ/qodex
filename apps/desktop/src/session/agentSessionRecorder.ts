import type {
  AgentLoopTask,
  AgentPatchProposal,
  AgentTimelineEntry,
  PendingCommandApproval,
  ProjectCommandResult,
} from "@qodex/agent-runtime";
import { SessionRecorder, type SafeJson, type SessionRuntime } from "@qodex/session-runtime";

export interface AgentSessionRecorderOptions {
  runtime: SessionRuntime;
  sessionId: string;
  onRecorded?: () => void | Promise<void>;
}

export class AgentSessionLedgerRecorder {
  private readonly recorder: SessionRecorder;
  private readonly seenTimeline = new Set<string>();
  private lastStatus: string | null = null;
  private stateSequence = 0;
  private pendingPatch: AgentPatchProposal | null = null;
  private pendingCommand: PendingCommandApproval | null = null;

  constructor(options: AgentSessionRecorderOptions) {
    this.recorder = new SessionRecorder(options.runtime, options.sessionId, options.onRecorded);
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

  flush(): Promise<void> {
    return this.recorder.flush();
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
        },
        createdAt: task.pendingPatch.createdAt,
      });
    }
    if (task.pendingCommand) {
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

  private recordStateTransition(task: AgentLoopTask): void {
    this.stateSequence += 1;
    if (task.status === "ApplyingPatch" && this.pendingPatch) {
      this.recorder.record({
        type: "PATCH_APPROVED",
        payload: { actionId: this.pendingPatch.id },
        safeMetadata: {
          recordKey: `patch-approved:${this.pendingPatch.id}`,
          taskId: task.id,
          actionId: this.pendingPatch.id,
          approvalId: crypto.randomUUID(),
        },
      });
    }
    if (task.status === "RunningCommand" && this.pendingCommand) {
      const actionId = this.pendingCommand.toolCall.id;
      this.recorder.record({
        type: "COMMAND_APPROVED",
        payload: { actionId },
        safeMetadata: {
          recordKey: `command-approved:${actionId}`,
          taskId: task.id,
          toolCallId: actionId,
          actionId,
          approvalId: crypto.randomUUID(),
        },
      });
      this.recorder.record({
        type: "COMMAND_STARTED",
        payload: { actionId, commandId: this.pendingCommand.command.id },
        safeMetadata: {
          recordKey: `command-started:${actionId}`,
          taskId: task.id,
          toolCallId: actionId,
          actionId,
          executionReceiptId: crypto.randomUUID(),
          executionStatus: "running",
        },
      });
    }
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
        executionStatus: activeExecutionStatus(task.status),
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
            safeMetadata: { ...base, recordKey: `patch-proposed:${this.pendingPatch.id}`, recoverable: proposal.recoverable },
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
        this.recorder.record({
          type: "SESSION_COMPLETED",
          payload: { reason: safeText(entry.summary) },
          safeMetadata: base,
          createdAt: entry.timestamp,
        });
        return;
      case "failure":
        this.recorder.record({
          type: task.status === "Cancelled" ? "SESSION_CANCELLED" : "SESSION_FAILED",
          payload: { reason: safeText(entry.summary) },
          safeMetadata: base,
          createdAt: entry.timestamp,
        });
        return;
      case "limit":
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
        safeMetadata: { ...metadata, actionId, executionStatus: entry.status },
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
      safeMetadata: { ...metadata, actionId, executionStatus: entry.status },
      createdAt: entry.timestamp,
    });
  }
}

function safePatch(proposal: AgentPatchProposal): { payload: SafeJson; recoverable: boolean } {
  let recoverable = true;
  const files = proposal.files.map((file) => {
    const oldContent = safeText(file.oldContent);
    const newContent = safeText(file.newContent);
    if (oldContent !== file.oldContent || newContent !== file.newContent) recoverable = false;
    return { path: file.path, oldContent, newContent };
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
      label: pending.command.label,
      executable: pending.command.executable,
      args: [...pending.command.args],
      cwd: pending.command.cwd,
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
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]{12,}/gi, "[redacted-secret]")
    .replace(/((?:api[_-]?key|authorization)\s*[:=]\s*)[^\s,;]{8,}/gi, "$1[x]");
}

function activeExecutionStatus(status: AgentLoopTask["status"]): string {
  if (status === "RunningCommand" || status === "ApplyingPatch") return "running";
  if (["Done", "Failed", "Cancelled", "LimitReached"].includes(status)) return "settled";
  return "active";
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
