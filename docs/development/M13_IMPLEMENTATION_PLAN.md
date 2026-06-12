# M13 Implementation Plan — Internationalization Runtime & Localization System

**Date:** 2026-06-12  
**Status:** Pre-Implementation  
**Depends On:** ADR-014, M13 Architecture Review

---

## 1. Package Structure

```
packages/i18n-runtime/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── locales/
│   ├── en/
│   │   ├── app.json
│   │   ├── runtime.json
│   │   └── skills.json
│   └── zh-CN/
│       ├── app.json
│       ├── runtime.json
│       └── skills.json
├── src/
│   ├── index.ts
│   ├── runtime/
│   │   └── runtime.ts              # I18nRuntime main class
│   ├── registry/
│   │   └── registry.ts             # LocaleRegistry
│   ├── resolver/
│   │   └── resolver.ts             # LocaleResolver
│   ├── loader/
│   │   └── loader.ts               # TranslationBundle loader
│   ├── fallback/
│   │   └── fallback.ts             # Fallback chain logic
│   ├── events/
│   │   └── bus.ts                  # Locale change events
│   └── models/
│       ├── locale.ts               # Locale, TranslationKey
│       ├── bundle.ts               # TranslationBundle
│       └── events.ts               # Event types
└── tests/
    ├── registry.test.ts
    ├── resolver.test.ts
    ├── fallback.test.ts
    ├── loader.test.ts
    ├── runtime.test.ts
    ├── skill-localization.test.ts
    ├── desktop-integration.test.ts
    ├── serialization.test.ts
    ├── edge.test.ts
    ├── security.test.ts
    └── production-review.test.ts
```

---

## 2. Core Interfaces

### 2.1 Locale Model

```typescript
interface Locale {
  code: string;          // "en", "zh-CN"
  language: string;      // "en", "zh"
  region?: string;       // "CN"
  label: string;         // "English", "中文"
  direction: "ltr" | "rtl";
}

type TranslationKey = string;  // "app.sidebar.files"
type TranslationValue = string;

interface TranslationBundle {
  locale: string;
  namespace: string;
  entries: Record<TranslationKey, TranslationValue>;
}
```

### 2.2 I18nRuntime

```typescript
class I18nRuntime {
  constructor(options?: { defaultLocale?: string });

  // Registry
  registerLocale(locale: Locale): void;
  getLocale(code: string): Locale | undefined;
  listLocales(): Locale[];

  // Loading
  loadBundle(bundle: TranslationBundle): void;

  // Resolution
  setLocale(code: string): void;
  getCurrentLocale(): string;
  t(key: TranslationKey): string;
  resolveLocale(prefs: { user?: string; project?: string; system?: string }): string;

  // Events
  onChange(handler: (locale: string) => void): () => void;

  // Metadata
  getLocalizedName(skillKey: string): string;
  getLocalizedDescription(skillKey: string): string;
  getLocalizedTags(skillKey: string): string[];

  // Serialization
  exportBundles(locale: string): TranslationBundle[];
  importBundles(bundles: TranslationBundle[]): void;
}
```

### 2.3 Fallback Chain

```typescript
class FallbackEngine {
  resolveKey(key: string, requestedLocale: string): {
    value: string;
    sourceLocale: string;
    fallbackUsed: boolean;
  };

  resolveLocale(code: string, availableLocales: string[]): string;
}
```

---

## 3. Integration Points

### 3.1 Desktop UI

React hook in `apps/desktop/src/hooks/useI18n.ts`:

```typescript
function useI18n() {
  return {
    t: (key: string) => i18nRuntime.t(key),
    locale: i18nRuntime.getCurrentLocale(),
    setLocale: (code: string) => i18nRuntime.setLocale(code),
    locales: i18nRuntime.listLocales(),
  };
}
```

No React dependency in the i18n-runtime package itself.

### 3.2 Skill Runtime

```typescript
// Skill Runtime queries i18n for localized metadata
const name = i18nRuntime.getLocalizedName(skillKey);
const desc = i18nRuntime.getLocalizedDescription(skillKey);
```

### 3.3 Runtime Messages (Post-M13)

```typescript
throw new LocalizedError("error.project_not_found");
```

---

## 4. Test Plan

**Target: 90 tests**

| Suite | Tests | Focus |
|---|---|---|
| `registry.test.ts` | 8 | Add, list, get locale; invalid code; duplicates |
| `resolver.test.ts` | 10 | Deterministic resolve; user→project→system→default chain |
| `fallback.test.ts` | 8 | zh-TW→zh→en; per-key fallback; no undefined |
| `loader.test.ts` | 8 | Load JSON; missing file; invalid JSON; overwrite |
| `runtime.test.ts` | 12 | Full API: t(), setLocale(), onChange(), metadata |
| `skill-localization.test.ts` | 8 | Skill name/desc/tags per locale; en fallback |
| `desktop-integration.test.ts` | 6 | t() returns correct string; locale switch triggers handler |
| `serialization.test.ts` | 6 | Bundle export/import round-trip |
| `edge.test.ts` | 8 | Empty files; unknown locale; duplicate keys; nested keys |
| `security.test.ts` | 6 | No eval; no fetch; no remote loading |
| `production-review.test.ts` | 10 | Full lifecycle: load → resolve → switch → fallback |
| **Total** | **90** | |

---

## 5. Forbidden Changes (M13 Must NOT)

- ❌ Modify any M0-M12 package
- ❌ Import React in i18n-runtime
- ❌ Load translations from network
- ❌ Execute code from locale files (no eval)
- ❌ Call provider APIs
- ❌ Access MCP tools
- ❌ Change Context Engine behavior

### What M13 MAY Do

- ✅ Create `packages/i18n-runtime/`
- ✅ Create locale JSON files
- ✅ Define types, interfaces, locale registry
- ✅ Implement fallback chain
- ✅ Implement event bus for locale changes
- ✅ Add React hook to desktop app (separate from i18n-runtime)
- ✅ Write 90 tests

---

## 6. Acceptance Criteria

| # | Criterion |
|---|---|
| 1 | `LocaleRegistry` supports add/get/list for `en` and `zh-CN` |
| 2 | `LocaleResolver` deterministically selects correct locale from preferences |
| 3 | Fallback chain: zh-TW → zh → en works correctly |
| 4 | Per-key fallback: missing key in zh-CN → returns en value |
| 5 | `t()` never returns undefined or blank for any registered key |
| 6 | `loadBundle()` loads JSON and merges into translation store |
| 7 | `setLocale()` triggers `onChange` handlers |
| 8 | `getLocalizedName/Description/Tags()` returns localized skill metadata |
| 9 | `exportBundles()/importBundles()` round-trips without data loss |
| 10 | Zero React imports in i18n-runtime package |
| 11 | Zero network requests or eval calls |
| 12 | 90+ tests passing |
| 13 | No regressions in existing 1070 tests |

---

## 7. Milestone Exit Criteria

M13 is complete when:

- [ ] Package `packages/i18n-runtime/` exists with locale files for en + zh-CN
- [ ] All acceptance criteria met
- [ ] Architecture review validated
- [ ] DEVLOG updated
- [ ] ADR-014 status updated to "Accepted"
- [ ] Production review passes
- [ ] PR merged to main
- [ ] No regressions in 1070 existing tests

---

*Implementation Plan — 2026-06-12*
