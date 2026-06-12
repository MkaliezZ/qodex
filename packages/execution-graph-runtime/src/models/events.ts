/**
 * Graph event model — framework-agnostic typed events
 */

import type { GraphLifecycleStatus, NodeStatus } from "./graph.js";

export type GraphEventType =
  | "graph.created"
  | "graph.validated"
  | "graph.started"
  | "graph.completed"
  | "graph.failed"
  | "graph.cancelled"
  | "graph.archived"
  | "graph.replayed"
  | "node.dispatched"
  | "node.result"
  | "history.created"
  | "replay.requested"
  | "replay.completed";

export interface GraphCreatedEvent {
  type: "graph.created"; graphId: string; planId: string; timestamp: number;
}
export interface GraphValidatedEvent {
  type: "graph.validated"; graphId: string; valid: boolean; timestamp: number;
}
export interface GraphStartedEvent {
  type: "graph.started"; graphId: string; timestamp: number;
}
export interface GraphCompletedEvent {
  type: "graph.completed"; graphId: string; timestamp: number;
}
export interface GraphFailedEvent {
  type: "graph.failed"; graphId: string; reason: string; timestamp: number;
}
export interface GraphCancelledEvent {
  type: "graph.cancelled"; graphId: string; timestamp: number;
}
export interface GraphArchivedEvent {
  type: "graph.archived"; graphId: string; archiveId: string; timestamp: number;
}
export interface GraphReplayedEvent {
  type: "graph.replayed"; graphId: string; replayType: string; timestamp: number;
}
export interface NodeDispatchedEvent {
  type: "node.dispatched"; graphId: string; nodeId: string; timestamp: number;
}
export interface NodeResultEvent {
  type: "node.result"; graphId: string; nodeId: string; status: NodeStatus; timestamp: number;
}
export interface HistoryCreatedEvent {
  type: "history.created"; archiveId: string; recordCount: number; timestamp: number;
}
export interface ReplayRequestedEvent {
  type: "replay.requested"; archiveId: string; replayType: string; timestamp: number;
}
export interface ReplayCompletedEvent {
  type: "replay.completed"; archiveId: string; eventCount: number; timestamp: number;
}

export type GraphEvent =
  | GraphCreatedEvent | GraphValidatedEvent | GraphStartedEvent
  | GraphCompletedEvent | GraphFailedEvent | GraphCancelledEvent
  | GraphArchivedEvent | GraphReplayedEvent | NodeDispatchedEvent
  | NodeResultEvent | HistoryCreatedEvent | ReplayRequestedEvent
  | ReplayCompletedEvent;

export type EventHandler = (event: GraphEvent) => void;
