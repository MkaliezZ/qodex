/**
 * Qodex Agent Runtime — Event Types
 *
 * All runtime communication flows through events.
 * The UI subscribes to events to render state changes.
 */

import type { AgentTask } from "./task.js";

export type AgentEventType =
  | "task.started"
  | "task.status_changed"
  | "message.chunk"
  | "task.completed"
  | "task.failed"
  | "task.cancelled"
  | "patch.proposed"
  | "patch.applied"
  | "patch.rejected";

export interface AgentEvent {
  type: AgentEventType;
  taskId: string;
  sessionId: string;
  timestamp: string;
  payload?: unknown;
}

export interface TaskStartedEvent extends AgentEvent {
  type: "task.started";
  payload: { task: AgentTask };
}

export interface TaskStatusChangedEvent extends AgentEvent {
  type: "task.status_changed";
  payload: { status: string; previousStatus: string };
}

export interface MessageChunkEvent extends AgentEvent {
  type: "message.chunk";
  payload: { text: string };
}

export interface TaskCompletedEvent extends AgentEvent {
  type: "task.completed";
  payload: { task: AgentTask };
}

export interface TaskFailedEvent extends AgentEvent {
  type: "task.failed";
  payload: { error: string };
}

export interface TaskCancelledEvent extends AgentEvent {
  type: "task.cancelled";
  payload: { task: AgentTask };
}

export interface PatchProposedEvent extends AgentEvent {
  type: "patch.proposed";
  payload: { proposalId: string; summary: string; fileCount: number; diffText: string };
}

export interface PatchAppliedEvent extends AgentEvent {
  type: "patch.applied";
  payload: { proposalId: string; path: string };
}

export interface PatchRejectedEvent extends AgentEvent {
  type: "patch.rejected";
  payload: { proposalId: string };
}

export type AnyAgentEvent =
  | TaskStartedEvent
  | TaskStatusChangedEvent
  | MessageChunkEvent
  | TaskCompletedEvent
  | TaskFailedEvent
  | TaskCancelledEvent
  | PatchProposedEvent
  | PatchAppliedEvent
  | PatchRejectedEvent;

export type EventHandler = (event: AnyAgentEvent) => void;
