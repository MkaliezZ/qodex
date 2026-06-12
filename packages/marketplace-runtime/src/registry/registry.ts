import type { RegistrySource, RegistryEntry, RegistryVersion, SyncResult, RegistryEvent, UpdateCandidate } from "./events.js";
import { SourceManager } from "./source.js";
import { SyncEngine } from "./sync.js";
import { LocalRegistryCache } from "./cache.js";
import { SearchIndex } from "./search.js";
import { evaluateTrust, isBlocked } from "./trust.js";

export class RegistryRuntime {
  private sources = new SourceManager();
  private cache: LocalRegistryCache;
  private syncEngine: SyncEngine;
  private searchIndex: SearchIndex;

  constructor(storageRoot?: string) {
    this.cache = new LocalRegistryCache(storageRoot);
    this.cache.load();
    this.syncEngine = new SyncEngine(this.cache);
    this.searchIndex = new SearchIndex(() => Object.values(this.cache.getEntries()));
  }

  // ── Sources ──────────────────────────────────
  addSource(source: RegistrySource): void { this.sources.add(source); }
  removeSource(sourceId: string): boolean { return this.sources.remove(sourceId); }
  listSources(): RegistrySource[] { return this.sources.list(); }

  // ── Sync ─────────────────────────────────────
  async sync(sourceId?: string): Promise<SyncResult[]> {
    const targets = sourceId ? [this.sources.get(sourceId)].filter(Boolean) as RegistrySource[] : this.sources.listEnabled();
    const results: SyncResult[] = [];
    for (const s of targets) {
      results.push(await this.syncEngine.sync(s));
    }
    return results;
  }

  // ── Search ───────────────────────────────────
  search(query: string): RegistryEntry[] { return this.searchIndex.search(query); }
  getEntry(entryId: string): RegistryEntry | null { return this.cache.getEntry(entryId) ?? null; }
  getVersions(entryId: string): RegistryVersion[] { return this.cache.getEntry(entryId)?.versions ?? []; }

  // ── Updates ──────────────────────────────────
  checkUpdates(installed: Array<{ id: string; version: string }>): UpdateCandidate[] {
    return installed
      .filter((i) => {
        const entry = this.cache.getEntry(i.id);
        return entry && entry.latestVersion !== i.version && !isBlocked(entry.trust);
      })
      .map((i) => {
        const entry = this.cache.getEntry(i.id)!;
        return { id: i.id, installedVersion: i.version, availableVersion: entry.latestVersion, trust: entry.trust?.level ?? "community", deprecated: entry.versions.find((v) => v.version === entry.latestVersion)?.deprecated };
      });
  }

  // ── Trust ────────────────────────────────────
  getTrustInfo(entryId: string) { return this.cache.getEntry(entryId)?.trust ?? null; }
  isBlocked(entryId: string): boolean { return isBlocked(this.cache.getEntry(entryId)?.trust); }

  // ── Cache ────────────────────────────────────
  exportCache() { return this.cache.exportCache(); }
  importCache(data: unknown): void { this.cache.importCache(data); }
  clearCache(): void { this.cache.clear(); }

  // ── Events ───────────────────────────────────
  onEvent(handler: (e: RegistryEvent) => void): () => void { return this.syncEngine.onEvent(handler); }
}
