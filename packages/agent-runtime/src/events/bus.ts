/**
 * Qodex Agent Runtime — Lightweight Event Bus
 *
 * All runtime-to-UI communication flows through this bus.
 * The UI subscribes once; the runtime publishes events as state changes.
 */

import type { AnyAgentEvent, EventHandler } from "../types/event.js";

export interface Subscription {
  id: string;
  handler: EventHandler;
  type: string;
}

export class EventBus {
  private subsById = new Map<string, Subscription>();
  private subsByType = new Map<string, Set<string>>();
  private subCounter = 0;

  /** Subscribe to an event type (or "*" for all events) */
  subscribe(type: string, handler: EventHandler): () => void {
    const id = `sub_${++this.subCounter}`;
    this.subsById.set(id, { id, handler, type });
    if (!this.subsByType.has(type)) {
      this.subsByType.set(type, new Set());
    }
    this.subsByType.get(type)!.add(id);

    // Return unsubscribe function
    return () => this.removeSub(id);
  }

  /** Subscribe to all event types */
  subscribeAll(handler: EventHandler): () => void {
    return this.subscribe("*", handler);
  }

  /** Remove a subscription by id */
  private removeSub(id: string): void {
    const sub = this.subsById.get(id);
    if (!sub) return;
    this.subsById.delete(id);
    this.subsByType.get(sub.type)?.delete(id);
  }

  /** Unsubscribe a specific handler from a type */
  unsubscribe(type: string, handler: EventHandler): void {
    const ids = this.subsByType.get(type);
    if (!ids) return;
    for (const id of ids) {
      const sub = this.subsById.get(id);
      if (sub && sub.handler === handler) {
        this.removeSub(id);
        return;
      }
    }
  }

  /** Publish an event to all matching subscribers */
  publish(event: AnyAgentEvent): void {
    const notify = (id: string) => {
      const sub = this.subsById.get(id);
      if (!sub) return;
      try {
        sub.handler(event);
      } catch {
        // Swallow handler errors to keep the bus alive
      }
    };

    this.subsByType.get(event.type)?.forEach(notify);
    this.subsByType.get("*")?.forEach(notify);
  }

  /** Remove all subscribers */
  clear(): void {
    this.subsById.clear();
    this.subsByType.clear();
  }

  /** Number of active subscriptions */
  get size(): number {
    return this.subsById.size;
  }
}
