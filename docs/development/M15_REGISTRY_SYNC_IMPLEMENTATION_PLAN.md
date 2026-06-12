# M15 — Registry & Sync Implementation Plan

**Date:** 2026-06-13  
**Status:** Pre-Implementation  
**Depends On:** ADR-017, M15 Architecture Review

---

## 1. Architecture

**Extend `packages/marketplace-runtime`** with a `registry/` module. No new package.

---

## 2. Files to Create

```
packages/marketplace-runtime/src/registry/
├── registry.ts        # RegistryRuntime (public API surface)
├── source.ts          # RegistrySource CRUD + URL validation
├── sync.ts            # SyncEngine (fetch → validate → compare → cache)
├── cache.ts           # LocalRegistryCache (atomic read/write)
├── trust.ts           # TrustModel (5 levels, blocked check)
├── entry.ts           # RegistryEntry + RegistryVersion schemas
├── search.ts          # SearchIndex (keyword match)
└── events.ts          # Registry event types

packages/marketplace-runtime/tests/
└── registry/
    ├── source.test.ts
    ├── entry.test.ts
    ├── sync.test.ts
    ├── cache.test.ts
    ├── trust.test.ts
    ├── search.test.ts
    ├── update.test.ts
    └── integration.test.ts
```

---

## 3. Files to Modify

| File | Change |
|---|---|
| `marketplace-runtime/src/index.ts` | Export RegistryRuntime + types |
| `marketplace-runtime/package.json` | Add registry sub-path export (optional) |

**No other packages modified.**

---

## 4. Core Interfaces

### RegistryEntry

```typescript
interface RegistryEntry {
  id: string; name: string; description: string;
  packageType: "skill";
  latestVersion: string;
  versions: RegistryVersion[];
  publisher: { id: string; name: string; type: "individual" | "organization" };
  trust: { level: TrustLevel; verified?: boolean; warnings?: string[] };
  compatibility: { qodexVersion: string; skillRuntimeVersion?: string };
  tags: string[];
  locales?: Record<string, { name: string; description: string }>;
  createdAt: string; updatedAt: string;
}
type TrustLevel = "local" | "community" | "verified" | "official" | "blocked";
```

### RegistrySource

```typescript
interface RegistrySource {
  id: string; name: string; url: string; enabled: boolean; priority: number;
  lastSyncAt?: number;
}
```

### SyncResult

```typescript
interface SyncResult {
  sourceId: string; newEntries: number; updatedEntries: number;
  removedEntries: number; errors: string[]; timestamp: number;
}
```

### UpdateCandidate

```typescript
interface UpdateCandidate {
  id: string; installedVersion: string; availableVersion: string;
  trust: TrustLevel; deprecated?: boolean;
}
```

---

## 5. Test Plan

| Suite | Tests | Focus |
|---|---|---|
| Source CRUD + URL validation | 6 | Add/remove/list, invalid URL, duplicate |
| Entry schema validation | 8 | Required fields, version array, trust level, compatibility |
| Sync mock fetch → validate → cache | 8 | Full sync flow, partial failure, empty response |
| Sync offline behavior | 4 | Network error, cache fallback, stale warning |
| Cache read/write/atomize/corrupt | 6 | Atomic rename, corrupt reset, TTL |
| Update detection | 6 | installed < available, equal, downgrade, multi-source |
| Trust model | 6 | 5 levels, blocked throws, warning display |
| Compatibility check | 4 | qodexVersion satisfies, platform match |
| Search index | 4 | Keyword match, multi-word, no results |
| Checksum validation | 3 | Match, mismatch, missing checksum |
| Security | 6 | XSS metadata, traversal URL, malformed JSON, file:// reject |
| Integration | 6 | sync → cache → search → update detect → blocked |
| **Total** | **~67** | |

---

## 6. Acceptance Criteria

| # | Criterion |
|---|---|
| 1 | RegistryRuntime adds/removes/list sources |
| 2 | SyncEngine fetches and caches from mock source |
| 3 | Cache survives round-trip (write → read → identical) |
| 4 | Corrupt cache detected and reset |
| 5 | checkUpdates returns correct UpdateCandidate[] |
| 6 | TrustModel rejects blocked entries |
| 7 | Search returns matching entries |
| 8 | Checksum mismatch detected |
| 9 | Invalid JSON gracefully rejected |
| 10 | Offline sync preserves last valid cache |
| 11 | ~67 new tests passing |
| 12 | No regressions in existing 1165+ tests |

---

## 7. Forbidden

- ❌ Create new package
- ❌ Modify Provider SDK, Agent Runtime, Desktop UI
- ❌ Auto-install after sync
- ❌ Call real network in tests
- ❌ Store credentials in cache

---

## 8. Milestone Exit Criteria

- [ ] Registry module exists in marketplace-runtime
- [ ] All acceptance criteria met
- [ ] ADR-017 accepted
- [ ] No regressions
- [ ] Desktop UI deferred to M15.1

---

*Implementation Plan — 2026-06-13*
