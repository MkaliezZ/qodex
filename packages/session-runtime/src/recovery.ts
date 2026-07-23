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

const STARTED_EVENTS = new Set(["PATCH_STARTED", "COMMAND_STARTED", "ACTION_STARTED"]);
const SETTLED_EVENTS = new Set(["PATCH_APPLIED", "COMMAND_COMPLETED", "ACTION_COMPLETED", "ACTION_FAILED"]);
const MASKING_TERMINAL_EVENTS = new Set([
  "SESSION_COMPLETED",
  "DELIVERY_COMPLETED",
  "SESSION_FAILED",
  "SESSION_CANCELLED",
  "SESSION_LIMIT_REACHED",
]);

interface UnmatchedStartedAction {
  actionId: string;
  maskingTerminalParentEntryId: string | null;
  alreadyInterrupted: boolean;
}

export class SessionRecoveryService {
  constructor(private readonly runtime: SessionRuntime) {}

  async recover(
    session: SessionRecord,
    activePath: SessionEntry[],
  ): Promise<ProjectedSessionState> {
    const unmatchedStarted = findUnmatchedStartedAction(activePath);
    if (unmatchedStarted) {
      if (!unmatchedStarted.maskingTerminalParentEntryId && unmatchedStarted.alreadyInterrupted) {
        return this.runtime.projector.project(activePath);
      }
      await this.runtime.appendEntry(session.id, {
        ...(unmatchedStarted.maskingTerminalParentEntryId
          ? { parentEntryId: unmatchedStarted.maskingTerminalParentEntryId }
          : {}),
        type: "SESSION_INTERRUPTED",
        payload: { reason: "unmatched_started_action_after_restart" },
        safeMetadata: {
          actionId: unmatchedStarted.actionId,
          executionStatus: "unknown_or_interrupted",
        },
      });
      return this.runtime.projectCurrentState(session.id);
    }

    const projection = this.runtime.projector.project(activePath);
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

function findUnmatchedStartedAction(entries: SessionEntry[]): UnmatchedStartedAction | null {
  const started = new Map<string, UnmatchedStartedAction>();
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const actionId = actionIdOf(entry);
    if (STARTED_EVENTS.has(entry.type) && actionId) {
      started.set(actionId, {
        actionId,
        maskingTerminalParentEntryId: null,
        alreadyInterrupted: false,
      });
      continue;
    }
    if (SETTLED_EVENTS.has(entry.type) && actionId) {
      started.delete(actionId);
      continue;
    }
    if (entry.type === "SESSION_INTERRUPTED") {
      for (const evidence of started.values()) evidence.alreadyInterrupted = true;
      continue;
    }
    if (MASKING_TERMINAL_EVENTS.has(entry.type)) {
      const repairParentEntryId = entries[index - 1]?.id ?? null;
      for (const evidence of started.values()) {
        evidence.maskingTerminalParentEntryId ??= repairParentEntryId;
      }
    }
  }
  return started.values().next().value ?? null;
}

function actionIdOf(entry: SessionEntry): string | null {
  if (typeof entry.safeMetadata.actionId === "string") return entry.safeMetadata.actionId;
  if (isRecord(entry.payload) && typeof entry.payload.actionId === "string") return entry.payload.actionId;
  return null;
}

function isRecord(value: SessionEntry["payload"]): value is Record<string, SessionEntry["payload"]> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
