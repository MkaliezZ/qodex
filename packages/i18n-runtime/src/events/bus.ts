import type { I18nEvent, EventHandler } from "../models/events.js";
export class I18nEventBus {
  private handlers = new Set<EventHandler>();
  subscribe(h: EventHandler): () => void { this.handlers.add(h); return () => this.handlers.delete(h); }
  emit(e: I18nEvent): void { for (const h of this.handlers) { try { h(e); } catch { /* isolate */ } } }
  subscriberCount(): number { return this.handlers.size; }
}
