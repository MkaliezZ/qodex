import { writeFileSync, readFileSync, mkdirSync, existsSync, renameSync, unlinkSync } from "fs";
import { validateCache } from "./entry.js";
import type { RegistryEntry, SyncState } from "./events.js";

export interface CacheStore { entries: Record<string, RegistryEntry>; updatedAt: number; }

export class LocalRegistryCache {
  private storageRoot: string;
  private cache: CacheStore = { entries: {}, updatedAt: 0 };

  constructor(storageRoot?: string) {
    this.storageRoot = storageRoot ?? `${process.env.HOME || "/tmp"}/.qodex/registry`;
  }

  private path(filename: string): string { return `${this.storageRoot}/${filename}`; }

  load(): void {
    mkdirSync(this.storageRoot, { recursive: true });
    const p = this.path("cache.json");
    if (!existsSync(p)) return;
    try {
      const raw = readFileSync(p, "utf-8");
      const parsed = JSON.parse(raw);
      const v = validateCache(parsed);
      if (!v.valid) throw new Error("Invalid cache");
      this.cache = parsed as CacheStore;
    } catch { this.cache = { entries: {}, updatedAt: 0 }; }
  }

  save(): void {
    mkdirSync(this.storageRoot, { recursive: true });
    const tmp = this.path("cache.json.tmp");
    const target = this.path("cache.json");
    try {
      writeFileSync(tmp, JSON.stringify({ entries: this.cache.entries, updatedAt: Date.now() }));
      renameSync(tmp, target);
    } catch { try { unlinkSync(tmp); } catch { /* cleanup */ } }
  }

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
    this.save();
  }

  clear(): void { this.cache = { entries: {}, updatedAt: 0 }; try { const p = this.path("cache.json"); if (existsSync(p)) unlinkSync(p); } catch { /* cleanup */ } }

  loadSyncState(sourceId: string): SyncState | null {
    const p = this.path("sync-state.json");
    if (!existsSync(p)) return null;
    try {
      const data = JSON.parse(readFileSync(p, "utf-8"));
      return data[sourceId] ?? null;
    } catch { return null; }
  }

  saveSyncState(sourceId: string, state: SyncState): void {
    mkdirSync(this.storageRoot, { recursive: true });
    const p = this.path("sync-state.json");
    let data: Record<string, SyncState> = {};
    try { if (existsSync(p)) data = JSON.parse(readFileSync(p, "utf-8")); } catch { /* reset */ }
    data[sourceId] = state;
    writeFileSync(p, JSON.stringify(data));
  }
}
