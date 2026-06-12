# M15.1 — Desktop Registry UI Implementation Plan

**Date:** 2026-06-13  
**Status:** Pre-Implementation  
**Depends On:** M15 Production Review (Passed)

---

## 1. Scope

| In Scope | Out of Scope |
|---|---|
| Settings: source management + sync | Public registry |
| MarketplaceView: Discover + Updates | Auto-install / auto-sync |
| Trust badges + install confirmation | Publisher portal |
| XSS-safe text rendering | |

---

## 2. Files

### New

```
apps/desktop/src/views/MarketplaceView.tsx
apps/desktop/src/components/RegistrySearchBar.tsx
apps/desktop/src/components/RegistryEntryCard.tsx
apps/desktop/src/components/RegistryEntryDetail.tsx
apps/desktop/src/components/TrustBadge.tsx
apps/desktop/src/components/UpdateAvailableBadge.tsx
apps/desktop/src/components/RegistryUpdateList.tsx
apps/desktop/src/components/ConfirmInstallDialog.tsx
apps/desktop/src/components/RegistrySyncStatus.tsx
apps/desktop/e2e/marketplace.spec.ts
```

### Modified

```
apps/desktop/src/components/AppShell.tsx         # Add "Marketplace" to nav + activeView
apps/desktop/src/views/SettingsView.tsx           # Add RegistrySourceForm
apps/desktop/src/components/ProviderContext.tsx   # Or new RegistryContext if needed
```

---

## 3. Navigation Integration

```
activeView type: add "marketplace"
Sidebar nav: add { label: "Marketplace", view: "marketplace" }
AppShell CenterContent: add case "marketplace" → <MarketplaceView />
```

---

## 4. MarketplaceView

Tabs:
- **Discover** — RegistrySearchBar + EntryCard list + RegistrySyncStatus
- **Updates** — RegistryUpdateList + UpdateAvailableBadge

---

## 5. State Management

Use existing patterns — a `RegistryContext` provider that wraps `RegistryRuntime`. No new package.

```typescript
const RegistryCtx = createContext({ rt: new RegistryRuntime() });
```

---

## 6. Test Plan

| Suite | Tests |
|---|---|
| Component (TrustBadge, EntryCard, etc.) | ~10 |
| E2E (source, sync, search, trust, update, install) | ~23 |
| **Total** | **~33** |

---

## 7. Acceptance Criteria

| # | Criterion |
|---|---|
| 1 | Marketplace view in sidebar navigation |
| 2 | Registry source add/remove in Settings |
| 3 | Manual sync with status indicator |
| 4 | Search returns registry entries |
| 5 | Entry detail shows trust, version, publisher |
| 6 | Blocked entries cannot be installed |
| 7 | Install confirmation dialog before install |
| 8 | Updates tab shows available updates |
| 9 | All remote metadata rendered as text (no HTML injection) |
| 10 | ~33 tests passing |
| 11 | No regressions |

---

## 8. Forbidden

- ❌ Modify Registry Runtime, Provider SDK, Agent Runtime
- ❌ Auto-install / auto-sync / auto-execute
- ❌ Use dangerouslySetInnerHTML
- ❌ Expose API keys

---

*Implementation Plan — 2026-06-13*
