# Qodex v0.2.0-beta.1 — Release Notes

**Release:** Qodex v0.2.0-beta.1
**Release Date:** 2026-06-14
**Status:** Beta

---

## Overview

Qodex v0.2.0-beta.1 advances the completed alpha architecture baseline into a visually accepted desktop beta release candidate. This release expands the marketplace and registry foundation, provider configuration surfaces, browser-safe runtime boundaries, and the premium local-first agent workbench experience.

---

## Major Highlights

- Alpha architecture baseline completed
- Marketplace Foundation
- Registry and Sync runtime
- Browser-safe marketplace runtime export boundary
- Desktop Registry Sources and Marketplace UI
- Provider Settings and provider switching
- Anthropic provider support
- Custom OpenAI-compatible provider presets
- M15.2 Desktop Visual Refactor
- Trust badge and marketplace UI polish

---

## Validation

- Marketplace runtime tests: 85/85 passed
- Desktop smoke test passed
- App starts successfully with no blank page
- Marketplace, Settings, Registry Sources, and Provider Settings render and navigate
- Browser console had no warnings or errors during smoke validation
- `git diff --check` passed

---

## Known Beta Limitations and Caveats

- No dedicated desktop typecheck script exists.
- Fallback desktop typecheck and the repository build command are currently blocked by existing cross-package TypeScript errors; no release packaging files introduced observed type errors.
- Desktop E2E script is unavailable or environment-blocked.
- Fallback Playwright Chromium was blocked by environment `SIGTRAP`/`EPERM`.
- Live provider API calls are not part of this beta validation.
- Some desktop runtime integrations remain mock or in-memory beta implementations.
- Persistent SQLite/database-backed storage is not yet part of this beta.

Desktop typecheck and desktop E2E are not claimed as passing for this release. Real provider API integration was not fully validated.

---

*Qodex v0.2.0-beta.1 — Beta Release — 2026-06-14*
