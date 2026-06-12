# ADR-014 — Internationalization Runtime & Localization System

- **Status:** Accepted
- **Date:** 2026-06-12
- **Depends on:** None

---

## Context

Qodex currently provides bilingual documentation (English and Chinese) via manually synchronized README files. The desktop UI contains hardcoded English strings. Runtime messages, empty states, error messages, and skill metadata are all embedded directly in source code with no localization infrastructure.

Current localization is entirely manual: `README.md` and `README.zh-CN.md` must be synchronized by hand. This approach does not scale.

Future milestones and public adoption require:

- Multi-language desktop UI
- Localized skills (name, description, tags)
- Localized documentation generation
- Localized runtime messages (errors, warnings, notifications)
- Localized onboarding and empty states
- Addition of new locales without code changes

A dedicated internationalization runtime is required to centralize locale management and eliminate translation drift.

---

## Problem

**Current localization model:**

```
English files ← manual sync → Chinese files
```

**Problems:**

- **Duplicated content** — every user-facing string exists in at least two places
- **Translation drift** — English and Chinese versions diverge over time
- **Maintenance burden** — adding a string requires updating every locale file
- **Inconsistent terminology** — no central glossary or key registry
- **Future language expansion** — adding Japanese, Korean, or French requires touching every file
- **Hardcoded strings** — runtime packages embed user-facing text directly in source code

A centralized localization architecture is required to unify all user-facing text under a single, deterministic resolution system.

---

## Decision

Introduce **Internationalization Runtime** as a new package:

**Package:** `packages/i18n-runtime`

The Internationalization Runtime serves as the single source of truth for all user-facing text in Qodex. It provides a locale registry, fallback resolution, translation key management, and typed access to localized strings across the desktop UI, skill runtime, context engine, and future packages.

---

## Responsibilities

### Internationalization Runtime Owns ✅

| Concern | Description |
|---|---|
| **Locale registry** | Enumerate supported locales and their metadata |
| **Translation loading** | Load locale files from `locales/<locale>/` directories |
| **Locale switching** | Change active locale at runtime without restart |
| **Fallback resolution** | Deterministic fallback chain: user → project → system → default (en) |
| **Localized runtime messages** | Error messages, warnings, notifications keyed by locale |
| **Translation key management** | Typed key registry preventing key typos and missing translations |
| **Namespace support** | Group keys by domain (app, runtime, skills, errors) |

### Internationalization Runtime Does NOT Own ❌

| Concern | Delegated To |
|---|---|
| UI rendering | Desktop shell (React) |
| Skill execution | Skill Runtime |
| Agent execution | Agent Runtime |
| Provider calls | Provider SDK |
| File translation (automated) | Future M15 Localization Tooling |
| Translation generation (AI) | Future M15 |
| Documentation generation | Future M16 |

---

## Supported Locales

### M13 Initial Locales

| Locale | Language | Region |
|---|---|---|
| `en` | English | — |
| `zh-CN` | Chinese | Simplified |

### Future Candidates

| Locale | Language | Priority |
|---|---|---|
| `ja` | Japanese | High |
| `ko` | Korean | Medium |
| `fr` | French | Medium |
| `de` | German | Low |
| `es` | Spanish | Low |

Adding a locale should require only adding locale files — no code changes.

---

## Locale Resolution

### Resolution Order

```
1. User Preference     (desktop setting)
2. Project Preference  (per-project override)
3. System Locale       (OS-detected)
4. Default Locale      (en)
```

Resolution is **deterministic** — given the same inputs, the same locale is always selected. No randomness, no network requests.

### Resolution API

```typescript
interface LocaleResolver {
  resolve(preferences: {
    user?: string;
    project?: string;
    system?: string;
  }): string;
}
```

---

## Translation Model

### Translation Keys

All user-facing text uses typed translation keys. No raw strings in runtime code.

**Key format:** `namespace.component.field`

**Examples:**

| Key | English | Chinese |
|---|---|---|
| `app.title` | Qodex | Qodex |
| `sidebar.files` | Files | 文件 |
| `sidebar.sessions` | Sessions | 会话 |
| `sidebar.skills` | Skills | 技能 |
| `sidebar.git` | Git | Git |
| `sidebar.settings` | Settings | 设置 |
| `prompt.placeholder` | Ask Qodex to modify your project... | 请描述要修改的内容... |
| `empty.no_project` | No project opened | 未打开项目 |
| `empty.no_session` | Session history coming soon | 会话历史即将推出 |
| `error.project_not_found` | Project not found | 找不到项目 |
| `notification.graph_completed` | Execution completed | 执行完成 |

### Anti-Pattern (Forbidden)

```typescript
// ❌ Hardcoded — never do this
button.text = "Run";
error.message = "Project not found";

// ✅ Key-based — always do this
button.text = t("action.run");
error.message = t("error.project_not_found");
```

---

## Fallback Chain

### Region → Language → Default

```
Request: zh-TW (Taiwanese Mandarin)
    ↓
1. zh-TW locale file       → Not found
    ↓
2. zh locale file          → Not found
    ↓
3. en locale file (default) → Found — rendered
```

**Rule:** If a specific region locale is missing, fall back to the language-level locale, then to the default (`en`). Never render `undefined` or a blank string.

### Per-Key Fallback

If a translation key exists in `en` but not in the requested locale, the English value is used. This ensures new features can ship without blocking on translations.

---

## Runtime Messages

Future runtime packages (agent-runtime, context-engine, diff-engine) should **emit translation keys** rather than hardcoded English strings.

**Example:**

```typescript
// ❌ Current (hardcoded)
throw new Error("Project not found");

// ✅ M13+ (key-based)
throw new LocalizedError("error.project_not_found");
```

The desktop UI intercepts localized errors, resolves the key through the i18n runtime, and renders the appropriate localized message.

---

## Locale File Structure

```
locales/
├── en/
│   ├── app.json          # Sidebar, prompt, actions
│   ├── runtime.json      # Error messages, status text
│   └── skills.json       # Skill names, descriptions
│
├── zh-CN/
│   ├── app.json
│   ├── runtime.json
│   └── skills.json
│
└── (future locales...)
│   ├── ja/
│   ├── ko/
│   └── fr/
```

**Adding a locale = adding a directory with 3 JSON files.** No code changes required.

### File Format

```json
{
  "sidebar": {
    "files": "Files",
    "sessions": "Sessions",
    "skills": "Skills",
    "git": "Git",
    "settings": "Settings"
  },
  "action": {
    "run": "Run",
    "cancel": "Cancel"
  }
}
```

Flat key-value maps within namespaced sections. No nested interpolation in M13.

---

## Skill Localization

Skills may declare localized metadata:

```typescript
interface LocalizedSkill {
  key: string;
  names: Record<string, string>;       // locale → name
  descriptions: Record<string, string>; // locale → description
  tags: Record<string, string[]>;      // locale → tag list
}
```

The Skill Runtime queries the i18n runtime for the active locale and renders the appropriate name, description, and tags.

---

## Desktop UI Localization

All desktop UI strings that are currently hardcoded must become translation keys:

| Current Hardcoded | Replacement Key |
|---|---|
| "Files" | `sidebar.files` |
| "Sessions" | `sidebar.sessions` |
| "Skills" | `sidebar.skills` |
| "Git" | `sidebar.git` |
| "Settings" | `sidebar.settings` |
| "No project opened" | `empty.no_project` |
| "Session history coming soon" | `empty.no_session` |
| "Ask Qodex to modify..." | `prompt.placeholder` |
| "Run" | `action.run` |
| "Type a prompt and click Run" | `empty.agent_workspace` |

This is a separate implementation phase within M13, not an ADR-level decision.

---

## Security Constraints

The Internationalization Runtime **MUST NOT:**

- Execute code from locale files (JSON parse only, no eval)
- Load remote translations (local filesystem only)
- Download locale packs from network
- Call provider APIs
- Access MCP tools
- Bypass any permission gate

Locale loading is **local-only** and **static**. All locale files ship with the application.

---

## Relationship to Existing Packages

```
Desktop UI  ──→  i18n Runtime  ←──  Skill Runtime
                    │
                    ├── Condition Engine (keys, not strings)
                    ├── Error messages (LocalizedError)
                    └── Notifications (key-based)
```

No runtime package should hardcode user-facing strings after M13 adoption. The i18n runtime is the single source of truth for all visible text.

---

## Consequences

### Benefits

- **Scalable localization** — new locales added by adding JSON files
- **Consistent terminology** — single key registry prevents drift
- **Deterministic resolution** — same input always produces same locale
- **Type-safe keys** — TypeScript catches missing keys at compile time
- **Maintainable documentation** — docs consume the same locale files
- **Future-proof** — runtime messages remain locale-agnostic in code

### Tradeoffs

- **Translation maintenance** — each locale file must be kept in sync
- **Locale validation** — must verify all keys exist in all supported locales
- **Additional runtime package** — 12th package in the monorepo
- **Migration effort** — hardcoded strings in desktop UI must be extracted
- **Initial setup cost** — locale file structure must be designed carefully

---

## Related ADRs

- ADR-001 — Monorepo Architecture
- ADR-011 — Internationalization (bilingual README)
- ADR-012 — Planning & Execution Runtime
- ADR-013 — Execution Graph Runtime

---

## Future Work

| Milestone | Description |
|---|---|
| M13 | Internationalization Runtime (this ADR) |
| M14 | Marketplace Foundation |
| M15 | Localization Tooling (auto-sync, glossary) |
| M16 | Documentation Generation |

---

## Decision Outcome

**Accepted.** Implemented in M13 — Internationalization Runtime & Localization System (35 tests, 35/35 passing, cross-package total 1105).
