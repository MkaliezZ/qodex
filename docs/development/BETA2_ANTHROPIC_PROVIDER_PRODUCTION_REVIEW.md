# Beta 2 — Anthropic Provider Production Review

**Date:** 2026-06-12  
**Reviewer:** Qodex Team  
**Status:** ✅ **PASSED**

---

## 1. Executive Summary

Beta 2 adds full Anthropic (Claude) provider support to Qodex. The `AnthropicProvider` implements `ModelProvider` directly (not extending `BaseOpenAICompatibleProvider`) with a custom `/v1/messages` mapper, named SSE event parser, and error normalization. 20 new unit tests added. Zero Agent Runtime, ModelProvider interface, or existing provider changes.

---

## 2. Scope

| In Review | Out of Scope |
|---|---|
| AnthropicProvider (5 files) | Anthropic tool calling |
| Message mapping | Vision/image input |
| SSE streaming | Structured output |
| Error normalization | Embeddings |
| Desktop integration (3 lines) | Registry & Sync |

---

## 3. Files Created (6)

| File | Purpose |
|---|---|
| `providers/anthropic/index.ts` | AnthropicProvider class + factory |
| `providers/anthropic/models.ts` | 4 Claude model definitions |
| `providers/anthropic/mapper.ts` | ModelRequest → Anthropic Messages API |
| `providers/anthropic/stream.ts` | Named SSE parser + chunk mapper |
| `providers/anthropic/errors.ts` | 5 error type normalizations |
| `tests/anthropic.test.ts` | 20 unit tests |

## 4. Files Modified (4)

| File | Change | Lines |
|---|---|---|
| `provider-sdk/src/index.ts` | Export AnthropicProvider | +5 |
| `desktop/ProviderSettings.tsx` | Add Anthropic option | +1 |
| `desktop/ProviderContext.tsx` | Add Anthropic case | +2 |
| `desktop/e2e/env-real-provider.spec.ts` | Add env-gated Anthropic test | +15 |

---

## 5. Provider SDK Review

| Check | Result |
|---|---|
| Implements ModelProvider directly | ✅ (not extending BaseOpenAICompatibleProvider) |
| id = "anthropic", name = "Anthropic" | ✅ |
| protocol = "anthropic" | ✅ |
| POST /v1/messages | ✅ |
| x-api-key header | ✅ |
| anthropic-version: 2023-06-01 | ✅ |
| Default baseUrl: api.anthropic.com | ✅ |
| 4 Claude models | ✅ |
| testConnection() valid | ✅ |

---

## 6. Message Mapping Review

| Check | Result |
|---|---|
| model → model | ✅ |
| temperature → temperature | ✅ |
| max_tokens default 4096 | ✅ |
| maxTokens → max_tokens | ✅ |
| System → top-level system | ✅ |
| Multiple system messages joined | ✅ `\n\n` separator |
| User → messages[] role:user | ✅ |
| Assistant → messages[] role:assistant | ✅ |
| Empty messages → safe default | ✅ |
| API key not in body | ✅ |

---

## 7. Streaming Review

| Check | Result |
|---|---|
| content_block_delta → text chunk | ✅ |
| message_stop → usage chunk | ✅ |
| Metadata events ignored | ✅ |
| Malformed SSE throws stream_error | ✅ |
| Error event throws ProviderError | ✅ |
| Chunk order preserved | ✅ |
| Compatible with AgentRuntime | ✅ (ModelChunk format unchanged) |

---

## 8. Error Normalization Review

| HTTP | Anthropic Error | Qodex Type | Result |
|---|---|---|---|
| 400 | invalid_request_error | invalid_request | ✅ |
| 401 | authentication_error | unauthorized | ✅ |
| 403 | permission_error | forbidden | ✅ |
| 404 | not_found_error | not_found | ✅ |
| 429 | rate_limit_error | rate_limited | ✅ + Retry-After |
| 500 | api_error | provider_error | ✅ |
| 529 | overloaded_error | overloaded | ✅ + Retry-After |

---

## 9. Desktop Integration Review

| Check | Result |
|---|---|
| Anthropic in dropdown | ✅ |
| ProviderContext creates AnthropicProvider | ✅ |
| Existing providers unaffected | ✅ |
| No UI redesign | ✅ |

---

## 10. Security Audit

| Check | Result |
|---|---|
| API key memory-only | ✅ |
| No console.log/JSON.stringify | ✅ |
| No localStorage/sessionStorage | ✅ |
| No .env committed | ✅ |
| No new execution paths | ✅ |

---

## 11. Test Results

| Suite | Tests | Status |
|---|---|---|
| Anthropic unit | 20 | ✅ |
| Provider SDK total | 55 | ✅ |
| Cross-package total | 1165 | ✅ |
| Agent Runtime changes | 0 | ✅ |
| ModelProvider changes | 0 | ✅ |
| Existing provider changes | 0 | ✅ |

---

## 12. Known Gaps

| Gap | Status | Target |
|---|---|---|
| Anthropic tool calling | Deferred | Future |
| Vision/image input | Deferred | Future |
| Structured output | Deferred | Future |
| Embeddings | Deferred | Future |
| Real Anthropic API key verification | Pending | Manual test |
| Registry & Sync | Not started | M15 |

---

## Final Verdict

## ✅ PASS — Ready for M15 Registry & Sync Planning

**Qodex now supports 5 providers: OpenAI, DeepSeek, OpenRouter, Anthropic, Custom.**

| 提交 |
|---|
| `41c4d85` — `feat(provider-sdk): add Anthropic provider support` |
