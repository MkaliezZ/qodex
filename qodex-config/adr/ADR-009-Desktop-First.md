# ADR-009

**Status:** Accepted
**Date:** 2026-06-11

## Context

Qodex's target users are developers who work with local codebases. Unlike cloud-based AI coding tools (GitHub Copilot, Cursor), Qodex operates on the developer's machine with full file system access. A desktop-first architecture is the correct foundation for a tool that needs to read, modify, and version local files.

## Decision

Use Tauri 2 + React as the desktop framework:

```
apps/desktop/
├── src/                  # React frontend (Vite)
│   ├── components/       # 8 UI components
│   ├── hooks/            # React hooks (useRuntime)
│   └── styles/           # Design system CSS
│
└── src-tauri/            # Rust backend
    ├── src/main.rs       # Application entry
    ├── src/lib.rs        # Tauri builder
    └── tauri.conf.json   # Window config (1280×800)
```

Key design decisions:
1. **Three-column layout**: Left Rail (navigation), Center (Agent Workspace + PromptBar), Right Panel (Context/Config).
2. **Dark glassmorphism**: Background `#070A12` with fluid gradient animation. Glass panels use `backdrop-filter: blur(24px)`.
3. **Text-first UI**: Navigation items are text-only (no emoji/icons). Visual hierarchy through typography and spacing, not cards or badges.
4. **Local-first workflow**: All data stays on the machine. No cloud sync, no accounts, no telemetry.
5. **Browser dev first**: Vite dev server on `localhost:1420` for rapid iteration. Tauri shell for production packaging.

## Consequences

**Positive:**
- Full file system access via Tauri (when compiled)
- Small binary size (~5MB vs Electron's ~150MB)
- Cross-platform: macOS, Windows, Linux
- Rapid development cycle via Vite HMR
- All file operations stay local — no data leaves the machine

**Negative:**
- Browser dev mode uses `showDirectoryPicker()` (requires user gesture)
- Some Tauri APIs (file system, subprocess) are unavailable during Vite development
- Rust backend requires additional toolchain setup for contributors

## Alternatives Considered

1. **Electron**: Rejected — larger binary size, worse performance, security concerns with Node.js integration.
2. **Web-only (no desktop app)**: Rejected — file system access in browsers is limited and requires user gestures for every operation.
3. **React Native Desktop**: Rejected — immature ecosystem for file-system-heavy use cases.
4. **Terminal-based (CLI)**: Rejected — Qodex needs a rich UI for diff viewing, context management, and permission dialogs.
