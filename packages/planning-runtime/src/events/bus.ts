/**
 * Planning Event Bus — framework-agnostic typed event system
 */

import type { PlanningEvent, EventHandler } from "../models/events.js";

export class PlanningEventBus {
  private handlers: Set<EventHandler> = new Set();
  private history: PlanningEvent[] = [];
  private maxHistory = 1000;

  subscribe(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  emit(event: PlanningEvent): void {
    this.history.push(event);
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch {
        // Handler errors must not break the bus
      }
    }
  }

  getHistory(): PlanningEvent[] {
    return [...this.history];
  }

  clearHistory(): void {
    this.history = [];
  }

  subscriberCount(): number {
    return this.handlers.size;
  }
}
