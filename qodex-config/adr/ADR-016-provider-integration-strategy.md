# ADR-016 — Provider Integration Strategy

- **Status:** Proposed
- **Date:** 2026-06-12
- **Depends on:** ADR-002 — Provider Model Abstraction

---

## Context

The Qodex Provider SDK (M2) is structurally production-ready for 4 OpenAI-compatible providers (OpenAI, DeepSeek, OpenRouter, Custom). It uses real `fetch()` with real SSE streaming, HTTP error handling, and typed model definitions.

However, the Alpha Completion Report identified Provider Integration as **Grade C** due to the perception that all providers were mock-based. A deep audit reveals the SDK is actually **Grade B+** — the gap is in integration, not implementation.

The real issues are:

1. **No desktop credential UI** — ModelSwitcher says "Provider configuration coming soon"
2. **No API key management strategy** — keys only via constructor injection
3. **No Anthropic (Claude) provider** — missing entirely
4. **No E2E verification** — zero tests with real API keys
5. **Agent Runtime uses mock provider** — the hook, not the SDK

This ADR defines the strategy for closing these gaps before Beta.

---

## Problem

Current integration chain:

```
Desktop UI (hardcoded provider name)
    ↓
Agent Runtime (mock provider)
    ↓
Provider SDK (real HTTP — but never called)
```

Users cannot configure API keys. The desktop shows "Provider configuration coming soon." The agent always returns mock responses. The real HTTP layer exists but is unreachable from the user's perspective.

**Without fixing this, Qodex cannot actually do anything.** It's a beautiful architecture with no electricity.

---

## Decision

### Phase 1: Desktop Credential UI (P0)

**Implement in `apps/desktop/src/components/`:**

- `ProviderSettings.tsx` — API key input, provider selection, model selection
- `ApiKeyInput.tsx` — Masked password-style input with show/hide toggle
- `ConnectionTest.tsx` — "Test Connection" button with loading/error states

**Flow:**

```
Settings → Provider Settings
    ↓
Select Provider (OpenAI | DeepSeek | OpenRouter | Custom)
    ↓
Enter API Key → "Test Connection" → ✅ Connected
    ↓
Select Model (dropdown from listModels())
    ↓
Save → stored in memory (future: secure storage)
```

### Phase 2: API Key Management (P0)

**Strategy:** Session-only in-memory storage with future Tauri secure store.

| Storage | M13 (now) | Future |
|---|---|---|
| Constructor injection | ✅ | ✅ |
| Environment variables | ✅ | ✅ |
| Desktop secure store | ❌ | ✅ (Tauri `secrets` API) |
| Keychain/Keyring | ❌ | ✅ (OS-native) |
| Local file | ❌ | Never |

**Rules:**
- Never log API keys
- Never serialize API keys to JSON
- Never include API keys in git checkpoints
- Never display API keys unmasked after initial entry
- Keys exist only in memory for the session lifetime

### Phase 3: Agent Runtime Integration (P0)

**Replace mock provider with real provider in `useRuntime.ts`:**

```typescript
// Current (mock)
const runtimeRef = useRef<AgentRuntime>(new AgentRuntime());

// Target (real)
const provider = new OpenAIProvider({ apiKey: userProvidedKey });
const runtimeRef = useRef<AgentRuntime>(new AgentRuntime({ provider }));
```

### Phase 4: Anthropic Provider (P1)

**Implement `packages/provider-sdk/src/providers/anthropic/`:**

Anthropic uses a different wire protocol than OpenAI (`/v1/messages` vs `/chat/completions`). This requires:

```typescript
export class AnthropicProvider implements ModelProvider {
  protocol: "anthropic";
  // Different message format: system, messages[], max_tokens
  // Different streaming: server-sent events with different event types
  // Different auth: x-api-key header + anthropic-version
}
```

### Phase 5: E2E Verification (P2)

**Integration tests with real API keys (opt-in, env-var gated):**

```bash
OPENAI_API_KEY=sk-... pnpm test:e2e
```

Tests are skipped when env vars are absent. Never committed or CI-gated.

---

## Security Model

### API Key Lifecycle

```
User enters key → stored in memory → used for provider calls
                    ↓
            session ends → key destroyed
```

### Constraints

| Rule | Enforcement |
|---|---|
| Never in source code | Code review |
| Never in git | `.gitignore` for `.env` files |
| Never in logs | Logger filter for `apiKey` pattern |
| Never in serialization | `toJSON()` override that strips keys |
| Never in checkpoints | Git Runtime excludes configuration |
| Never displayed after entry | UI masking |
| Never cross-session | In-memory only (until secure storage) |

---

## Streaming Strategy

The Provider SDK already implements real SSE streaming. The strategy is:

1. Agent Runtime calls `provider.stream(request)`
2. SDK opens `fetch()` with `Accept: text/event-stream`
3. `parseSSEStream()` yields chunks as async iterable
4. Agent Runtime emits `message.chunk` events
5. Desktop UI renders streaming text in AgentTimeline

**No changes to the streaming architecture.** The SDK is correct. The gap is that the mock provider never exercises this path.

---

## Capability Negotiation

### Model Discovery

```
Desktop UI requests models
    ↓
ProviderRegistry.getProvider(id)
    ↓
provider.listModels() → HTTP GET /models (or hardcoded)
    ↓
Desktop renders ModelSelect dropdown
```

### Provider Switching

```
User switches from DeepSeek → OpenAI
    ↓
Desktop creates new provider instance with stored key
    ↓
Agent Runtime receives new provider
    ↓
Next prompt uses new provider
```

---

## Rollout Plan

| Phase | Deliverable | Tests | Integration Gate |
|---|---|---|---|
| **P0.1** | ProviderSettings UI component | 8 | Can enter key, select provider |
| **P0.2** | API key management | 6 | Key injected, never leaked |
| **P0.3** | Real Agent Runtime integration | 10 | Real API call succeeds |
| **P1** | Anthropic provider | 8 | Claude model responds |
| **P2** | E2E verification | 6 | Real-key tests (optional) |

**Total: ~38 new tests. Zero existing test regression.**

---

## Consequences

### Benefits

- Qodex becomes **actually usable** — real AI responses
- Credential UI closes the biggest UX gap
- Anthropic provider expands model coverage
- E2E tests validate the full user flow
- API key security model is defined and enforceable

### Tradeoffs

- Desktop code changes required (not isolated to a package)
- API key management adds security surface
- Anthropic requires a new protocol implementation
- Real API calls add latency and cost to testing

---

## Recommendation

### ✅ APPROVE — Provider Integration as Priority #1 before M15

**Rationale:**

Without real provider integration, Qodex is an architectural demo, not a usable tool. The SDK is ready — the gap is a thin integration layer. Fixing this should be the first Beta milestone.

**Revised milestone order:**

```
Beta 0: Provider Integration (this ADR)
Beta 1: Desktop E2E Tests
Beta 2: Anthropic Provider
M15:   Registry & Sync
M16:   MCP Marketplace
```

---

## Decision Outcome

**Proposed.** Recommended as the first Beta milestone before M15.
