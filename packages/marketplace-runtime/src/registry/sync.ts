import type { RegistrySource, RegistryEntry, SyncResult, RegistryEvent } from "./events.js";
import { validateEntry } from "./entry.js";
import type { RegistryCache } from "./cache.js";

type FetchFn = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export class SyncEngine {
  private listeners: Array<(e: RegistryEvent) => void> = [];

  constructor(
    private cache: RegistryCache,
    private fetch: FetchFn = globalThis.fetch as FetchFn,
  ) {}

  onEvent(handler: (e: RegistryEvent) => void): () => void {
    this.listeners.push(handler);
    return () => { this.listeners = this.listeners.filter((l) => l !== handler); };
  }

  private emit(e: RegistryEvent): void { for (const l of this.listeners) { try { l(e); } catch { /* isolate */ } } }

  async sync(source: RegistrySource): Promise<SyncResult> {
    const result: SyncResult = { sourceId: source.id, newEntries: 0, updatedEntries: 0, removedEntries: 0, errors: [], timestamp: Date.now() };

    this.emit({ type: "registry.sync.started", payload: { sourceId: source.id }, timestamp: Date.now() });

    try {
      const res = await this.fetch(source.url);
      if (!res.ok) { result.errors.push(`HTTP ${res.status}`); this.emit({ type: "registry.sync.failed", payload: result, timestamp: Date.now() }); return result; }

      let body: unknown;
      try { body = await res.json(); } catch { result.errors.push("Invalid JSON"); this.emit({ type: "registry.sync.failed", payload: result, timestamp: Date.now() }); return result; }

      if (!body || typeof body !== "object" || !Array.isArray((body as Record<string, unknown>).entries)) {
        result.errors.push("Invalid registry format — expected { entries: [...] }");
        this.emit({ type: "registry.sync.failed", payload: result, timestamp: Date.now() });
        return result;
      }

      const entries = (body as Record<string, unknown>).entries as unknown[];
      const oldIds = new Set(Object.keys(this.cache.getEntries()));

      for (const e of entries) {
        const v = validateEntry(e);
        if (!v.valid) { result.errors.push(`Invalid entry: ${v.errors.join(", ")}`); continue; }
        const entry = e as RegistryEntry;

        if (oldIds.has(entry.id)) {
          oldIds.delete(entry.id);
          const existing = this.cache.getEntry(entry.id);
          if (!existing || existing.latestVersion !== entry.latestVersion) {
            this.cache.setEntry(entry.id, entry);
            result.updatedEntries++;
          }
        } else {
          this.cache.setEntry(entry.id, entry);
          result.newEntries++;
        }
      }

      // Remaining oldIds are removed from source
      for (const removed of oldIds) {
        this.cache.removeEntry(removed);
        result.removedEntries++;
      }

      this.cache.save?.();
      this.cache.saveSyncState?.(source.id, { sourceId: source.id, lastSyncAt: Date.now(), entryCount: Object.keys(this.cache.getEntries()).length });
      this.emit({ type: "registry.sync.completed", payload: result, timestamp: Date.now() });
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : "Unknown error");
      this.emit({ type: "registry.sync.failed", payload: result, timestamp: Date.now() });
    }

    return result;
  }
}
