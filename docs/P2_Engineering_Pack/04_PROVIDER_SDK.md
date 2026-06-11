# Qodex Provider SDK

## Purpose

The Provider SDK lets Qodex support many models through a unified interface.

## TypeScript Interfaces

```ts
export type ProviderProtocol =
  | "openai-chat"
  | "openai-responses"
  | "anthropic"
  | "gemini"
  | "ollama"
  | "custom";

export interface ModelMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
}

export interface ModelTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ModelRequest {
  model: string;
  messages: ModelMessage[];
  tools?: ModelTool[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  metadata?: Record<string, unknown>;
}

export type ModelChunk =
  | { type: "text"; text: string }
  | { type: "tool_call"; name: string; arguments: unknown }
  | { type: "usage"; inputTokens?: number; outputTokens?: number }
  | { type: "error"; message: string };

export interface ModelProvider {
  id: string;
  name: string;
  protocol: ProviderProtocol;
  listModels(): Promise<ModelInfo[]>;
  stream(request: ModelRequest): AsyncIterable<ModelChunk>;
  testConnection(): Promise<boolean>;
}

export interface ModelInfo {
  id: string;
  displayName: string;
  contextWindow?: number;
  supportsTools?: boolean;
  supportsVision?: boolean;
  supportsReasoning?: boolean;
}
```

## MVP Providers

### OpenAI

- protocol: `openai-responses`
- supports streaming
- supports tool calling

### DeepSeek

- protocol: `openai-chat`
- base URL configurable
- model examples:
  - deepseek-chat
  - deepseek-reasoner

### OpenRouter

- protocol: `openai-chat`
- model list dynamic

### Custom Provider

Required fields:

- name
- base URL
- API key
- model name
- protocol

## China Model Support

Native adapters should be added after MVP for:

- Qwen
- GLM / Z.AI
- MiniMax
- Xiaomi MiMo
- Moonshot Kimi
- Tencent Hunyuan
- Baichuan
- StepFun

## Provider Rules

1. Provider errors must be normalized.
2. Usage must be tracked when available.
3. API keys must never be included in logs.
4. Provider-specific quirks must not leak into Agent Runtime.
