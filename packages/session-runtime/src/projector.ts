import type {
  PendingActionProjection,
  ProjectedSessionState,
  RecoveryRequirement,
  SafeJson,
  SessionEntry,
  SessionStatus,
} from "./types.js";

const TERMINAL = new Set<SessionStatus>(["Completed", "Failed", "Cancelled", "LimitReached"]);

export class SessionProjector {
  project(entries: SessionEntry[]): ProjectedSessionState {
    if (entries.length === 0 || entries[0].type !== "SESSION_CREATED") {
      throw new Error("A session ledger must begin with SESSION_CREATED.");
    }
    const seen = new Set<string>();
    let status: SessionStatus = "Active";
    let pendingAction: PendingActionProjection | null = null;
    let recoveryRequirement: RecoveryRequirement | null = null;
    let messageCount = 0;
    let toolCallCount = 0;
    let patchCount = 0;
    let commandCount = 0;
    let artifactCount = 0;
    let lastCommandResult: SafeJson | null = null;
    let completedAt: string | null = null;

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      if (seen.has(entry.id)) throw new Error("Duplicate ledger entry detected.");
      seen.add(entry.id);
      if (index > 0 && entry.type === "SESSION_CREATED") throw new Error("SESSION_CREATED may appear only once.");
      if (index > 0 && entry.sequence <= entries[index - 1].sequence) throw new Error("Ledger entries are not ordered.");
      if (TERMINAL.has(status)) throw new Error("A terminal session cannot receive more active-path entries.");

      switch (entry.type) {
        case "USER_MESSAGE":
        case "MODEL_MESSAGE":
          messageCount += 1;
          break;
        case "TOOL_REQUESTED":
          toolCallCount += 1;
          break;
        case "ACTION_PROPOSED":
          pendingAction = proposed(entry, "action");
          break;
        case "PATCH_PROPOSED":
          patchCount += 1;
          pendingAction = proposed(entry, "patch");
          break;
        case "COMMAND_PROPOSED":
          commandCount += 1;
          pendingAction = proposed(entry, "command");
          break;
        case "ACTION_APPROVED":
        case "PATCH_APPROVED":
        case "COMMAND_APPROVED":
          pendingAction = requirePending(pendingAction, entry);
          pendingAction.approved = true;
          pendingAction.recoveryRequired = false;
          recoveryRequirement = null;
          status = "Active";
          break;
        case "ACTION_DENIED":
        case "PATCH_REJECTED":
        case "COMMAND_DENIED":
          requirePending(pendingAction, entry);
          pendingAction = null;
          recoveryRequirement = null;
          break;
        case "ACTION_STARTED":
        case "COMMAND_STARTED":
          pendingAction = requirePending(pendingAction, entry);
          if (!pendingAction.approved) throw new Error("An action cannot start without approval.");
          break;
        case "ACTION_COMPLETED":
        case "PATCH_APPLIED":
          requirePending(pendingAction, entry);
          pendingAction = null;
          recoveryRequirement = null;
          break;
        case "COMMAND_COMPLETED":
          requirePending(pendingAction, entry);
          lastCommandResult = entry.payload;
          pendingAction = null;
          recoveryRequirement = null;
          break;
        case "ACTION_FAILED":
          if (pendingAction) requirePending(pendingAction, entry);
          pendingAction = null;
          break;
        case "ARTIFACT_CREATED":
          artifactCount += 1;
          break;
        case "RECOVERY_REQUIRED": {
          const reason = recoveryReason(entry.payload);
          recoveryRequirement = {
            reason,
            executionStatus: reason === "interrupted" ? "unknown_or_interrupted" : null,
          };
          if (pendingAction) {
            pendingAction.recoveryRequired = true;
            pendingAction.approved = false;
          }
          status = reason === "interrupted" ? "Interrupted" : "RecoveryRequired";
          break;
        }
        case "RECOVERY_COMPLETED":
          recoveryRequirement = null;
          if (pendingAction) pendingAction.recoveryRequired = false;
          status = "Active";
          break;
        case "SESSION_INTERRUPTED":
          status = "Interrupted";
          recoveryRequirement = { reason: "interrupted", executionStatus: "unknown_or_interrupted" };
          if (pendingAction) {
            pendingAction.recoveryRequired = true;
            pendingAction.approved = false;
          }
          break;
        case "SESSION_COMPLETED":
        case "DELIVERY_COMPLETED":
          status = "Completed";
          completedAt = entry.createdAt;
          pendingAction = null;
          recoveryRequirement = null;
          break;
        case "SESSION_FAILED":
          status = "Failed";
          completedAt = entry.createdAt;
          pendingAction = null;
          recoveryRequirement = null;
          break;
        case "SESSION_CANCELLED":
          status = "Cancelled";
          completedAt = entry.createdAt;
          pendingAction = null;
          recoveryRequirement = null;
          break;
        case "SESSION_LIMIT_REACHED":
          status = "LimitReached";
          completedAt = entry.createdAt;
          pendingAction = null;
          recoveryRequirement = null;
          break;
        case "SESSION_CREATED":
        case "TOOL_COMPLETED":
        case "AGENT_STATE_CHANGED":
          break;
      }
    }

    const lastEntry = entries.at(-1)!;
    return {
      status,
      lastEntry,
      pendingAction,
      recoveryRequirement,
      messageCount,
      toolCallCount,
      patchCount,
      commandCount,
      artifactCount,
      lastCommandResult,
      startedAt: entries[0].createdAt,
      updatedAt: lastEntry.createdAt,
      completedAt,
    };
  }
}

function proposed(entry: SessionEntry, kind: PendingActionProjection["kind"]): PendingActionProjection {
  const actionId = actionIdOf(entry);
  if (!actionId) throw new Error(`${entry.type} requires an actionId.`);
  return {
    kind,
    actionId,
    proposalEntryId: entry.id,
    payload: entry.payload,
    approved: false,
    recoveryRequired: false,
    stale: false,
  };
}

function requirePending(pending: PendingActionProjection | null, entry: SessionEntry): PendingActionProjection {
  if (!pending) throw new Error(`${entry.type} has no pending action.`);
  const actionId = actionIdOf(entry);
  if (actionId && actionId !== pending.actionId) throw new Error(`${entry.type} targets a different action.`);
  return pending;
}

function actionIdOf(entry: SessionEntry): string | null {
  if (typeof entry.safeMetadata.actionId === "string") return entry.safeMetadata.actionId;
  if (isRecord(entry.payload) && typeof entry.payload.actionId === "string") return entry.payload.actionId;
  return null;
}

function recoveryReason(payload: SafeJson): RecoveryRequirement["reason"] {
  if (isRecord(payload) && payload.reason === "patch_reapproval") return "patch_reapproval";
  if (isRecord(payload) && payload.reason === "command_reapproval") return "command_reapproval";
  return "interrupted";
}

function isRecord(value: SafeJson): value is Record<string, SafeJson> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
