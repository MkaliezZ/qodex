import type { AgentTimelineEntry } from "@qodex/agent-runtime";
import type { SessionEntry } from "@qodex/session-runtime";

export function sessionEntriesToTimeline(entries: SessionEntry[]): AgentTimelineEntry[] {
  return entries
    .filter((entry) => entry.type !== "SESSION_CREATED" && entry.type !== "AGENT_STATE_CHANGED")
    .map((entry) => ({
      id: entry.id,
      kind: timelineKind(entry.type),
      title: timelineTitle(entry.type),
      status: timelineStatus(entry.type, entry.payload),
      summary: timelineSummary(entry),
      timestamp: entry.createdAt,
      toolCallId: entry.safeMetadata.toolCallId,
      actionId: entry.safeMetadata.actionId,
    }));
}

function timelineKind(type: SessionEntry["type"]): AgentTimelineEntry["kind"] {
  if (type === "MODEL_MESSAGE") return "model";
  if (type === "TOOL_REQUESTED") return "tool_request";
  if (type === "TOOL_COMPLETED") return "tool_result";
  if (type === "PATCH_PROPOSED") return "patch_proposal";
  if (type.startsWith("PATCH_")) return "patch_approval";
  if (type === "COMMAND_PROPOSED" || type === "COMMAND_APPROVED" || type === "COMMAND_DENIED") return "command_approval";
  if (type === "COMMAND_STARTED" || type === "COMMAND_COMPLETED") return "command_output";
  if (type === "SESSION_COMPLETED" || type === "DELIVERY_COMPLETED") return "final";
  if (type === "SESSION_LIMIT_REACHED") return "limit";
  return "failure";
}

function timelineTitle(type: SessionEntry["type"]): string {
  return type.toLowerCase().split("_").map((part: string) => part[0].toUpperCase() + part.slice(1)).join(" ");
}

function timelineStatus(type: SessionEntry["type"], payload: SessionEntry["payload"]): AgentTimelineEntry["status"] {
  if (type.endsWith("PROPOSED") || type === "RECOVERY_REQUIRED") return "pending";
  if (type.endsWith("STARTED") || type === "SESSION_INTERRUPTED") return "running";
  if (type.endsWith("DENIED") || type.endsWith("REJECTED")) return "denied";
  if (type === "SESSION_CANCELLED") return "cancelled";
  if (type.endsWith("FAILED") || type === "SESSION_LIMIT_REACHED") return "error";
  if (isRecord(payload) && payload.status === "error") return "error";
  return "success";
}

function timelineSummary(entry: SessionEntry): string {
  const payload = entry.payload;
  if (isRecord(payload)) {
    for (const key of ["summary", "reason", "text", "label", "status"]) {
      if (typeof payload[key] === "string") return payload[key];
    }
    if (typeof payload.name === "string") return payload.name;
  }
  return entry.type.replace(/_/g, " ").toLowerCase();
}

function isRecord(value: SessionEntry["payload"]): value is Record<string, SessionEntry["payload"]> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
