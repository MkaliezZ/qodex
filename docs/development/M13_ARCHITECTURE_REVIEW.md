# M13 Architecture Review — Internationalization Runtime & Localization System

**Date:** 2026-06-12  
**Status:** Pre-Implementation Review  
**Source:** ADR-014 — Internationalization Runtime & Localization System

---

## 1. i18n Runtime Ownership

### Owns ✅

| Concern | Description |
|---|---|
| **Locale registry** | Enumerate `en`, `zh-CN` and future locales with metadata |
| **Locale resolution** | Deterministic chain: user → project → system → en |
| **Translation loading** | Load `locales/<locale>/{app,runtime,skills}.json` |
| **Fallback chain** | Region → language → default (`zh-TW` → `zh` → `en`) |
| **Per-key fallback** | Missing key in requested locale falls back to `en` |
| **Translation lookup** | Typed `t(key)` returning resolved string |
| **Runtime message resolution** | `LocalizedError`, `LocalizedWarning` key → message |
| **Localized metadata** | Skill name/description/tags per locale |
| **Namespace validation** | Detect missing keys per namespace |

### Does NOT Own ❌

| Concern | Delegated To |
|---|---|
| UI rendering (React components) | Desktop shell |
| Automatic translation generation | Future M15 |
| Provider/model calls | Provider SDK |
| Skill execution | Skill Runtime |
| Agent execution | Agent Runtime |
| Network-loaded translations | **NONE — forbidden** |

---

## 2. Relationship With Desktop UI

### Boundary

```
Desktop UI (React)                  i18n Runtime
──────────────────                  ────────────
Calls t("sidebar.files")            Resolves via current locale
Renders resolved string             Loads from locale JSON files
Listens for locale change events    Fires locale:changed event
```

### API Surface

```typescript
// Desktop usage — decoupled from i18n internals
const { t, locale, setLocale, locales } = useI18n();

return <button>{t("sidebar.files")}</button>;
```

### Design Rules

- **No React coupling inside i18n runtime** — the runtime emits plain events; a thin React hook in `apps/desktop` subscribes
- **Locale switch triggers re-render** — all components consuming `useI18n()` re-render on locale change
- **Fallback is transparent** — the `t()` function silently resolves fallbacks; the caller never sees a blank string

---

## 3. Relationship With Skill Runtime

### Localization Scope

| Skill Property | Localized? | Fallback |
|---|---|---|
| `name` | ✅ | `en` name |
| `description` | ✅ | `en` description |
| `tags` | ✅ | `en` tags |
| `manifest` | ❌ (internal) | N/A |

### Resolution Flow

```
SkillRuntime.loadSkill("react-review")
  → i18nRuntime.getLocalizedSkill("react-review", currentLocale)
    → locales/en/skills.json (base)
    → locales/zh-CN/skills.json (overlay)
    → Merge with en fallback for missing keys
  → Returns LocalizedSkillMetadata
```

---

## 4. Relationship With Context Engine

### Decision: Context remains in source language

| Context Source | Localized? | Rationale |
|---|---|---|
| Project Rules | ❌ No | Rules are project-specific; not general localization |
| Memory | ❌ No | Memory is session data; not UI text |
| Metadata | ❌ No | Metadata is technical; localization would add noise |
| Files | ❌ No | File contents are user data, not UI strings |
| Task prompt | ❌ No | Prompt is user input, not UI strings |

**Only user-facing UI text is localized.** Context assembly remains untouched. This keeps the Context Engine free of i18n dependency and prevents localization from interfering with agent behavior.

---

## 5. Runtime Messages Strategy

### Message Types

```typescript
class LocalizedError extends Error {
  constructor(public key: string, public params?: Record<string, unknown>) {
    super(key); // The key, not the localized message
  }
}

class LocalizedWarning {
  constructor(public key: string, public params?: Record<string, unknown>) {}
}

class LocalizedNotification {
  constructor(public key: string, public params?: Record<string, unknown>) {}
}
```

### Resolution Flow

```
Runtime throws LocalizedError("error.project_not_found")
  → UI catches error
  → Calls i18nRuntime.t("error.project_not_found", currentLocale)
  → Returns "项目未找到" (zh-CN) or "Project not found" (en)
  → UI renders localized message
```

### Key Format: `error.<description>`

Examples: `error.project_not_found`, `error.graph_validation_failed`, `error.cannot_start`

---

## 6. Locale Architecture

### Data Model

```typescript
interface Locale {
  code: string;          // "en", "zh-CN"
  language: string;      // "en", "zh"
  region?: string;       // "CN"
  label: string;         // "English", "中文"
  direction: "ltr" | "rtl";
}

interface LocaleRegistry {
  locales: Map<string, Locale>;
  defaultLocale: Locale;
  addLocale(locale: Locale): void;
  getLocale(code: string): Locale | undefined;
  list(): Locale[];
}

interface LocaleResolver {
  resolve(prefs: { user?: string; project?: string; system?: string }): string;
}

interface TranslationBundle {
  locale: string;
  namespace: string;
  entries: Record<string, string>;
}
```

### Deterministic Resolution

```
resolve({ user: "zh-CN", system: "en" })  → "zh-CN"
resolve({ user: "zh-TW" })                 → "en" (zh-TW not supported → fallback)
resolve({ user: "ja", system: "zh-CN" })   → "en" (ja not supported → default)
resolve({})                                 → "en" (default)
```

---

## 7. Translation Key Strategy

### Naming Convention

```
<namespace>.<section>.<field>

app.sidebar.files
app.empty.no_project
app.prompt.placeholder
runtime.error.project_not_found
runtime.notification.execution_complete
skills.react_review.name
skills.react_review.description
```

### Namespaces

| Namespace | File | Scope |
|---|---|---|
| `app.*` | `app.json` | All desktop UI strings |
| `runtime.*` | `runtime.json` | Error messages, status text, notifications |
| `skills.*` | `skills.json` | Skill names, descriptions, tags |

### Rules

- All lowercase, dot-separated
- No spaces, no special characters except underscore
- Leaf keys are descriptive: `no_project`, not `np`
- Namespace validated at load time — missing keys detected

---

## 8. Fallback Design

### Locale-Level Fallback

```
Request: zh-TW
  → Check zh-TW registry entry    → NOT FOUND
  → Strip region: zh              → NOT FOUND
  → Default locale: en            → FOUND — use en
```

### Per-Key Fallback

```
Request: t("sidebar.sessions", "zh-CN")
  → Check zh-CN app.json          → KEY NOT FOUND
  → Check en app.json             → FOUND — return "Sessions"
```

**No undefined. No blank strings. No crashes.**

---

## 9. Migration Plan

### Phase A: Desktop UI (M13, in-scope)

Extract ~30 hardcoded strings from:

| Component | String Count |
|---|---|
| ProjectRail | 6 (nav labels, project status, "Open Project", "Ready") |
| ContextPanel | 12 (section labels, empty states, mode text) |
| PromptBar | 4 (placeholder, "Run", "Review Mode", tooltips) |
| AgentTimeline | 3 (header, empty state, streaming badge) |
| DiffViewer | 4 (header, empty state, button labels) |
| SkillDrawer | 4 (button, popover labels) |
| ModelSwitcher | 2 (provider name, config message) |
| FilesView | 3 (empty state) |
| SessionsView | 2 (empty state) |
| SkillsView | 3 (header, status labels) |
| GitView | 6 (section labels, status messages) |
| SettingsView | 7 (section labels, values, hints) |
| **Total** | **~56 strings** |

Risk: Low. Strings are already contained in typed components.

### Phase B: Skill Localization (M13, in-scope)

Localize 3 built-in skills: General, TypeScript, React.

Risk: Very low. Already uses metadata pattern.

### Phase C: Runtime Messages (Post-M13)

Convert 15+ hardcoded error messages across agent-runtime, context-engine, diff-engine to `LocalizedError`.

Risk: Medium. Requires package-level changes.

### Phase D: Documentation Tooling (Post-M13)

Consume locale files for future doc generation.

Risk: Low. Depends on locale file format.

---

## 10. Locale File Schema

### app.json
```json
{
  "sidebar": {
    "files": "Files", "sessions": "Sessions", "skills": "Skills",
    "git": "Git", "settings": "Settings"
  },
  "action": { "run": "Run", "open_project": "Open Project" },
  "empty": {
    "no_project": "No project opened", "no_session": "Session history coming soon",
    "no_skills": "No skills loaded", "no_repo": "No repository detected",
    "agent_workspace": "Type a prompt and click Run to start.",
    "diff_preview": "No changes to review."
  },
  "status": { "ready": "Ready", "project_loaded": "Project loaded" },
  "model": { "provider": "Model Provider" },
  "settings": {
    "title": "Settings", "theme": "Theme", "language": "Language",
    "version": "Version", "dark": "Dark"
  }
}
```

### runtime.json
```json
{
  "error": {
    "project_not_found": "Project not found",
    "graph_validation_failed": "Graph validation failed",
    "cannot_start": "Cannot start graph"
  },
  "notification": {
    "execution_complete": "Execution completed",
    "execution_failed": "Execution failed"
  }
}
```

### skills.json
```json
{
  "general": {
    "name": "General",
    "description": "General-purpose coding assistance"
  },
  "typescript": { "name": "TypeScript", "description": "TypeScript language expertise" },
  "react": { "name": "React", "description": "React component patterns" }
}
```

---

## 11. Testing Strategy

**Minimum: 80 tests**

| Suite | Tests | Focus |
|---|---|---|
| `registry.test.ts` | 8 | Locale add/list/get, metadata |
| `resolver.test.ts` | 10 | Deterministic resolution, fallback chain |
| `fallback.test.ts` | 8 | Per-key fallback, region stripping |
| `loader.test.ts` | 8 | JSON file loading, missing-file handling |
| `runtime.test.ts` | 12 | I18nRuntime full API |
| `skill-localization.test.ts` | 8 | Skill metadata per locale |
| `desktop-integration.test.ts` | 6 | `t()` function, locale switch event |
| `serialization.test.ts` | 6 | Bundle round-trip |
| `edge.test.ts` | 8 | Empty files, unknown locale, duplicate keys |
| `security.test.ts` | 6 | No eval, no fetch, no remote loading |
| `production-review.test.ts` | 10 | Full lifecycle scenarios |
| **Total** | **90** | |

---

## 12. Risks

| Risk | Severity | Mitigation | Test Strategy |
|---|---|---|---|
| Translation drift | 🟡 Medium | Central key file; missing-key detection | Key completeness check in CI |
| Missing keys cause blank UI | 🔴 High | Per-key en fallback; never return undefined | Fallback test for every known key |
| Locale switching bugs | 🟡 Medium | Event-driven re-render; immutable bundles | Locale switch integration test |
| Skill metadata inconsistency | 🟢 Low | Merge with en fallback for every locale | Skill localization test per locale |
| Hardcoded string leakage | 🟡 Medium | Forbidding guideline + code review | Regex audit for bare English strings |
| Large locale files | 🟢 Low | Namespace splitting; lazy loading in future | File size test |
| Remote translation loading | 🔴 High | Local-only by design; no fetch, no eval | Security test — attempt remote fetch |

---

## 13. Recommendation

### ✅ READY for M13 implementation

**Rationale:**

- Pure coordination layer — no cross-package implementation dependencies
- Desktop UI already has typed components ready for key extraction
- Skill Runtime already uses metadata patterns suitable for localization
- Context Engine explicitly excluded from localization scope (no impact)
- Fallback chain guarantees no blank strings — safe to adopt incrementally
- Zero risk to existing 9 runtime packages

---

*Architecture Review — 2026-06-12*
