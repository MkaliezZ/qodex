# Beta 2.1 — Custom Provider Presets Architecture Review

**Date:** 2026-06-12  
**Status:** Pre-Implementation Review  
**Source:** ADR-016 — Provider Integration Strategy

---

## 1. Custom Provider Scope

### Current

Custom provider accepts any `baseUrl` + `apiKey` and uses OpenAI-compatible `/chat/completions`. Model list is hardcoded or empty.

### Proposed

Add preset metadata so common OpenAI-compatible providers are one-click. Add manual model input fallback for providers that don't support `/v1/models`.

### In Scope ✅

- Preset dropdown with auto-filled base URL
- Manual model ID input (always available)
- listModels() graceful failure — never blocks manual input
- Preset metadata: name + baseUrl + auth style + known models

### Out of Scope ❌

- Creating separate provider classes (MiniMaxProvider, etc.)
- Non-OpenAI-compatible protocols
- Embeddings, vision, structured output
- Secret persistence
- Registry publishing

---

## 2. Provider Preset Research

| Preset | Base URL | Auth | listModels | Streaming | Known Models | Risk | Include? |
|---|---|---|---|---|---|---|---|
| MiniMax | `https://api.minimax.io/v1` | Bearer | Needs verif. | Needs verif. | abab6.5s-chat | 🟡 Medium | ✅ Yes |
| Kimi/Moonshot | `https://api.moonshot.cn/v1` | Bearer | ✅ | ✅ | moonshot-v1-8k | 🟢 Low | ✅ Yes |
| Zhipu BigModel | `https://open.bigmodel.cn/api/paas/v4` | Bearer | Needs verif. | ✅ | glm-4-flash | 🟡 Medium | ✅ Yes |
| Z.AI (GLM) | `https://api.z.ai/api/paas/v4` | Bearer | Needs verif. | Needs verif. | glm-4 | 🟡 Medium | ✅ Yes |
| SiliconFlow | `https://api.siliconflow.cn/v1` | Bearer | ✅ | ✅ | Qwen/DeepSeek/etc | 🟢 Low | ✅ Yes |
| Qwen/DashScope | Needs verif. | Bearer | Needs verif. | Needs verif. | qwen-turbo | 🟡 Medium | ✅ Yes |

### Decision: Include All 6

All use OpenAI-compatible `/chat/completions`. All use `Bearer` auth. Base URLs are documented. Verifiability risk is low — if a provider breaks, user can manually enter a different base URL.

---

## 3. Manual Model Input Design

### Problem

Some providers don't support `/v1/models` or return unexpected formats. Users need a manual fallback.

### Design

```
Custom Provider UI:

┌─ Preset ──────────────┐
│ [Custom          ▼]    │  ← Dropdown: Custom | MiniMax | Kimi | Zhipu | ...
├─ Base URL ────────────┤
│ [https://...       ]  │  ← Auto-filled by preset, editable
├─ API Key ─────────────┤
│ [sk-...           ]   │  ← Masked
├─ Model ───────────────┤
│ [Manual model name ]  │  ← Always shown as text input
│  OR                    │
│ [Model dropdown  ▼]   │  ← Shown only if listModels() succeeds
│                        │
│  [Test Connection]     │
└────────────────────────┘
```

### Resolution Priority

```
1. Manual model input (if present) → used as model ID
2. Model dropdown (if listModels succeeded and user selected) → used
3. No model → first known model from preset metadata (fallback)
```

### listModels Failure

- Call `provider.listModels()` during connection test
- If it fails or returns empty: show warning "Model list unavailable. Enter model ID manually."
- Manual input remains editable and takes priority
- User is not blocked

---

## 4. Preset UI Design

### Desktop Changes

| File | Change |
|---|---|
| `ProviderSettings.tsx` | Add preset dropdown; always show manual model input |
| `ProviderContext.tsx` | Set baseUrl when preset changes |
| `presets.ts` (new) | Preset metadata array |

### Preset Metadata

```typescript
interface ProviderPreset {
  id: string;          // "minimax", "kimi", "zhipu"
  name: string;        // "MiniMax", "Kimi / Moonshot"
  baseUrl: string;     // "https://api.minimax.io/v1"
  knownModels: string[]; // ["abab6.5s-chat"]
}
```

Presets live in desktop (not SDK) — they are UI convenience metadata, not protocol definitions.

---

## 5. Provider SDK Impact

### Recommendation: Desktop-Only

Presets are UI metadata. CustomProvider already handles OpenAI-compatible protocols generically. No SDK changes needed.

| What | Where | Why |
|---|---|---|
| Preset metadata | Desktop `presets.ts` | UI convenience, not protocol |
| Model list fallback | Desktop `ProviderContext.tsx` | try/catch around listModels() |
| Manual model input | Desktop `ProviderSettings.tsx` | Always-shown text input |

**Zero Provider SDK changes. Zero Agent Runtime changes.**

---

## 6. Test Strategy

| Suite | Tests |
|---|---|
| Preset metadata validates base URLs | 3 |
| Preset selection fills base URL | 3 |
| Manual model input accepts value | 2 |
| Manual model used as defaultModelId | 2 |
| listModels failure → manual input survives | 2 |
| No API key exposure | 2 |
| Mock fallback preserved | 2 |
| E2E: Custom preset flow | 3 |
| E2E: Manual model flow | 2 |
| **Total** | **~21** |

---

## 7. Risk Matrix

| Risk | Severity | Mitigation |
|---|---|---|
| Provider changes endpoint | 🟢 Low | Base URL is editable |
| listModels() infinite hang | 🟡 Medium | Timeout wrapper in testConnection |
| Preset metadata stale | 🟢 Low | User can override; fields editable |
| Manual model ID typos | 🟢 Low | Provider returns clear error |

---

## 8. Recommendation

### ✅ READY FOR BETA 2.1 IMPLEMENTATION

| Metric | Value |
|---|---|
| Provider SDK changes | **0** |
| Agent Runtime changes | **0** |
| Desktop files new | 1 (`presets.ts`) |
| Desktop files modified | 2 |
| New tests | ~21 |
| Presets included | 6 |
| Security risk | None |

---

*Architecture Review — 2026-06-12*
