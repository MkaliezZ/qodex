import { ActionRuntimeError } from "./errors.js";
import type { ActionHandler } from "./types.js";

export class ActionHandlerRegistry {
  private readonly handlers = new Map<string, ActionHandler>();

  register(actionType: string, handler: ActionHandler): void {
    if (!actionType || this.handlers.has(actionType)) {
      throw new ActionRuntimeError("unknown_action", "Action type registration is invalid or duplicated.");
    }
    this.handlers.set(actionType, handler);
  }

  resolve(actionType: string): ActionHandler | null {
    return this.handlers.get(actionType) ?? null;
  }
}
