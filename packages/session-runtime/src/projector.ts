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
    const approvalIds = new Set<string>();
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
          requireNoPending(pendingAction, entry);
          pendingAction = proposed(entry, "action");
          break;
        case "PATCH_PROPOSED":
          requireNoPending(pendingAction, entry);
          patchCount += 1;
          pendingAction = proposed(entry, "patch");
          break;
        case "COMMAND_PROPOSED":
          requireNoPending(pendingAction, entry);
          commandCount += 1;
          pendingAction = proposed(entry, "command");
          break;
        case "ACTION_APPROVED":
        case "PATCH_APPROVED":
        case "COMMAND_APPROVED": {
          pendingAction = requirePending(pendingAction, entry);
          requireKind(pendingAction, entry);
          if (pendingAction.started || pendingAction.settled) {
            throw new Error("A started or settled action cannot be approved.");
          }
          if (pendingAction.approved) throw new Error("An action cannot be approved twice.");
          const approvalId = approvalIdOf(entry);
          if (!approvalId) throw new Error(`${entry.type} requires an approvalId.`);
          if (approvalIds.has(approvalId)) throw new Error("An approval ID cannot be reused.");
          const generation = approvalGenerationOf(entry);
          if (generation === null) throw new Error(`${entry.type} requires an approvalGeneration.`);
          if (pendingAction.recoveryRequired && generation !== pendingAction.approvalGeneration) {
            throw new Error("Restart reapproval requires the current approval generation.");
          }
          if (!pendingAction.recoveryRequired && generation !== pendingAction.approvalGeneration) {
            throw new Error("Approval generation does not match the pending action.");
          }
          approvalIds.add(approvalId);
          pendingAction.approved = true;
          pendingAction.approvalId = approvalId;
          pendingAction.recoveryRequired = false;
          recoveryRequirement = null;
          status = "Active";
          break;
        }
        case "ACTION_DENIED":
        case "PATCH_REJECTED":
        case "COMMAND_DENIED": {
          const denied = requirePending(pendingAction, entry);
          requireKind(denied, entry);
          if (denied.started || denied.settled) throw new Error("A started or settled action cannot be denied.");
          denied.settled = true;
          pendingAction = null;
          recoveryRequirement = null;
          break;
        }
        case "ACTION_STARTED":
        case "PATCH_STARTED":
        case "COMMAND_STARTED": {
          pendingAction = requirePending(pendingAction, entry);
          requireKind(pendingAction, entry);
          if (!pendingAction.approved) throw new Error("An action cannot start without approval.");
          if (pendingAction.started) throw new Error("An action cannot start twice.");
          if (pendingAction.settled) throw new Error("A settled action cannot start.");
          const startApprovalId = approvalIdOf(entry);
          if (!startApprovalId) throw new Error(`${entry.type} requires an approvalId.`);
          if (startApprovalId !== pendingAction.approvalId) {
            throw new Error("Started evidence targets a different approval.");
          }
          const startGeneration = approvalGenerationOf(entry);
          if (startGeneration === null) throw new Error(`${entry.type} requires an approvalGeneration.`);
          if (startGeneration !== pendingAction.approvalGeneration) {
            throw new Error("Started evidence targets a different approval generation.");
          }
          const executionReceiptId = executionReceiptIdOf(entry);
          if (!executionReceiptId) throw new Error(`${entry.type} requires an executionReceiptId.`);
          pendingAction.started = true;
          pendingAction.executionReceiptId = executionReceiptId;
          break;
        }
        case "ACTION_COMPLETED":
        case "PATCH_APPLIED": {
          const completed = requirePending(pendingAction, entry);
          requireKind(completed, entry);
          requireStarted(completed, entry);
          completed.settled = true;
          pendingAction = null;
          recoveryRequirement = null;
          break;
        }
        case "COMMAND_COMPLETED": {
          const completed = requirePending(pendingAction, entry);
          requireKind(completed, entry);
          requireStarted(completed, entry);
          completed.settled = true;
          lastCommandResult = entry.payload;
          pendingAction = null;
          recoveryRequirement = null;
          break;
        }
        case "ACTION_FAILED": {
          const failed = requirePending(pendingAction, entry);
          requireStarted(failed, entry);
          failed.settled = true;
          pendingAction = null;
          break;
        }
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
            if (reason !== "interrupted") {
              requireRecoveryKind(pendingAction, reason);
              if (pendingAction.started || pendingAction.settled) {
                throw new Error("A started or settled action cannot become reapprovable.");
              }
              pendingAction.approvalGeneration += 1;
              const generation = approvalGenerationOf(entry);
              if (generation === null) throw new Error("RECOVERY_REQUIRED requires an approvalGeneration.");
              if (generation !== pendingAction.approvalGeneration) {
                throw new Error("Recovery generation does not match the pending action.");
              }
            }
            pendingAction.recoveryRequired = true;
            pendingAction.approved = false;
            pendingAction.approvalId = null;
          }
          status = reason === "interrupted" ? "Interrupted" : "RecoveryRequired";
          break;
        }
        case "RECOVERY_COMPLETED":
          if (pendingAction) throw new Error("Recovery cannot complete while an action remains pending.");
          recoveryRequirement = null;
          status = "Active";
          break;
        case "SESSION_INTERRUPTED":
          status = "Interrupted";
          recoveryRequirement = { reason: "interrupted", executionStatus: "unknown_or_interrupted" };
          if (pendingAction) {
            pendingAction.recoveryRequired = true;
            pendingAction.approved = false;
            pendingAction.approvalId = null;
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
    started: false,
    settled: false,
    approvalId: null,
    approvalGeneration: 0,
    executionReceiptId: null,
    recoveryRequired: false,
    stale: false,
  };
}

function requireNoPending(pending: PendingActionProjection | null, entry: SessionEntry): void {
  if (pending) throw new Error(`${entry.type} cannot replace an unsettled action.`);
}

function requirePending(pending: PendingActionProjection | null, entry: SessionEntry): PendingActionProjection {
  if (!pending) throw new Error(`${entry.type} has no pending action.`);
  const actionId = actionIdOf(entry);
  if (!actionId) throw new Error(`${entry.type} requires an actionId.`);
  if (actionId !== pending.actionId) throw new Error(`${entry.type} targets a different action.`);
  return pending;
}

function actionIdOf(entry: SessionEntry): string | null {
  if (typeof entry.safeMetadata.actionId === "string") return entry.safeMetadata.actionId;
  if (isRecord(entry.payload) && typeof entry.payload.actionId === "string") return entry.payload.actionId;
  return null;
}

function approvalIdOf(entry: SessionEntry): string | null {
  return typeof entry.safeMetadata.approvalId === "string" && entry.safeMetadata.approvalId.trim()
    ? entry.safeMetadata.approvalId
    : null;
}

function approvalGenerationOf(entry: SessionEntry): number | null {
  return typeof entry.safeMetadata.approvalGeneration === "number"
    && Number.isInteger(entry.safeMetadata.approvalGeneration)
    && entry.safeMetadata.approvalGeneration >= 0
    ? entry.safeMetadata.approvalGeneration
    : null;
}

function executionReceiptIdOf(entry: SessionEntry): string | null {
  return typeof entry.safeMetadata.executionReceiptId === "string"
    && entry.safeMetadata.executionReceiptId.trim()
    ? entry.safeMetadata.executionReceiptId
    : null;
}

function requireKind(pending: PendingActionProjection, entry: SessionEntry): void {
  const expected = entryKind(entry.type);
  if (expected && pending.kind !== expected) {
    throw new Error(`${entry.type} targets a different action kind.`);
  }
}

function requireStarted(pending: PendingActionProjection, entry: SessionEntry): void {
  if (!pending.approved) throw new Error(`${entry.type} requires approval.`);
  if (!pending.started) throw new Error(`${entry.type} requires started evidence.`);
  if (pending.settled) throw new Error("An action cannot settle twice.");
  const approvalId = approvalIdOf(entry);
  if (!approvalId) throw new Error(`${entry.type} requires an approvalId.`);
  if (approvalId !== pending.approvalId) {
    throw new Error(`${entry.type} targets a different approval.`);
  }
  const generation = approvalGenerationOf(entry);
  if (generation === null) throw new Error(`${entry.type} requires an approvalGeneration.`);
  if (generation !== pending.approvalGeneration) {
    throw new Error(`${entry.type} targets a different approval generation.`);
  }
  const executionReceiptId = executionReceiptIdOf(entry);
  if (!executionReceiptId) throw new Error(`${entry.type} requires an executionReceiptId.`);
  if (executionReceiptId !== pending.executionReceiptId) {
    throw new Error(`${entry.type} targets a different execution receipt.`);
  }
}

function requireRecoveryKind(
  pending: PendingActionProjection,
  reason: RecoveryRequirement["reason"],
): void {
  if (reason === "patch_reapproval" && pending.kind !== "patch") {
    throw new Error("Patch recovery requires a pending patch.");
  }
  if (reason === "command_reapproval" && pending.kind !== "command") {
    throw new Error("Command recovery requires a pending command.");
  }
}

function entryKind(type: SessionEntry["type"]): PendingActionProjection["kind"] | null {
  if (type.startsWith("PATCH_")) return "patch";
  if (type.startsWith("COMMAND_")) return "command";
  if (type.startsWith("ACTION_")) return "action";
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
