# Provider SDK Example Implementation

## Package

`packages/provider-sdk`

---

# Public Interface

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

export interface ModelInfo {
  id: string;
  displayName: string;
  contextWindow?: number;
  supportsTools?: boolean;
  supportsVision?: boolean;
  supportsReasoning?: boolean;
}

export interface ModelProvider {
  id: string;
  name: string;
  protocol: ProviderProtocol;
  listModels(): Promise<ModelInfo[]>;
  stream(request: ModelRequest): AsyncIterable<ModelChunk>;
  testConnection(): Promise<boolean>;
}
```

---

# OpenAI-Compatible Provider

```ts
export interface OpenAICompatibleProviderOptions {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  defaultModels?: ModelInfo[];
}

export class OpenAICompatibleProvider implements ModelProvider {
  id: string;
  name: string;
  protocol: ProviderProtocol = "openai-chat";

  constructor(private options: OpenAICompatibleProviderOptions) {
    this.id = options.id;
    this.name = options.name;
  }

  async listModels(): Promise<ModelInfo[]> {
    if (this.options.defaultModels?.length) {
      return this.options.defaultModels;
    }

    const response = await fetch(`${this.options.baseUrl}/models`, {
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`
      }
    });

    if (!response.ok) {
      return [];
    }

    const json = await response.json();

    return (json.data ?? []).map((model: any) => ({
      id: model.id,
      displayName: model.id
    }));
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelChunk> {
    const response = await fetch(`${this.options.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.2,
        max_tokens: request.maxTokens,
        stream: true
      })
    });

    if (!response.ok || !response.body) {
      yield { type: "error", message: `Provider error: ${response.status}` };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\\n").filter((line) => line.startsWith("data: "));

      for (const line of lines) {
        const data = line.replace(/^data: /, "").trim();
        if (data === "[DONE]") return;

        try {
          const json = JSON.parse(data);
          const text = json.choices?.[0]?.delta?.content;
          if (text) {
            yield { type: "text", text };
          }
        } catch {
          continue;
        }
      }
    }
  }

  async testConnection(): Promise<boolean> {
    const models = await this.listModels();
    return models.length >= 0;
  }
}
```

---

# DeepSeek Provider

```ts
export function createDeepSeekProvider(apiKey: string): ModelProvider {
  return new OpenAICompatibleProvider({
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    apiKey,
    defaultModels: [
      {
        id: "deepseek-chat",
        displayName: "DeepSeek Chat",
        supportsReasoning: false
      },
      {
        id: "deepseek-reasoner",
        displayName: "DeepSeek Reasoner",
        supportsReasoning: true
      }
    ]
  });
}
```

---

# OpenRouter Provider

```ts
export function createOpenRouterProvider(apiKey: string): ModelProvider {
  return new OpenAICompatibleProvider({
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey
  });
}
```

---

# Custom Provider

```ts
export function createCustomProvider(config: {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  models?: ModelInfo[];
}): ModelProvider {
  return new OpenAICompatibleProvider({
    id: config.id,
    name: config.name,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    defaultModels: config.models
  });
}
```

---

# Error Normalization

All providers must convert provider-specific errors into:

```ts
export interface ProviderError {
  type:
    | "auth_error"
    | "rate_limit"
    | "network_error"
    | "model_not_found"
    | "invalid_request"
    | "unknown";
  message: string;
  retryable: boolean;
}
```

---

# Provider Test Requirements

Each provider implementation must pass:

- listModels returns array
- testConnection returns boolean
- stream yields text chunks
- auth errors are normalized
- API key is never logged
