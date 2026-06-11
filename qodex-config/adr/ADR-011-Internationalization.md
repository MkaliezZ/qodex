# ADR-011

**Status:** Accepted
**Date:** 2026-06-12

## Context

Qodex targets a global developer audience. Providing documentation and UI in multiple languages improves accessibility. However, the core architecture is still evolving through M0–M10, and maintaining a full multilingual UI would add significant maintenance overhead before the architecture stabilizes.

## Decision

**Implement bilingual README files only. Defer full UI internationalization.**

Current scope:
- `README.md` (English)
- `README.zh-CN.md` (Simplified Chinese)

Future scope (M13+):
- Desktop UI localization
- Dedicated `packages/i18n/` package
- Locale files: `locales/en.json`, `locales/zh-CN.json`, etc.
- All UI strings should use `t("key")` pattern going forward to facilitate future translation

## Consequences

**Positive:**
- Chinese-speaking developers can access project documentation in their native language
- No maintenance burden on the evolving core architecture
- The `t("key")` pattern can be adopted gradually as components are touched

**Negative:**
- Non-English speakers will not have a translated UI until M13+
- Maintaining two READMEs requires discipline to keep them in sync

## Alternatives Considered

1. **Full UI internationalization now (M10.5)**: Rejected — would delay core architecture work. A multilingual UI on an evolving codebase creates high rework cost.
2. **README only in English**: Rejected — the project has Chinese-speaking contributors and users. Providing Chinese documentation reduces the entry barrier.
3. **README in additional languages (Japanese, Korean, etc.)**: Deferred — can be added when contributing community provides translations.
