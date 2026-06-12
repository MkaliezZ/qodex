import { validateCache } from "./entry.js";
import type { RegistryEntry, SyncState } from "./events.js";

export interface CacheStore { entries: Record<string, RegistryEntry>; updatedAt: number; }

export interface RegistryCache {
  getEntries(): Record<string, RegistryEntry>;
  getEntry(id: string): RegistryEntry | undefined;
  setEntry(id: string, entry: RegistryEntry): void;
  removeEntry(id: string): void;
  exportCache(): CacheStore;
  importCache(data: unknown): void;
  clear(): void;
  save?(): void;
  loadSyncState?(sourceId: string): SyncState | null;
  saveSyncState?(sourceId: string, state: SyncState): void;
}

/** Browser-safe in-memory cache — no filesystem dependencies. */
export class MemoryRegistryCache implements RegistryCache {
  private cache: CacheStore = { entries: {}, updatedAt: 0 };
  private syncStates = new Map<string, SyncState>();

  getEntries(): Record<string, RegistryEntry> { return this.cache.entries; }
  getEntry(id: string): RegistryEntry | undefined { return this.cache.entries[id]; }
  setEntry(id: string, entry: RegistryEntry): void { this.cache.entries[id] = entry; }
  removeEntry(id: string): void { delete this.cache.entries[id]; }

  exportCache(): CacheStore {
    return JSON.parse(JSON.stringify({ entries: this.cache.entries, updatedAt: this.cache.updatedAt }));
  }

  importCache(data: unknown): void {
    const v = validateCache(data);
    if (!v.valid) throw new Error(`Invalid cache data: ${v.errors.join(", ")}`);
    this.cache = (data as CacheStore);
  }

  clear(): void { this.cache = { entries: {}, updatedAt: 0 }; this.syncStates.clear(); }

  loadSyncState(sourceId: string): SyncState | null { return this.syncStates.get(sourceId) ?? null; }
  saveSyncState(sourceId: string, state: SyncState): void { this.syncStates.set(sourceId, state); }
}
