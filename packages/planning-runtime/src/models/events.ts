/**
 * Planning event model — framework-agnostic typed events
 */

import type { Plan } from "./plan.js";
import type { ExecutionGraphSerialized, NodeStatus } from "./graph.js";

export type PlanningEventType =
  | "plan.created"
  | "plan.updated"
  | "graph.created"
  | "node.ready"
  | "node.started"
  | "node.completed"
  | "node.failed"
  | "node.blocked"
  | "replan.requested"
  | "replan.completed"
  | "report.generated";

export interface PlanCreatedEvent {
  type: "plan.created";
  plan: Plan;
  timestamp: number;
}

export interface PlanUpdatedEvent {
  type: "plan.updated";
  planId: string;
  changes: string[];
  timestamp: number;
}

export interface GraphCreatedEvent {
  type: "graph.created";
  graph: ExecutionGraphSerialized;
  timestamp: number;
}

export interface NodeReadyEvent {
  type: "node.ready";
  nodeId: string;
  graphId: string;
  timestamp: number;
}

export interface NodeStartedEvent {
  type: "node.started";
  nodeId: string;
  graphId: string;
  timestamp: number;
}

export interface NodeCompletedEvent {
  type: "node.completed";
  nodeId: string;
  graphId: string;
  result?: unknown;
  timestamp: number;
}

export interface NodeFailedEvent {
  type: "node.failed";
  nodeId: string;
  graphId: string;
  error: string;
  retryCount: number;
  timestamp: number;
}

export interface NodeBlockedEvent {
  type: "node.blocked";
  nodeId: string;
  graphId: string;
  reason: string;
  timestamp: number;
}

export interface ReplanRequestedEvent {
  type: "replan.requested";
  graphId: string;
  reason: string;
  timestamp: number;
}

export interface ReplanCompletedEvent {
  type: "replan.completed";
  graphId: string;
  newGraphId: string;
  timestamp: number;
}

export interface ReportGeneratedEvent {
  type: "report.generated";
  graphId: string;
  summary: string;
  nodeStatuses: Array<{ nodeId: string; status: NodeStatus }>;
  timestamp: number;
}

export type PlanningEvent =
  | PlanCreatedEvent
  | PlanUpdatedEvent
  | GraphCreatedEvent
  | NodeReadyEvent
  | NodeStartedEvent
  | NodeCompletedEvent
  | NodeFailedEvent
  | NodeBlockedEvent
  | ReplanRequestedEvent
  | ReplanCompletedEvent
  | ReportGeneratedEvent;

export type EventHandler = (event: PlanningEvent) => void;
