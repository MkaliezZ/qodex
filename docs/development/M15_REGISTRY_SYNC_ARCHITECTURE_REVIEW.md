# M15 — Registry & Sync Architecture Review

**Date:** 2026-06-13  
**Status:** Pre-Implementation Review  
**Source:** ADR-017 — Registry & Sync Runtime

---

## 1. Scope

### In M15 ✅

- RegistrySource management (add/remove/list registry URLs)
- RegistryEntry data model + JSON validation
- Sync engine (fetch index.json, compare, cache)
- Local cache (sources.json + cache.json + sync-state.json)
- Trust model (5 levels, blocked enforcement)
- Compatibility checking (qodex version ranges)
- Update detection (installed vs available)
- Search index (in-memory over cache)
- Graceful offline behavior
- Checksum validation on download planning

### Out of M15 ❌

- Desktop UI (deferred to M15.1)
- Real public registry server
- Publisher verification service
- Digital signature enforcement
- MCP/themes/workflows marketplace
- Auto-install after sync

---

## 2. Architecture Decision

### Selected: Extend marketplace-runtime (Option B)

```
packages/marketplace-runtime/src/registry/
├── registry.ts        # RegistryRuntime (public API)
├── source.ts          # RegistrySource CRUD + validation
├── sync.ts            # SyncEngine (fetch → validate → cache → compare)
├── cache.ts           # LocalRegistryCache (read/write/atomize)
├── trust.ts           # TrustModel (level checks, warnings)
├── entry.ts           # RegistryEntry schema + validation
├── search.ts          # SearchIndex (keyword match over cache)
└── events.ts          # Registry event types
```

**Rationale:** Registry concepts (discovery, install, update, versioning, storage) are already owned by marketplace-runtime. Adding registry as a module avoids a new package boundary.

---

## 3. RegistryRuntime API

```typescript
class RegistryRuntime {
  // Sources
  addSource(source: RegistrySource): void;
  removeSource(sourceId: string): void;
  listSources(): RegistrySource[];

  // Sync
  sync(sourceId?: string): Promise<SyncResult>;
  getSyncState(): Map<string, SyncState>;

  // Search
  search(query: string): RegistryEntry[];
  getEntry(entryId: string): RegistryEntry | null;
  getVersions(entryId: string): RegistryVersion[];

  // Updates
  checkUpdates(installed: InstalledRegistry[]): UpdateCandidate[];
  getUpdateCandidates(): UpdateCandidate[];

  // Trust
  getTrustInfo(entryId: string): TrustMetadata | null;
  isBlocked(entryId: string): boolean;

  // Cache
  exportCache(): object;
  importCache(data: object): void;
  clearCache(): void;

  // Events
  onSync(handler: (result: SyncResult) => void): () => void;
}
```

---

## 4. Sync Lifecycle

```
User triggers sync
    ↓
Fetch {source.url}/index.json (with timeout)
    ↓
Validate response against schema
    ↓
Compare entries with local cache
    ↓
  New entry → add to cache
  Updated → update cache
  Removed → mark deprecated
  Unchanged → skip
    ↓
Emit: registry.sync.completed
Persist cache atomically
```

Failures at any step → `registry.sync.failed` + preserve last good cache

---

## 5. Storage

```
~/.qodex/registry/
├── sources.json       # [{ RegistrySource }]
├── cache.json         # { entries: { [id]: RegistryEntry } }
└── sync-state.json    # { [sourceId]: { lastSync, entryCount, error? } }
```

- **Atomic writes:** Write to `.tmp` file, `rename()` to target
- **Corrupt cache recovery:** Delete cache file, start fresh
- **TTL:** 24 hours default

---

## 6. Trust Model

| Level | Install | Display |
|---|---|---|
| `local` | ✅ Allowed | (no badge) |
| `community` | ✅ Allowed | "Community" |
| `verified` | ✅ Allowed | "✓ Verified" |
| `official` | ✅ Allowed | "Official" |
| `blocked` | ❌ **Rejected** | "⚠ Blocked" |

`blocked` entries throw error on install attempt. All others allow install with appropriate UI warning.

---

## 7. Marketplace Integration

```
RegistryRuntime.checkUpdates()
    ↓
Returns UpdateCandidate[] → { id, installedVersion, availableVersion, trust }
    ↓
User approves from list
    ↓
MarketplaceRuntime.install() from resolved packageUrl
    ↓
SkillRuntime.loadSkill()
```

---

## 8. Test Strategy

| Suite | Tests |
|---|---|
| Source CRUD + validation | 6 |
| Entry schema validation | 8 |
| Sync fetch → validate → cache | 8 |
| Sync offline behavior | 4 |
| Cache read/write/atomize/corrupt | 6 |
| Update detection | 6 |
| Trust model (5 levels + blocked) | 6 |
| Compatibility checking | 4 |
| Search index | 4 |
| Checksum validation | 3 |
| Security (malformed JSON, XSS, traversal) | 6 |
| Integration (sync → cache → update detect) | 6 |
| **Total** | **~67** |

Mock registry source for all tests. No real network.

---

## 9. Desktop UI — Deferred

M15 implements runtime foundation. Desktop UI (search, badges, update flow) is M15.1.

| Phase | Scope |
|---|---|
| M15 | RegistryRuntime + tests |
| M15.1 | Desktop: search view, sync indicator, update badge, trust display, install from registry |

---

## 10. Risk Matrix

| Risk | Severity | Mitigation |
|---|---|---|
| Registry poisoning | 🔴 | Schema validation; trust model; no auto-install |
| Cache corruption | 🟡 | Atomic writes; auto-reset on read failure |
| Network failure during sync | 🟡 | Offline fallback; stale cache warning |
| Malicious packageUrl | 🔴 | HTTPS only; reject file:// and http:// |
| Checksum mismatch | 🔴 | Reject download; clear error |
| Sync replay attack | 🟢 | Timestamps in cache; stale TTL |

---

## 11. Recommendation

### ✅ READY FOR M15 IMPLEMENTATION

| Metric | Value |
|---|---|
| Architecture | Extend marketplace-runtime (module) |
| New package | ❌ No |
| Files to create | 8 (registry module) |
| Files to modify | ~2 (marketplace index.ts + package.json exports) |
| Tests | ~67 |
| Desktop UI | Deferred to M15.1 |
| Security risk | Medium (remote data) |
| Complexity | Medium |
| Blockers | None |

---

*Architecture Review — 2026-06-13*
