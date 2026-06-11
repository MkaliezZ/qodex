/**
 * Qodex Agent Runtime — Task Types
 */

export enum TaskStatus {
  Idle = "Idle",
  Planning = "Planning",
  CallingModel = "CallingModel",
  Streaming = "Streaming",
  Done = "Done",
  Failed = "Failed",
  Cancelled = "Cancelled",
}

export interface AgentTask {
  id: string;
  sessionId: string;
  prompt: string;
  modelId: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  output: string;
}

/**
 * Valid state transitions for the task state machine.
 */
export const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.Idle]: [TaskStatus.Planning, TaskStatus.Failed, TaskStatus.Cancelled],
  [TaskStatus.Planning]: [TaskStatus.CallingModel, TaskStatus.Failed, TaskStatus.Cancelled],
  [TaskStatus.CallingModel]: [TaskStatus.Streaming, TaskStatus.Failed, TaskStatus.Cancelled],
  [TaskStatus.Streaming]: [TaskStatus.Done, TaskStatus.Failed, TaskStatus.Cancelled],
  [TaskStatus.Done]: [],
  [TaskStatus.Failed]: [],
  [TaskStatus.Cancelled]: [],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_TRANSITIONS[from]?.includes(to) ?? false;
}
