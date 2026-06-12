# M15.1 — Desktop Registry UI Architecture Review

**Date:** 2026-06-13  
**Status:** Pre-Implementation Review  
**Depends On:** M15 Registry & Sync Runtime (Production Approved)

---

## 1. Scope

| In M15.1 ✅ | Out of Scope ❌ |
|---|---|
| Registry source management (Settings) | Public registry server |
| Marketplace Discover/Updates view | Publisher portal |
| Registry search + entry details | MCP/themes/workflows marketplace |
| Trust badges + warnings | Auto-install / auto-sync |
| Update detection + install flow | Secure keychain storage |
| Blocked entry enforcement | Provider API key changes |

---

## 2. UI Architecture Decision

### Selected: Hybrid

| Surface | Registry Feature | Rationale |
|---|---|---|
| **Settings** | Source management (add/remove/list/sync) | Configuration concern |
| **Marketplace view** | Discover | Search registry cache |
| **Marketplace view** | Updates | Update candidates + install |

### Navigation

```
Sidebar
├── Files
├── Sessions
├── Skills
├── Git
├── Marketplace     ← NEW (Discover + Updates + Installed tabs)
└── Settings        ← Sources added here
```

### Architectural Boundary

```
Settings → Source CRUD → RegistryRuntime
Marketplace Discover → search/entries → RegistryRuntime
Marketplace Updates → checkUpdates → RegistryRuntime
Install button → calls MarketplaceRuntime.install() → NOT RegistryRuntime
```

---

## 3. Required Components

| Component | Purpose | Registry API Call |
|---|---|---|
| `MarketplaceView.tsx` | Container with Discover/Updates tabs | — |
| `RegistrySearchBar.tsx` | Search input | `rt.search(query)` |
| `RegistryEntryCard.tsx` | Search result card | — |
| `RegistryEntryDetail.tsx` | Full entry info | `rt.getEntry(id)` |
| `TrustBadge.tsx` | Level badge | `rt.getTrustInfo(id)` |
| `UpdateAvailableBadge.tsx` | Update indicator | `rt.checkUpdates()` |
| `RegistryUpdateList.tsx` | Update candidates | `rt.checkUpdates()` |
| `ConfirmInstallDialog.tsx` | Install confirmation | — |
| `RegistrySourceForm.tsx` | Add source in Settings | `rt.addSource()` |
| `RegistrySyncStatus.tsx` | Sync status indicator | `rt.onEvent()` |

---

## 4. Trust Badge Design

| Level | Badge | Action |
|---|---|---|
| `local` | (none) | Normal |
| `community` | "Community" — yellow | Normal + warning text |
| `verified` | "✓ Verified" — green | Normal |
| `official` | "Official" — blue | Normal |
| `blocked` | "⚠ Blocked" — red | **Install disabled** |

---

## 5. Install Flow

```
User clicks Install on entry card
    ↓
RegistryEntryDetail shows full metadata
    ↓
User clicks Confirm Install
    ↓
MarketplaceRuntime.install(packageUrl) — NOT RegistryRuntime
    ↓
Marketplace validates manifest
    ↓
Skill Runtime loads skill
```

---

## 6. Runtime Gap Review

| Gap | Fix |
|---|---|
| No `listInstalled()` helper | Use existing `MarketplaceRuntime.listInstalled()` |
| No `getSyncState()` method exposed | Already in `RegistryRuntime` |
| No compatibility helper | UI-level comparison; trivial |

**No runtime changes required.** M15 API is sufficient.

---

## 7. E2E Test Plan

| Group | Tests |
|---|---|
| Source management | 4 |
| Sync flow | 3 |
| Search + details | 4 |
| Trust badges | 3 |
| Update detection | 3 |
| Install confirmation | 2 |
| Blocked entry enforcement | 2 |
| XSS-safe rendering | 2 |
| **Total** | **~23** |

Mock RegistryRuntime for all tests.

---

## 8. Recommendation

### ✅ READY FOR M15.1 IMPLEMENTATION

| Metric | Value |
|---|---|
| UI architecture | Hybrid (Settings sources + Marketplace view) |
| New views | 1 (`MarketplaceView`) |
| New components | 10 |
| Runtime changes | **0** |
| E2E tests | ~23 |
| Security risk | Low (text-only rendering) |

---

*Architecture Review — 2026-06-13*
