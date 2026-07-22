import type { SessionRuntime } from "./runtime.js";
import type { ProjectedSessionState, SessionRecord } from "./types.js";

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

  async recover(session: SessionRecord, projection: ProjectedSessionState): Promise<ProjectedSessionState> {
    if (["Completed", "Failed", "Cancelled", "LimitReached", "RecoveryRequired", "Interrupted"].includes(projection.status)) {
      return projection;
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
      await this.runtime.appendEntry(session.id, {
        type: "RECOVERY_REQUIRED",
        payload: { reason: "patch_reapproval" },
        safeMetadata: { executionStatus: "unknown_or_interrupted" },
      });
      return this.runtime.projectCurrentState(session.id);
    }
    if (runtimeStatus === "WaitingForCommandApproval" || (!runtimeStatus && projection.pendingAction?.kind === "command")) {
      await this.runtime.appendEntry(session.id, {
        type: "RECOVERY_REQUIRED",
        payload: { reason: "command_reapproval" },
        safeMetadata: { executionStatus: "unknown_or_interrupted" },
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
