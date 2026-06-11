# ADR-002

**Status:** Accepted
**Date:** 2026-06-12

## Context

Qodex must support multiple AI model providers: OpenAI, DeepSeek, OpenRouter, and any OpenAI-compatible endpoint. Future support is planned for Claude, Gemini, Qwen, GLM, MiniMax, MiMo, Kimi, Grok, and Ollama. Each provider has different APIs, authentication, streaming formats, and error responses. The Agent Runtime must not depend on provider-specific code.

## Decision

Create a `ModelProvider` abstraction layer in `packages/provider-sdk/`:

```
ModelProvider (interface)
    ├── listModels(): Promise<ModelInfo[]>
    ├── stream(request): AsyncIterable<ModelChunk>
    └── testConnection(): Promise<boolean>
```

All providers are wrapped in `BaseOpenAICompatibleProvider`, which implements the OpenAI `/chat/completions` streaming protocol. Providers that share this wire format (DeepSeek, OpenRouter, Qwen, GLM, MiniMax, etc.) use the base class with different defaults.

Key abstractions:
- **ModelChunk** — Union type: `{ type: "text" | "tool_call" | "usage" | "error" }`. All providers emit identical chunks.
- **ProviderRegistry** — Central registry for provider registration and lookup. Agent Runtime has no direct provider dependencies.
- **ProviderError** — 6 canonical types: `auth_error`, `rate_limit`, `network_error`, `model_not_found`, `invalid_request`, `unknown`.

## Consequences

**Positive:**
- Provider-agnostic Agent Runtime — no switch/case on model type
- Adding a new provider is a single class implementation
- Unified error handling across all providers
- Streaming output format is identical regardless of upstream

**Negative:**
- Some provider-specific features (Claude's extended thinking, Gemini's native tool use) may not be fully representable
- The `openai-chat` protocol normalization may lose provider-specific metadata

## Alternatives Considered

1. **Direct provider integration in Agent Runtime**: Rejected — would couple runtime to each provider's API quirks.
2. **Multiple protocol adapters per provider**: Rejected — unnecessary complexity when 90% of providers share the OpenAI wire format.
3. **GraphQL-style unified API**: Rejected — over-engineering for the current requirement set.
