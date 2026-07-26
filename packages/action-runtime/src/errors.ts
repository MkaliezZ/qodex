export type ActionRuntimeErrorCode =
  | "invalid_proposal"
  | "invalid_approval"
  | "invalid_decision"
  | "invalid_started"
  | "invalid_outcome"
  | "duplicate_action"
  | "action_not_found"
  | "invalid_transition"
  | "approval_mismatch"
  | "approval_expired"
  | "approval_generation_mismatch"
  | "decision_mismatch"
  | "duplicate_decision"
  | "unknown_action"
  | "dispatch_barrier_failed"
  | "duplicate_dispatch"
  | "duplicate_terminal_outcome";

export class ActionRuntimeError extends Error {
  constructor(
    readonly code: ActionRuntimeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ActionRuntimeError";
  }
}
