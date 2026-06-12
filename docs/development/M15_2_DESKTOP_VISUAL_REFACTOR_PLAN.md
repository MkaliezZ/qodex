# M15.2 — Desktop Visual Refactor Plan

**Date:** 2026-06-13  
**Status:** Planning — Pending Implementation  
**Handoff Target:** Codex (Claude Code / DeepSeek V4 Pro)

---

## 1. Executive Summary

Qodex has reached internal beta with 14 packages, 1,100+ tests, and a working Desktop Registry UI. However, the UI still carries a generic "admin dashboard" feel with flat panels, weak visual hierarchy, and no product identity. M15.2 is a **visual-only refactor** that transforms Qodex into a polished, dark glass AI engineering cockpit. No runtime packages are modified. No behavior changes. Only `apps/desktop/src/` components and styles.

---

## 2. Current UI Assessment

Based on the M15.1 screenshots, current issues include:

| Area | Problem |
|---|---|
| **Sidebar (ProjectRail)** | Plain button list, weak active state, no visual hierarchy |
| **AppShell** | Flat dark gradient, generic panel borders |
| **Settings** | Form-like layout, generic inputs, weak section grouping |
| **Marketplace** | Discover/Updates tabs feel functional, not productized |
| **Registry Cards** | Flat rectangles, weak visual metadata hierarchy |
| **TrustBadge** | Text-only, no visual distinction |
| **Buttons/Inputs** | Generic styling, no Qodex-specific language |
| **Empty states** | Plain text, no guidance |

---

## 3. Design Direction

**Qodex should feel like:**

- A dark, glassy AI engineering cockpit
- A local-first agentic IDE
- A premium desktop command center
- Calm, precise, technical, and atmospheric
- macOS-native AI workbench

**Qodex should NOT feel like:**

- Ant Design dashboard
- Generic enterprise settings panel
- Plain CRUD admin console
- Overly colorful consumer app
- Cyberpunk overload
- Game UI

---

## 4. Visual Identity

| Attribute | Direction |
|---|---|
| **Vibe** | Dark glass · Layered depth · Subtle glow |
| **Theme** | Dark (default), light (future) |
| **Accent** | Violet-blue (`#6C5CE7` → `#5B8CFF`) |
| **Success** | Soft green (`#4DFF9D`) |
| **Warning** | Amber (`#F0A050`) |
| **Danger** | Red (`#FF5C7A`) |
| **Info** | Cyan/blue (`#5B8CFF`) |
| **Borders** | Thin `rgba(255,255,255,0.06-0.10)` |
| **Surfaces** | Translucent, slightly blurred, rounded `10-12px` |

---

## 5. Surface System

```
Level 0 — App background
    Near-black blue/purple gradient (existing, refinable)

Level 1 — Main panels (sidebar, workspace, context)
    Translucent dark, subtle border, ~10px radius

Level 2 — Cards (settings groups, marketplace cards, dialogs)
    Slightly lighter than level 1, 2px border, 12px radius, optional blur

Level 3 — Active/selected state
    Violet-blue tint border, subtle glow, 12px radius
```

---

## 6. Typography Improvements

| Element | Current | Target |
|---|---|---|
| Section labels | `11px, #rgba(255,255,255,0.30)` | Same but tighten tracking |
| Nav items | `13px, medium` | Slightly smaller `12px`, tighter |
| Card titles | `13px, bold` | `13px, semibold` |
| Card metadata | `11px, 0.35` | `10px, 0.40` |
| Badge labels | `11px` | `10px, semibold, uppercase` |

---

## 7. Spacing and Density

| Area | Current | Target |
|---|---|---|
| Sidebar nav padding | `7px 10px` | `6px 10px` (tighter) |
| Section margin | `16px` bottom | `16px` (keep) |
| Card padding | `10px 12px` | `12px 14px` (more spacious) |
| Dialog padding | — | `16px` |
| Input padding | `6px 10px` | `7px 10px` |

---

## 8. Component Refactor Plans

### 8.1 ProjectRail / Sidebar

| Aspect | Current | Target |
|---|---|---|
| Active nav | Weak blue tint | Stronger violet-blue left accent bar |
| Hover | Subtle | Slightly brighter background |
| Project block | Plain | Logo + subtle gradient badge |
| Marketplace | Last item | Same treatment, stronger active indication |
| Bottom status | Tiny | Status dot + label with subtle border |

### 8.2 AppShell

| Aspect | Current | Target |
|---|---|---|
| Background | Dark gradient | Refined dark glass gradient |
| Panel borders | `rgba(255,255,255,0.04)` | `rgba(255,255,255,0.06-0.08)` |
| Workspace surface | Glass panel | Same, consistent with sidebar/context |
| Panel separators | None | 1px subtle borders |

### 8.3 SettingsView

| Aspect | Current | Target |
|---|---|---|
| Section grouping | Stacked divs | Card-per-section with subtle border |
| Provider section | Bare | Card with header |
| Registry section | Bare | Card with header + source list refinements |
| Inputs | Long, plain | Styled consistently with cards |

### 8.4 MarketplaceView

| Aspect | Current | Target |
|---|---|---|
| Tabs | Simple buttons | Pill-style tabs with active glow |
| Search bar | Styled input | Glass-level input with icon placeholder |
| Entry cards | Flat | Card with subtle hover lift, clearer metadata |
| Entry detail | Inline | Panel-style with sections |
| Empty states | Text | Icon + text + action guidance |
| Updates list | Placeholder text | Card-per-update, similar to entry cards |

### 8.5 TrustBadge

| Level | Current | Target |
|---|---|---|
| community | Yellow text | Yellow text + subtle amber badge |
| verified | Green text | Green text + small check icon badge |
| official | Blue text | Blue text + small verified badge |
| blocked | Red text | Red text + ⚠ bold badge + red border |
| local | Hidden | Hidden (keep) |

### 8.6 ConfirmInstallDialog

| Aspect | Current | Target |
|---|---|---|
| Surface | — | Centered overlay dialog, blurred backdrop |
| Sections | — | Name, version, publisher, trust, domain, checksum |
| Blocked state | — | Red border, disabled confirm, warning icon |
| Buttons | Generic | Styled outline (cancel) + filled (confirm) |

---

## 9. Files In Scope

All files are in `apps/desktop/src/`:

```
components/AppShell.tsx
components/ProjectRail.tsx
components/RegistrySourceForm.tsx
components/RegistryEntryCard.tsx
components/RegistryEntryDetail.tsx (inline in RegistryEntryCard)
components/TrustBadge.tsx
components/RegistryContext.tsx (minor)
components/DiagnosticProvider.tsx
views/SettingsView.tsx
views/MarketplaceView.tsx
styles/globals.css (refinements only)
```

---

## 10. Files Out of Scope (Must NOT Modify)

```
packages/marketplace-runtime/**
packages/provider-sdk/**
packages/agent-runtime/**
packages/skill-runtime/**
packages/mcp-runtime/**
packages/planning-runtime/**
packages/execution-graph-runtime/**
packages/i18n-runtime/**
packages/diff-engine/**
packages/git-runtime/**
packages/context-engine/**
packages/project-runtime/**
Any .ts files outside apps/desktop/src/
```

---

## 11. Testing and Screenshot Requirements

### After Implementation

- [ ] `pnpm --filter desktop typecheck` — 0 errors
- [ ] `pnpm --filter marketplace-runtime test` — passing
- [ ] `pnpm --filter desktop e2e` — mock-backed passing
- [ ] Desktop app renders in Chrome
- [ ] No blank page
- [ ] No console `fs`/module errors
- [ ] Marketplace navigation works
- [ ] Settings Registry Sources section renders
- [ ] Discover tab renders
- [ ] Updates tab renders
- [ ] No `dangerouslySetInnerHTML` added
- [ ] No behavior regression

### Required Screenshots

1. App shell with Marketplace nav (full view)
2. Settings with Registry Sources
3. Marketplace Discover (empty state)
4. Marketplace Discover (with fixture data)
5. Entry detail
6. Updates tab
7. Trust badge examples (all 4 visible levels)

---

## 12. Risks and Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Visual refactor causes behavior regression | 🟡 Medium | E2E smoke tests; no runtime changes |
| CSS changes break on different browsers | 🟢 Low | Chrome-only for now (Tauri uses Chromium) |
| Over-polish leads to scope creep | 🟡 Medium | Strict in-scope/out-of-scope list |
| Design doesn't match screenshots | 🟢 Low | Compare before/after screenshots |

---

## 13. Acceptance Criteria

- [ ] Qodex no longer looks like a generic admin dashboard
- [ ] All existing behavior preserved (no regression)
- [ ] Runtime packages untouched
- [ ] TypeScript passes (0 errors)
- [ ] Marketplace, Settings, Registry Sources all render
- [ ] Trust badges are visually distinct
- [ ] Empty states guide the user
- [ ] Dark glass design language is consistent across all surfaces

---

## 14. Recommended Handoff

Hand this plan to Codex (Claude Code with DeepSeek V4 Pro) for implementation. The companion `M15_2_CODEX_VISUAL_REFACTOR_HANDOFF.md` provides the implementation prompt.

Start with: `globals.css` base refinements → `AppShell` + `ProjectRail` → `SettingsView` → `MarketplaceView` → card components → badges → dialogs → screenshots → validation.

---

*Planning Document — 2026-06-13*
