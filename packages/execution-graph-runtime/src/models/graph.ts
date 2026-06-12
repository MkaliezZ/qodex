/**
 * Graph lifecycle model — statuses and node state
 */

export type NodeType =
  | "goal" | "plan" | "task" | "review" | "diff"
  | "checkpoint" | "approval" | "tool" | "report";

export type NodeStatus =
  | "pending" | "ready" | "running" | "blocked"
  | "completed" | "failed" | "cancelled";

export type GraphLifecycleStatus =
  | "created" | "validated" | "ready" | "running"
  | "completed" | "failed" | "cancelled" | "archived";

export interface ExecutionNode {
  id: string;
  type: NodeType;
  status: NodeStatus;
  description: string;
  dependencies: string[];
  dependents: string[];
  result?: unknown;
  startedAt?: number;
  completedAt?: number;
  retryCount: number;
  maxRetries: number;
}

export interface ExecutionEdge {
  id: string;
  from: string;
  to: string;
  type: "depends_on" | "produces_for" | "reports_to";
}

export const LEGAL_TRANSITIONS: Record<GraphLifecycleStatus, GraphLifecycleStatus[]> = {
  created: ["validated", "failed"],
  validated: ["ready", "failed"],
  ready: ["running", "cancelled"],
  running: ["completed", "failed", "cancelled"],
  completed: ["archived"],
  failed: ["archived"],
  cancelled: ["archived"],
  archived: [],
};
