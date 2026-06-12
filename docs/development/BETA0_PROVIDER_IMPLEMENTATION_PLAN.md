# Beta 0 — Provider Integration Implementation Plan

**Date:** 2026-06-12  
**Status:** Pre-Implementation  
**Depends On:** ADR-016, Beta 0 Architecture Review

---

## 1. Implementation Scope

### In Scope

- ✅ Desktop `ProviderSettings` component (API key, provider select, model select, connection test)
- ✅ Real provider wiring in `useRuntime` hook
- ✅ Provider switching at runtime
- ✅ Streaming through real Provider SDK → Agent Runtime → Desktop UI
- ✅ Error recovery UX (invalid key, timeout, rate limit)
- ✅ API key security enforcement

### Out of Scope

- ❌ Anthropic provider (Beta 2)
- ❌ Secure storage (future Tauri integration)
- ❌ Provider SDK changes (already production-ready)
- ❌ Agent Runtime changes (existing injection pattern works)

---

## 2. Component Structure

```
apps/desktop/src/components/
├── ProviderSettings.tsx       ← NEW (container)
├── ProviderSelector.tsx       ← NEW (dropdown)
├── ApiKeyInput.tsx            ← NEW (masked input)
├── ModelSelector.tsx          ← NEW (dynamic from listModels)
├── ConnectionTest.tsx         ← NEW (test button)
├── ProviderContext.tsx         ← NEW (React context for provider state)
├── SettingsView.tsx           ← MODIFIED (add ProviderSettings)
└── PromptBar.tsx              ← MODIFIED (use real provider name)
```

---

## 3. Provider Context

```typescript
interface ProviderConfig {
  providerId: string | null;        // "openai" | "deepseek" | "openrouter" | "custom"
  apiKey: string | null;
  modelId: string | null;
  baseUrl?: string;                 // For custom provider
  connected: boolean;
  error?: string;
}

interface ProviderContextValue {
  config: ProviderConfig;
  setProvider: (id: string) => void;
  setApiKey: (key: string) => void;
  setModel: (id: string) => void;
  setBaseUrl: (url: string) => void;
  testConnection: () => Promise<boolean>;
  getProvider: () => ModelProvider | null;
}
```

---

## 4. useRuntime Integration

```typescript
// Modified useRuntime hook
function useRuntime() {
  const { config } = useProviderContext();

  const provider = useMemo(() => {
    if (!config.apiKey || !config.providerId) return null;
    return createProvider(config.providerId, config.apiKey, config.baseUrl);
  }, [config]);

  const runtimeRef = useRef<AgentRuntime>(
    new AgentRuntime(provider ? {
      providers: new Map([[provider.id, provider]]),
      defaultProviderId: provider.id,
      defaultModelId: config.modelId ?? undefined,
    } : undefined)
  );

  // Update runtime when provider changes
  useEffect(() => {
    if (provider) {
      runtimeRef.current = new AgentRuntime({
        providers: new Map([[provider.id, provider]]),
        defaultProviderId: provider.id,
        defaultModelId: config.modelId ?? undefined,
      });
    }
  }, [provider, config.modelId]);

  // Rest of hook unchanged...
}
```

---

## 5. Test Plan

| Suite | Tests | Location |
|---|---|---|
| ProviderSettings render | 4 | `apps/desktop/tests/` |
| ApiKeyInput mask/unmask | 3 | `apps/desktop/tests/` |
| Provider creation (all 4) | 4 | `packages/provider-sdk/tests/` |
| Connection test flow | 4 | `apps/desktop/tests/` |
| Provider switching | 3 | `apps/desktop/tests/` |
| Real OpenAI streaming | 4 | `tests/e2e/` (env-gated) |
| Real DeepSeek streaming | 4 | `tests/e2e/` (env-gated) |
| Bad API key → error | 3 | `apps/desktop/tests/` |
| Timeout recovery | 2 | `apps/desktop/tests/` |
| API key not in DOM after blur | 2 | `apps/desktop/tests/` |
| **Total** | **33** | |

---

## 6. Forbidden Changes

- ❌ Modify Provider SDK (already production-ready)
- ❌ Modify Agent Runtime architecture
- ❌ Modify any M0–M14 runtime package
- ❌ Hardcode API keys
- ❌ Log API keys
- ❌ Serialize API keys
- ❌ Commit API keys to git

---

## 7. Acceptance Criteria

| # | Criterion |
|---|---|
| 1 | User can select provider from dropdown (OpenAI/DeepSeek/OpenRouter/Custom) |
| 2 | User can enter API key (masked, show/hide toggle) |
| 3 | User can test connection → success/error feedback |
| 4 | User can select model from listModels() dropdown |
| 5 | Real provider sends real API calls (no more mock responses) |
| 6 | Streaming response renders in AgentTimeline |
| 7 | Invalid API key shows clear error message |
| 8 | Provider switching works at runtime |
| 9 | API key never appears in logs, DOM, or serialized state |
| 10 | ~33 tests passing |

---

## 8. Milestone Exit Criteria

- [ ] ProviderSettings component complete
- [ ] Real provider wired into Agent Runtime
- [ ] Streaming renders in desktop UI
- [ ] Provider switching works
- [ ] Error recovery UX implemented
- [ ] All acceptance criteria met
- [ ] ADR-016 accepted
- [ ] No regressions in existing 1145 tests
- [ ] Qodex produces **real AI responses** for the first time

---

*Implementation Plan — 2026-06-12*
