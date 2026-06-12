# M15.2 — Codex Visual Refactor Handoff

**Target:** Codex (Claude Code with DeepSeek V4 Pro)  
**Constraint:** This is a **UI-only visual refactor**. Do NOT modify any runtime packages. Do NOT change behavior.

---

## Source Document

Read `docs/development/M15_2_DESKTOP_VISUAL_REFACTOR_PLAN.md` for full direction.

---

## Scope

- Only modify `apps/desktop/src/` components and styles
- No runtime packages (`packages/*/`) — zero changes
- No new features, no behavior changes
- No package exports changes
- No ADR changes

## Implementation Order

1. `styles/globals.css` — refine base styles (surfaces, borders, background gradient)
2. `AppShell.tsx` — main layout, panel borders, background
3. `ProjectRail.tsx` — sidebar navigation with active accent bar, tighter nav items, stronger project block
4. `SettingsView.tsx` — section cards, provider/registry grouping
5. `RegistrySourceForm.tsx` — source list and form refinements
6. `MarketplaceView.tsx` — pill tabs, search bar glass styling, empty states
7. `RegistryEntryCard.tsx` — card with hover lift, clearer metadata hierarchy
8. `TrustBadge.tsx` — visual badges for community/verified/official/blocked
9. `ConfirmInstallDialog.tsx` — dialog styling with backdrop blur

## Design Language

| Element | Style |
|---|---|
| Background | Near-black blue/purple gradient |
| Surfaces | Translucent dark, rgba(255,255,255,0.04-0.08) border |
| Accent | Violet-blue (#6C5CE7 → #5B8CFF) |
| Font | System font stack (SF Pro / -apple-system) |
| Radius | 10-12px for panels, 8px for inputs |
| Active state | Left accent bar + subtle blue tint |
| Empty states | Icon + text + optional action |
| Trust badges | community=amber, verified=green, official=blue, blocked=red+warning |

## Validation

After implementation:

```
pnpm --filter desktop typecheck      # must pass (0 errors)
pnpm --filter desktop e2e            # mock-backed must pass
pnpm --filter marketplace-runtime test  # must pass
```

Open `http://localhost:1420` and verify:
- App renders, no blank page
- Settings → Registry Sources visible
- Marketplace → Discover/Updates tabs
- No console errors

Capture before/after screenshots.

## Forbidden

- Do NOT modify: `packages/marketplace-runtime/`, `packages/provider-sdk/`, `packages/agent-runtime/`, `packages/skill-runtime/`, `packages/mcp-runtime/`
- Do NOT add `dangerouslySetInnerHTML`
- Do NOT add new npm dependencies
- Do NOT change component behavior
- Do NOT change test files

---

*Handoff — 2026-06-13*
