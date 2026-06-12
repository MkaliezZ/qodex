# Beta 2 — Anthropic Provider Implementation Plan

**Date:** 2026-06-12  
**Status:** Pre-Implementation  
**Depends On:** ADR-016, Beta 0 Production Review, Beta 1 E2E Review

---

## 1. Scope

| In Scope | Out of Scope |
|---|---|
| AnthropicProvider class | Tool calling support |
| Message format mapping | Vision/image input |
| SSE streaming parser | Structured output |
| Error normalization | Embeddings |
| Desktop dropdown + ProviderContext | Registry & Sync |
| 22 tests | M15-M18 |

---

## 2. Files to Create

```
packages/provider-sdk/src/providers/anthropic/
├── index.ts          # AnthropicProvider + createAnthropicProvider()
├── models.ts         # Default model list
├── mapper.ts         # ModelRequest → Anthropic Messages API
├── stream.ts         # Anthropic SSE parser
└── errors.ts         # Anthropic error normalization

packages/provider-sdk/tests/
└── anthropic.test.ts # Unit tests
```

---

## 3. Files to Modify

| File | Change |
|---|---|
| `provider-sdk/src/index.ts` | Export AnthropicProvider, createAnthropicProvider |
| `desktop/ProviderSettings.tsx` | Add `<option value="anthropic">Anthropic</option>` |
| `desktop/ProviderContext.tsx` | Add `case "anthropic"` |
| `desktop/e2e/provider-settings.spec.ts` | Update dropdown count |
| `desktop/e2e/env-real-provider.spec.ts` | Add Anthropic env-gated test |

---

## 4. AnthropicProvider Interface

```typescript
class AnthropicProvider implements ModelProvider {
  readonly id = "anthropic";
  readonly name = "Anthropic";
  readonly protocol: ProviderProtocol = "anthropic";

  constructor(opts: {
    apiKey?: string;
    baseUrl?: string;    // default: https://api.anthropic.com
    version?: string;    // default: 2023-06-01
  });

  setApiKey(key: string): void;
  async listModels(): Promise<ModelInfo[]>;
  stream(request: ModelRequest): AsyncIterable<ModelChunk>;
  async testConnection(): Promise<boolean>;
}
```

### stream() Flow

```
ModelRequest → mapToAnthropicRequest()
    ↓
fetch POST /v1/messages (x-api-key, anthropic-version)
    ↓
parseAnthropicSSE(response.body)
    ↓
yield ModelChunk { type: "text", text: "..." }
    ↓
yield ModelChunk { type: "usage", usage: {...} }
```

---

## 5. Test Plan

| Suite | Tests | Focus |
|---|---|---|
| Constructor + metadata | 2 | id, name, protocol, models |
| Message mapping | 4 | System→top-level, messages→roles, max_tokens default |
| Stream parsing | 4 | content_block_delta, message_stop, error events |
| Error normalization | 4 | 401/429/500/529 → ProviderError |
| listModels | 2 | Returns 4 Claude models |
| testConnection | 2 | Valid key → true, invalid → false |
| Edge cases | 3 | Empty messages, malformed SSE, network error |
| Desktop integration | 2 | Dropdown + ProviderContext |
| E2E env-gated | 1 | ANTHROPIC_API_KEY |
| **Total** | **~24** | |

---

## 6. Acceptance Criteria

| # | Criterion |
|---|---|
| 1 | AnthropicProvider implements ModelProvider interface |
| 2 | `stream()` yields text chunks from real Anthropic API |
| 3 | `listModels()` returns 4 Claude models |
| 4 | `testConnection()` works |
| 5 | Anthropic appears in desktop provider dropdown |
| 6 | ProviderContext creates AnthropicProvider correctly |
| 7 | Error normalization maps all 5 Anthropic error types |
| 8 | ~24 new tests passing |
| 9 | 1145 existing tests green |
| 10 | 27 mock-backed E2E tests green |
| 11 | Env-gated Anthropic E2E skips without key |

---

## 7. Forbidden

- ❌ Modify Agent Runtime
- ❌ Modify ModelProvider interface
- ❌ Modify existing providers
- ❌ Commit API keys
- ❌ Run real Anthropic tests in CI

---

*Implementation Plan — 2026-06-12*
