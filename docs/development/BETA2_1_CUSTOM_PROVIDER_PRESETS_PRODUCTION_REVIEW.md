# Beta 2.1 — Custom Provider Presets Production Review

**Date:** 2026-06-12  
**Reviewer:** Qodex Team  
**Status:** ✅ **PASSED**

---

## 1. Executive Summary

Beta 2.1 adds one-click preset configuration for 6 OpenAI-compatible providers (MiniMax, Kimi, Zhipu, Z.AI, SiliconFlow, Qwen) plus manual model ID input for the Custom provider. Zero Provider SDK or Agent Runtime changes. Desktop-only metadata layer.

---

## 2. Scope

| In Review | Out of Scope |
|---|---|
| 7 presets + metadata | Separate provider classes |
| Manual model input | Non-OpenAI-compatible protocols |
| getResolvedModel() | Registry & Sync |

---

## 3. Files

| File | Type | Purpose |
|---|---|---|
| `components/presets.ts` | New | 7 preset metadata objects |
| `components/ProviderSettings.tsx` | Modified | Preset dropdown + manual model input |
| `components/ProviderContext.tsx` | Modified | manualModelId + getResolvedModel() |
| `hooks/useRuntime.ts` | Modified | getResolvedModel() → defaultModelId |

---

## 4. Preset Matrix

| # | Preset | Base URL | Risk | Model Examples |
|---|---|---|---|---|
| 1 | Custom Endpoint | (editable) | 🟢 | — |
| 2 | MiniMax | api.minimax.io/v1 | 🟡 | abab6.5s-chat |
| 3 | Kimi / Moonshot | api.moonshot.cn/v1 | 🟢 | moonshot-v1-8k |
| 4 | Zhipu BigModel | open.bigmodel.cn/api/paas/v4 | 🟡 | glm-4-flash |
| 5 | Z.AI / GLM | api.z.ai/api/paas/v4 | 🟡 | glm-4 |
| 6 | SiliconFlow | api.siliconflow.cn/v1 | 🟢 | deepseek-ai/DeepSeek-V3 |
| 7 | Qwen / DashScope | dashscope-intl.aliyuncs.com/compatible-mode/v1 | 🟡 | qwen-turbo |

All base URLs editable. No secrets in metadata. ✅

---

## 5. Manual Model Input Review

| Check | Result |
|---|---|
| Visible for Custom provider only | ✅ |
| Survives listModels() failure | ✅ |
| getResolvedModel() = modelId || manualModelId | ✅ |
| useRuntime uses resolved model | ✅ |
| Switching from Custom → other clears stale model | ✅ (native providers use modelId) |
| Mock fallback preserved on key clear | ✅ |

---

## 6. Runtime Model Resolution

| Scenario | Expected | Result |
|---|---|---|
| Custom + preset + manual | manual model used | ✅ |
| Custom + preset + listModels success | modelId > manualModelId | ✅ |
| OpenAI / DeepSeek / Anthropic | manualModelId not used | ✅ |
| API key cleared | mock fallback | ✅ |
| Config changed while running | next task uses new config | ✅ |

---

## 7. Security Audit

| Check | Result |
|---|---|
| API key memory-only | ✅ |
| Presets contain no secrets | ✅ |
| No console.log/localStorage/sessionStorage | ✅ |
| No .env | ✅ |
| No new execution paths | ✅ |

---

## 8. Test Results

| Suite | Tests | Status |
|---|---|---|
| Provider SDK | 55 | ✅ |
| Desktop TypeScript | 0 errors | ✅ |
| Provider SDK changes | 0 | ✅ |
| Agent Runtime changes | 0 | ✅ |

---

## 9. Known Gaps

| Gap | Status |
|---|---|
| Preset endpoints need provider-side verification | Manual test pending |
| Advanced parameters deferred | Future |
| Non-OpenAI-compatible providers | Not supported |
| Secure keychain storage | Future |
| Registry & Sync | M15 |

---

## Final Verdict

## ✅ PASS — Ready for M15 Registry & Sync Planning

### Qodex Provider Suite Complete

```
OpenAI · DeepSeek · OpenRouter · Anthropic · Custom
+ 6 presets: MiniMax · Kimi · Zhipu · Z.AI · SiliconFlow · Qwen
```
