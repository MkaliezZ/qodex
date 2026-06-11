import type { GitEvent } from "../models/repository.js";

export type EventHandler = (event: GitEvent) => void;

export class GitEventBus {
  private handlers = new Set<EventHandler>();

  subscribe(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  publish(type: GitEvent["type"], payload: Record<string, unknown>): void {
    const event: GitEvent = { type, payload, timestamp: new Date().toISOString() };
    for (const h of this.handlers) {
      try { h(event); } catch { /* swallow */ }
    }
  }

  clear(): void { this.handlers.clear(); }
  get size(): number { return this.handlers.size; }
}
