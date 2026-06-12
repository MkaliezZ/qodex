# Beta 2.1 — Custom Provider Presets Implementation Plan

**Date:** 2026-06-12  
**Status:** Pre-Implementation  
**Depends On:** Beta 2 Production Review

---

## 1. Scope

| In Scope | Out of Scope |
|---|---|
| 6 preset one-click configurations | Separate provider classes |
| Manual model ID input | Non-OpenAI-compatible protocols |
| listModels() graceful failure | Embeddings/vision/structured output |
| Desktop-only metadata | Provider SDK changes |

---

## 2. Preset Metadata

```typescript
// apps/desktop/src/components/presets.ts
export const PROVIDER_PRESETS = [
  { id: "custom", name: "Custom", baseUrl: "", knownModels: [] },
  { id: "minimax", name: "MiniMax", baseUrl: "https://api.minimax.io/v1", knownModels: ["abab6.5s-chat"] },
  { id: "kimi", name: "Kimi / Moonshot", baseUrl: "https://api.moonshot.cn/v1", knownModels: ["moonshot-v1-8k"] },
  { id: "zhipu", name: "Zhipu BigModel", baseUrl: "https://open.bigmodel.cn/api/paas/v4", knownModels: ["glm-4-flash"] },
  { id: "zai", name: "Z.AI (GLM)", baseUrl: "https://api.z.ai/api/paas/v4", knownModels: ["glm-4"] },
  { id: "siliconflow", name: "SiliconFlow", baseUrl: "https://api.siliconflow.cn/v1", knownModels: ["deepseek-ai/DeepSeek-V3"] },
  { id: "qwen", name: "Qwen / DashScope", baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", knownModels: ["qwen-turbo"] },
];
```

---

## 3. Files

### New

```
apps/desktop/src/components/presets.ts
```

### Modified

| File | Change |
|---|---|
| `ProviderSettings.tsx` | Add preset dropdown + manual model input |
| `ProviderContext.tsx` | Set baseUrl on preset change; manualModelId handling |
| `e2e/provider-settings.spec.ts` | Update dropdown count + manual model tests |

---

## 4. ProviderSettings Changes

When custom provider selected, show:

```
[Preset dropdown]      ← Selects preset → auto-fills baseUrl
[Base URL input]       ← Pre-filled from preset, editable
[API Key input]        ← Same as current
[Model text input]     ← Always shown for custom provider
[Model dropdown]       ← Shown only if listModels() succeeds
[Test Connection]      ← Same as current
```

Manual model input always takes priority over model dropdown.

---

## 5. Test Plan

| Suite | Tests |
|---|---|
| Preset base URLs correct | 3 |
| Preset select fills baseUrl | 3 |
| Manual model input visible for custom | 2 |
| Manual model value used | 2 |
| listModels fail → manual still works | 2 |
| No API key exposure | 2 |
| Mock fallback preserved | 2 |
| E2E custom+mock | 3 |
| E2E manual model flow | 2 |
| **Total** | **~21** |

---

## 6. Forbidden

- ❌ Modify Provider SDK
- ❌ Modify Agent Runtime
- ❌ Create new provider classes
- ❌ Persist API keys
- ❌ Commit .env

---

## 7. Acceptance Criteria

| # | Criterion |
|---|---|
| 1 | 6 presets available in custom provider dropdown |
| 2 | Selecting preset auto-fills base URL |
| 3 | Manual model input always visible for custom provider |
| 4 | Manual model takes priority when provided |
| 5 | listModels failure does not block manual input |
| 6 | ~21 tests passing |
| 7 | No regressions |

---

*Implementation Plan — 2026-06-12*
