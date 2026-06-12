# Beta 0 — Provider Integration Architecture Review

**Date:** 2026-06-12  
**Status:** Pre-Implementation Review  
**Source:** ADR-016 — Provider Integration Strategy

---

## 1. End-to-End Provider Flow

### Current (Mock)

```
Desktop → AgentRuntime (MockStreamingProvider) → Mock response
```

### Target (Real)

```
Desktop → ProviderSettings → AgentRuntime(OpenAIProvider{apiKey}) → fetch() → api.openai.com → SSE stream
```

### Integration Points

| Point | Current | Target |
|---|---|---|
| Provider creation | `new MockStreamingProvider()` | User-selected real provider |
| API key | Not used | From desktop credential UI |
| Model selection | Hardcoded "DeepSeek V4 Pro" | From `provider.listModels()` |
| Streaming | Mock `setInterval` chunks | Real `fetch + SSE` parsing |
| Error handling | Never fails (mock) | HTTP errors, rate limits, timeouts |

---

## 2. Provider SDK Audit

Provider SDK confirmed production-ready. Zero architectural changes required.

| Provider | Real HTTP | SSE Stream | Error Handled | Capabilities |
|---|---|---|---|---|
| OpenAI | ✅ | ✅ | ✅ | 4 models, tools, vision |
| DeepSeek | ✅ | ✅ | ✅ | 2 models, tools, reasoning |
| OpenRouter | ✅ | ✅ | ✅ | Dynamic models |
| Custom | ✅ | ✅ | ✅ | User-defined |

**No SDK changes needed.** The SDK is already at production quality.

---

## 3. Agent Runtime Integration Design

### Current Injection Point

```typescript
// agent-runtime/src/runtime.ts (simplified)
class AgentRuntime {
  constructor(options?: {
    providers?: Map<string, ModelProvider>;
    defaultProviderId?: string;
    defaultModelId?: string;
  });
}
```

The Agent Runtime already accepts `ModelProvider` instances. The gap is that **nobody passes them in** — the mock provider is used as a default.

### Target Pattern

```typescript
// Desktop hook
const provider = useMemo(() => {
  if (!settings.apiKey || !settings.providerId) return null;
  return createProvider(settings.providerId, settings.apiKey);
}, [settings.apiKey, settings.providerId]);

const runtime = useMemo(() => {
  if (!provider) return new AgentRuntime(); // mock fallback
  return new AgentRuntime({
    providers: new Map([[provider.id, provider]]),
    defaultProviderId: provider.id,
    defaultModelId: settings.modelId,
  });
}, [provider, settings.modelId]);
```

**No Agent Runtime changes required.** The existing `ModelProvider` injection pattern works.

---

## 4. Desktop Configuration Architecture

### Component Structure

```
SettingsView
├── ProviderSettings          ← NEW
│   ├── ProviderSelector      ← Dropdown: OpenAI | DeepSeek | OpenRouter | Custom
│   ├── ApiKeyInput           ← Password-style input + show/hide
│   ├── ModelSelector         ← Populated from listModels()
│   ├── ConnectionTestButton  ← "Test Connection" → success/error
│   └── CustomUrlInput        ← For Custom provider only
├── Theme                     ← Existing
├── Language                  ← Existing
└── Version                   ← Existing
```

### Component Placement

Provider settings are part of the existing `SettingsView` — accessed via the sidebar Settings navigation. No new top-level UI needed.

---

## 5. API Key Security

### Enforced at Every Layer

| Layer | Enforcement |
|---|---|
| **Desktop input** | Masked `type="password"`, show/hide toggle |
| **Desktop memory** | Stored in React state only; not persisted |
| **Agent Runtime** | Received via constructor; never stored on disk |
| **Provider SDK** | Held in-memory for `Authorization: Bearer` header |
| **Logging** | Console filter strips `apiKey` pattern |
| **Git** | `.gitignore` blocks `.env` files |
| **Checkpoints** | Git Runtime excludes provider config from index |
| **Serialization** | Never serialized; no JSON persistence |
| **Future** | Tauri `secrets` API or Keychain integration |

---

## 6. Streaming Pipeline

### Current (broken)

```
Provider SDK → real SSE parser → ✅
Agent Runtime → not receiving real stream → ❌
Desktop Timeline → renders mock chunks → ❌
```

### Fixed

```
Provider SDK → real SSE → parseSSEStream() yields chunks
    ↓
Agent Runtime → message.chunk events
    ↓
Desktop AgentTimeline → renders streamed text
    ↓
Agent Workspace → real AI response visible
```

No architecture changes. Just wire the real provider into the existing pipeline.

---

## 7. Error Recovery

| Error | User Sees | Recovery |
|---|---|---|
| Invalid API key | "Invalid API key. Please check your credentials." | Re-enter key |
| Provider unavailable (503) | "Provider is temporarily unavailable. Try again." | Retry button |
| Rate limited (429) | "Rate limit reached. Retrying in X seconds." | Auto-retry with backoff |
| Network timeout | "Connection timed out. Check your network." | Retry or switch provider |
| Malformed response | "Unexpected response from provider." | Log + retry |
| Provider switch mid-session | (no-op — new prompts use new provider) | N/A |

---

## 8. Anthropic Gap

| Area | Effort | Notes |
|---|---|---|
| Wire protocol | Medium | Anthropic uses `POST /v1/messages`, not `/chat/completions` |
| Message format | Low | System + messages[] similar to OpenAI |
| Streaming | Low | Also SSE, different event names |
| Auth | Low | `x-api-key` header instead of `Bearer` |
| Models | Low | Claude 3.5 Sonnet, Claude 3 Opus |
| Tools | Medium | Different tool schema |
| Total | **~2 days** | Not included in Beta 0 |

---

## 9. E2E Test Strategy

| Suite | Tests | Env Vars |
|---|---|---|
| Provider creation + auth | 6 | `OPENAI_API_KEY` |
| Real streaming (short prompt) | 6 | `OPENAI_API_KEY` |
| Provider switching | 4 | Multiple keys |
| Error handling (bad key) | 4 | None |
| Rate limit behavior | 2 | None (mocked) |
| Desktop credential flow | 8 | None |
| Connection test | 4 | `OPENAI_API_KEY` |
| **Total** | **34** | |

All E2E tests gated behind env vars. Never run in CI (cost control). Skipped when keys absent.

---

## 10. Risk Matrix

| Risk | Severity | Mitigation |
|---|---|---|
| API key leak in client | 🔴 High | Session-only memory; future secure store |
| Provider outage blocks all use | 🟡 Medium | Provider switching; fallback chain |
| Rate limit surprises | 🟡 Medium | Retry-after handling; user awareness |
| Real streaming latency feels slow | 🟢 Low | Existing streaming UI already designed for this |

---

## 11. Recommendation

### ✅ READY for Beta 0 implementation

**Effort:** ~2 days  
**Expected tests:** ~34  
**User impact:** **Transformational** — Qodex becomes actually usable  
**Architecture changes:** **Zero** — SDK and Agent Runtime already support this pattern  
**Blockers:** None

---

*Architecture Review — 2026-06-12*
