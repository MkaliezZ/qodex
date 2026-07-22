import type { SessionRuntime } from "./runtime.js";
import type { ProjectedSessionState, SessionEntry, SessionRecord } from "./types.js";

const INTERRUPTED_RUNTIME_STATES = new Set([
  "Planning",
  "CallingModel",
  "Streaming",
  "ExecutingReadTool",
  "ApplyingPatch",
  "RunningCommand",
  "ReturningToolResult",
  "Cancelling",
]);

const TERMINAL_RUNTIME_EVENTS = {
  Done: "SESSION_COMPLETED",
  Failed: "SESSION_FAILED",
  Cancelled: "SESSION_CANCELLED",
  LimitReached: "SESSION_LIMIT_REACHED",
} as const;

export class SessionRecoveryService {
  constructor(private readonly runtime: SessionRuntime) {}

  async recover(
    session: SessionRecord,
    projection: ProjectedSessionState,
    activePath: SessionEntry[],
  ): Promise<ProjectedSessionState> {
    if (["Completed", "Failed", "Cancelled", "LimitReached", "RecoveryRequired", "Interrupted"].includes(projection.status)) {
      return projection;
    }
    if (projection.pendingAction?.started || hasUnmatchedStartedAction(activePath)) {
      await this.runtime.appendEntry(session.id, {
        type: "SESSION_INTERRUPTED",
        payload: { reason: "Application stopped after a mutating action started but before it settled." },
        safeMetadata: { executionStatus: "unknown_or_interrupted" },
      });
      return this.runtime.projectCurrentState(session.id);
    }
    const runtimeStatus = projection.lastEntry.safeMetadata.runtimeStatus;
    if (runtimeStatus && runtimeStatus in TERMINAL_RUNTIME_EVENTS) {
      const type = TERMINAL_RUNTIME_EVENTS[runtimeStatus as keyof typeof TERMINAL_RUNTIME_EVENTS];
      await this.runtime.appendEntry(session.id, {
        type,
        payload: { reason: `Recovered terminal ${runtimeStatus} evidence after restart.` },
        safeMetadata: { executionStatus: "settled" },
      });
      return this.runtime.projectCurrentState(session.id);
    }
    if (runtimeStatus && INTERRUPTED_RUNTIME_STATES.has(runtimeStatus)) {
      await this.runtime.appendEntry(session.id, {
        type: "SESSION_INTERRUPTED",
        payload: { reason: "Application stopped before the active operation settled." },
        safeMetadata: { executionStatus: "unknown_or_interrupted" },
      });
      return this.runtime.projectCurrentState(session.id);
    }
    if (runtimeStatus === "WaitingForPatchApproval" || (!runtimeStatus && projection.pendingAction?.kind === "patch")) {
      const approvalGeneration = (projection.pendingAction?.approvalGeneration ?? 0) + 1;
      await this.runtime.appendEntry(session.id, {
        type: "RECOVERY_REQUIRED",
        payload: { reason: "patch_reapproval" },
        safeMetadata: { executionStatus: "unknown_or_interrupted", approvalGeneration },
      });
      return this.runtime.projectCurrentState(session.id);
    }
    if (runtimeStatus === "WaitingForCommandApproval" || (!runtimeStatus && projection.pendingAction?.kind === "command")) {
      const approvalGeneration = (projection.pendingAction?.approvalGeneration ?? 0) + 1;
      await this.runtime.appendEntry(session.id, {
        type: "RECOVERY_REQUIRED",
        payload: { reason: "command_reapproval" },
        safeMetadata: { executionStatus: "unknown_or_interrupted", approvalGeneration },
      });
      return this.runtime.projectCurrentState(session.id);
    }
    if (!runtimeStatus || runtimeStatus === "Idle") {
      await this.runtime.appendEntry(session.id, {
        type: "SESSION_INTERRUPTED",
        payload: { reason: "Application stopped before the active operation settled." },
        safeMetadata: { executionStatus: "unknown_or_interrupted" },
      });
    }
    return this.runtime.projectCurrentState(session.id);
  }
}

function hasUnmatchedStartedAction(entries: SessionEntry[]): boolean {
  const started = new Set<string>();
  for (const entry of entries) {
    const actionId = actionIdOf(entry);
    if (["PATCH_STARTED", "COMMAND_STARTED", "ACTION_STARTED"].includes(entry.type) && actionId) {
      started.add(actionId);
      continue;
    }
    if (["PATCH_APPLIED", "COMMAND_COMPLETED", "ACTION_COMPLETED", "ACTION_FAILED"].includes(entry.type) && actionId) {
      started.delete(actionId);
      continue;
    }
    if (["SESSION_COMPLETED", "SESSION_FAILED", "SESSION_CANCELLED", "SESSION_LIMIT_REACHED"].includes(entry.type)) {
      started.clear();
    }
  }
  return started.size > 0;
}

function actionIdOf(entry: SessionEntry): string | null {
  if (typeof entry.safeMetadata.actionId === "string") return entry.safeMetadata.actionId;
  if (isRecord(entry.payload) && typeof entry.payload.actionId === "string") return entry.payload.actionId;
  return null;
}

function isRecord(value: SessionEntry["payload"]): value is Record<string, SessionEntry["payload"]> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
