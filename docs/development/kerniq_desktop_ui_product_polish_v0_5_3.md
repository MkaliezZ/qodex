# KerniQ v0.5.3 Desktop UI Product Polish

**Date:** 2026-07-23
**Scope:** Desktop presentation, interaction hierarchy, accessibility, and responsive layout only.

## Outcome

KerniQ Desktop now presents as a compact local workbench instead of a floating
AI dashboard. The left project/navigation region, center workspace, and right
context inspector form one continuous application frame separated by neutral
one-pixel dividers.

No Agent Runtime, Session Runtime, persistence, recovery, approval, Patch,
Command, provider, project-binding, or Git behavior changed.

## Visual Problems Removed

- Removed the animated blue-purple background and ambient radial glows.
- Retired glass blur and floating panel shadows from the application shell.
- Replaced letter-based navigation and Unicode action glyphs with a consistent
  16px Lucide icon set.
- Reduced nested cards, decorative empty-state marks, uppercase micro-labels,
  pill metadata, hover elevation, and competing accent colors.
- Replaced large marketing-style headings with compact desktop section headers.
- Converted ordinary Agent events into a chronological activity log.

## Design Direction

The UI uses a neutral graphite palette with solid surfaces, subtle tonal
differences, and one restrained cool-blue accent. Semantic success, warning,
and danger colors remain limited to operational state. Native system UI fonts
are used for controls and copy; monospace is reserved for commands, paths,
diffs, and identifiers.

The radius hierarchy is 4px for compact controls and rows, 6px for inputs and
small surfaces, and 8px for approval or recovery decision surfaces. Motion is
limited to small state transitions and the loading indicator, with a
`prefers-reduced-motion` override.

The CSS foundation is split by responsibility: `tokens.css` defines theme
values, `shell.css` owns the application frame and project rail,
`components.css` owns shared workbench and Agent surfaces, `views.css` owns
view-specific layouts, and `responsive.css` owns width and motion queries.

## Component Changes

- `AppShell` now renders an integrated application frame without outer gutters.
- The application root is viewport-bound, so large native project trees scroll
  independently without displacing the workspace or inspector.
- `ProjectRail` uses accessible navigation icons and a reusable project tree.
- `AgentTimeline` separates ordinary log rows from decision and result surfaces.
- Current Command approval is prioritized above history so actions remain
  visible in compact windows.
- `DiffViewer` uses a structured, bounded review surface with persistent action
  hierarchy and semantic diff colors.
- `PromptBar` is integrated into the center workspace and keeps current Run,
  model, skill, mode, Enter-key, and disabled-state behavior.
- `ContextPanel` now reads as a key-value inspector ordered by selected context,
  token budget, provider/model/access, and Git state.
- Files, Skills, and Git use list/table and source-control patterns.
- Sessions retain all recovery and safety behavior while using dense rows,
  split-pane detail, semantic status dots, and restrained recovery callouts.
- Settings uses grouped form sections rather than nested decorative cards.
- Marketplace retains compact cards where visual browsing is appropriate while
  removing orbit art, glows, and fake popularity cues.

## Screens Reviewed

- Agent empty and active states
- Patch approval
- Command approval
- Files
- Sessions
- Skills
- Git
- Settings and Registry Sources
- Marketplace empty state

Temporary screenshots are stored outside the repository under:

```text
/tmp/kerniq-ui-v0-5-3/before/
/tmp/kerniq-ui-v0-5-3/after/
```

## Responsive Review

The application was reviewed at 1440x900, 1280x800, and 1024x768. The inspector
remains subordinate at larger widths and is hidden below 1180px. The center
workspace uses internal scrolling at compact widths so the current approval
actions, Diff review, and prompt composer remain reachable without horizontal
page overflow. A real native project with a large directory tree was also used
to verify that shell headers and the composer remain anchored during a prompt.

## Accessibility

- Primary navigation has an accessible label and selected-page semantics.
- Icon-only controls use visible or ARIA labels.
- Focus-visible rings are applied consistently to buttons, fields, selects,
  and disclosure controls.
- Statuses include text in addition to semantic color and dots.
- Disabled controls remain visibly distinct.
- Minimum control heights and scroll regions were normalized for desktop use.
- Reduced-motion preferences disable nonessential transitions and animation.

## Known Limitations

- The right inspector collapses completely at compact widths; an interactive
  inspector toggle is intentionally deferred to avoid adding a new state system.
- Files remains a read-only project browser and does not add editing operations.
- Skills and Git continue to show only currently available beta functionality.
- No light theme is included in this milestone.
