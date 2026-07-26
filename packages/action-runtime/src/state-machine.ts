import { ActionRuntimeError } from "./errors.js";
import type { ActionState } from "./types.js";

const TRANSITIONS: Readonly<Record<ActionState, readonly ActionState[]>> = {
  Proposed: ["AwaitingApproval", "Cancelled"],
  AwaitingApproval: ["Approved", "Cancelled"],
  Approved: ["Evaluating", "Cancelled"],
  Evaluating: ["Allowed", "Denied", "Held", "DecisionError", "Cancelled"],
  Allowed: ["Starting", "Cancelled"],
  Denied: [],
  Held: [],
  DecisionError: [],
  Starting: ["Running", "DecisionError", "Cancelled"],
  Running: ["Completed", "Failed", "Cancelled", "Interrupted"],
  Completed: [],
  Failed: [],
  Cancelled: [],
  Interrupted: [],
};

export function transitionActionState(current: ActionState, next: ActionState): ActionState {
  if (!TRANSITIONS[current].includes(next)) {
    throw new ActionRuntimeError(
      "invalid_transition",
      `Action state cannot transition from ${current} to ${next}.`,
    );
  }
  return next;
}

export function isTerminalActionState(state: ActionState): boolean {
  return TRANSITIONS[state].length === 0;
}
