import type { AgentEvent } from "../models/agent.js";

type Handler = (event: AgentEvent) => void;

export class AgentEventBus {
  private handlers = new Set<Handler>();

  subscribe(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  publish(type: AgentEvent["type"], payload: Record<string, unknown>): void {
    const event: AgentEvent = { type, payload, timestamp: new Date().toISOString() };
    for (const h of this.handlers) { try { h(event); } catch { /* swallow */ } }
  }

  clear(): void { this.handlers.clear(); }
  get size(): number { return this.handlers.size; }
}
