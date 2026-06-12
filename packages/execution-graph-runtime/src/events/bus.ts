import type { GraphEvent, EventHandler } from "../models/events.js";

export class GraphEventBus {
  private handlers = new Set<EventHandler>();
  private history: GraphEvent[] = [];
  private maxHistory = 1000;

  subscribe(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  emit(event: GraphEvent): void {
    this.history.push(event);
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }
    for (const h of this.handlers) {
      try { h(event); } catch { /* isolate */ }
    }
  }

  getHistory(): GraphEvent[] { return [...this.history]; }
  clearHistory(): void { this.history = []; }
  subscriberCount(): number { return this.handlers.size; }
}
