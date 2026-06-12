# Beta 2 — Anthropic Provider Architecture Review

**Date:** 2026-06-12  
**Status:** Pre-Implementation Review  
**Source:** ADR-016 — Provider Integration Strategy (Section: Anthropic Provider P1)

---

## 1. Existing Provider SDK Review

### Current Providers

| Provider | Extends | Protocol | Stream Method |
|---|---|---|---|
| OpenAI | `BaseOpenAICompatibleProvider` | openai-chat | SSE `/chat/completions` |
| DeepSeek | `BaseOpenAICompatibleProvider` | openai-chat | SSE `/chat/completions` |
| OpenRouter | `BaseOpenAICompatibleProvider` | openai-chat | SSE `/chat/completions` |
| Custom | `BaseOpenAICompatibleProvider` | custom | SSE `/chat/completions` |

### What Anthropic Can Reuse

| Component | Reusable | Notes |
|---|---|---|
| `ModelProvider` interface | ✅ | `AnthropicProvider` implements same interface |
| `ModelInfo` type | ✅ | Same shape |
| `ProviderError` types | ✅ | Same error taxonomy |
| `BaseOpenAICompatibleProvider` | ❌ | Different wire protocol — cannot extend |
| `httpRequest()` utility | ✅ | Same fetch wrapper |
| `tryParseJSON()` | ✅ | Same JSON helper |
| `errorFromHttpStatus()` | ✅ | Same HTTP error mapping |

### What Requires New Implementation

| Component | New | Notes |
|---|---|---|
| AnthropicProvider class | ✅ | Implements `ModelProvider` directly |
| Message format mapping | ✅ | `/v1/messages` format vs `/chat/completions` |
| SSE stream parser | ✅ | Different event types |
| Auth header handling | ✅ | `x-api-key` vs `Authorization: Bearer` |
| `stream()` implementation | ✅ | Custom SSE loop |

---

## 2. Anthropic Protocol — Compatibility Matrix

| Area | OpenAI-compatible | Anthropic | Impact |
|---|---|---|---|
| **Endpoint** | `POST /v1/chat/completions` | `POST /v1/messages` | New URL path |
| **Auth header** | `Authorization: Bearer $KEY` | `x-api-key: $KEY` | Custom header |
| **Required header** | None | `anthropic-version: 2023-06-01` | Always set |
| **System prompt** | In messages[0] role=system | Top-level `system` param | Structural difference |
| **Messages** | `[{role, content}]` | `{role, content}` | Similar shape, different nesting |
| **max_tokens** | Optional | **Required** | Must default to reasonable value |
| **Model IDs** | `gpt-4o`, `deepseek-chat` | `claude-sonnet-4-20250514` | Different naming |
| **Stream events** | `data: {"choices":[{"delta":...}]}` | `event: content_block_delta\ndata: {"delta":{"text":"..."}}` | Different SSE format |
| **Tool calling** | `tools: [{type:"function","function":{...}}]` | Different schema | Defer to future |
| **Error format** | `{"error":{"message":"..."}}` | `{"error":{"type":"...","message":"..."}}` | Minor mapping |
| **Rate limit** | `429` with `Retry-After` | `429` with `Retry-After` | Same |
| **Overloaded** | None | `529` | Anthropic-specific |

---

## 3. Anthropic Provider Design

### Package Structure

```
packages/provider-sdk/src/providers/anthropic/
├── index.ts                 # AnthropicProvider class + factory
├── models.ts                # Default model list
├── mapper.ts                # ModelRequest → Anthropic Messages API
├── stream.ts                # Anthropic SSE parser
└── errors.ts                # Anthropic error normalization
```

### AnthropicProvider

```typescript
export class AnthropicProvider implements ModelProvider {
  readonly id = "anthropic";
  readonly name = "Anthropic";
  readonly protocol: ProviderProtocol = "anthropic";

  constructor(options: {
    apiKey?: string;
    baseUrl?: string;      // default: https://api.anthropic.com
    version?: string;      // default: 2023-06-01
  });

  // ModelProvider implementation
  async listModels(): Promise<ModelInfo[]>;
  stream(request: ModelRequest): AsyncIterable<ModelChunk>;
  async testConnection(): Promise<boolean>;
  setApiKey(key: string): void;
}
```

### Default Models

| ID | Display Name | Context Window |
|---|---|---|
| `claude-sonnet-4-20250514` | Claude Sonnet 4 | 200K |
| `claude-3-5-sonnet-latest` | Claude 3.5 Sonnet | 200K |
| `claude-3-opus-latest` | Claude 3 Opus | 200K |
| `claude-3-5-haiku-latest` | Claude 3.5 Haiku | 200K |

---

## 4. Message Mapping

| Qodex ModelRequest | Anthropic Messages API |
|---|---|
| `model` | `model` |
| `temperature` | `temperature` |
| `maxTokens` or default 4096 | `max_tokens` (required) |
| `messages[]` with `{role:"system", content}` | `system` (top-level, not in messages) |
| `messages[]` with `{role:"user", content}` | `messages[].role: "user"` |
| `messages[]` with `{role:"assistant", content}` | `messages[].role: "assistant"` |
| `stream: true` | `stream: true` |
| `tools[]` | **Deferred** — not in Beta 2 |
| `response_format` | **Deferred** — not in Beta 2 |

---

## 5. Streaming Strategy

### Anthropic SSE Events

| Event | Maps To |
|---|---|
| `message_start` | — (metadata, no text) |
| `content_block_start` | — (block metadata) |
| `content_block_delta` | `ModelChunk { type: "text", text }` |
| `content_block_stop` | — (block complete) |
| `message_delta` | — (usage metadata) |
| `message_stop` | `ModelChunk { type: "usage", usage }` |
| `error` | Error chunk |

### Streaming Implementation

```typescript
async *stream(request: ModelRequest): AsyncIterable<ModelChunk> {
  const body = mapToAnthropicRequest(request);
  const response = await httpRequest(`${this.baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "x-api-key": this.apiKey!,
      "anthropic-version": this.version,
      "Content-Type": "application/json",
    },
    body,
  });

  // Anthropic SSE uses named events, not just `data:`
  for await (const event of parseAnthropicSSE(response.body)) {
    if (event.type === "content_block_delta") {
      yield { type: "text", text: event.delta.text, model: request.model };
    }
    if (event.type === "message_stop") {
      yield { type: "usage", usage: event.usage, model: request.model };
    }
  }
}
```

**No Agent Runtime changes.** Output format identical to existing providers.

---

## 6. Error Handling

| Anthropic Error | Qodex Error |
|---|---|
| `401` + `{"error":{"type":"authentication_error"}}` | `ProviderError { type: "unauthorized" }` |
| `429` + `Retry-After` | `ProviderError { type: "rate_limited", retryAfter }` |
| `500` + error | `ProviderError { type: "provider_error" }` |
| `529` (overloaded) | `ProviderError { type: "overloaded", retryAfter }` |
| Network error | `ProviderError { type: "network_error" }` |
| Malformed SSE | `ProviderError { type: "stream_error" }` |

---

## 7. Desktop Integration

### Changes Required

| File | Change | Impact |
|---|---|---|
| `ProviderSettings.tsx` | Add `<option value="anthropic">Anthropic</option>` | +1 line |
| `ProviderContext.tsx` | Add `case "anthropic": return new AnthropicProvider(...)` | +1 case |
| `env-real-provider.spec.ts` | Add Anthropic env-gated test | +1 test |
| `provider-settings.spec.ts` | Update option count: 5→6 | +1 assertion |

**Total: ~4 lines across 3 files. Minimal.**

---

## 8. Testing Strategy

| Suite | Tests |
|---|---|
| Anthropic request mapping | 4 |
| Anthropic stream parsing | 4 |
| Anthropic error normalization | 4 |
| Anthropic model list | 2 |
| Anthropic authentication | 2 |
| Anthropic edge cases (empty, malformed) | 3 |
| Desktop dropdown inclusion | 1 |
| Desktop ProviderContext creation | 1 |
| E2E env-gated (skipped in CI) | 1 |
| **Total** | **~22** |

---

## 9. Security

All existing rules maintained:

- ✅ API key memory-only
- ✅ No persistence
- ✅ No logging
- ✅ No serialization
- ✅ No .env committed
- ✅ No new execution paths

---

## 10. Recommendation

### ✅ READY FOR BETA 2 IMPLEMENTATION

| Metric | Value |
|---|---|
| Protocol complexity | Medium |
| Provider SDK files | 5 new |
| Desktop files modified | 2 |
| New tests | ~22 |
| Agent Runtime changes | **0** |
| Desktop UI redesign | **0** |
| Security risk | **None** |
| Blockers | **None** |

---

*Architecture Review — 2026-06-12*
