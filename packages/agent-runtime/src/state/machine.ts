/**
 * Qodex Agent Runtime — Task State Machine
 *
 * Encapsulates state transition logic for agent tasks.
 */

import { TaskStatus, canTransition } from "../types/task.js";

export class TaskStateMachine {
  private currentStatus: TaskStatus;

  constructor(initialStatus: TaskStatus = TaskStatus.Idle) {
    this.currentStatus = initialStatus;
  }

  get status(): TaskStatus {
    return this.currentStatus;
  }

  /**
   * Attempt a transition to the new status.
   * Returns true on success, throws on invalid transition.
   */
  transition(to: TaskStatus): boolean {
    if (!canTransition(this.currentStatus, to)) {
      throw new Error(
        `Invalid state transition: ${this.currentStatus} → ${to}`,
      );
    }
    this.currentStatus = to;
    return true;
  }

  /**
   * Attempt a transition, returning false instead of throwing.
   */
  tryTransition(to: TaskStatus): boolean {
    if (!canTransition(this.currentStatus, to)) return false;
    this.currentStatus = to;
    return true;
  }

  isTerminal(): boolean {
    return (
      this.currentStatus === TaskStatus.Done ||
      this.currentStatus === TaskStatus.Failed ||
      this.currentStatus === TaskStatus.Cancelled
    );
  }

  reset(status: TaskStatus = TaskStatus.Idle): void {
    this.currentStatus = status;
  }
}
