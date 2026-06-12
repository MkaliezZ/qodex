import type { ModelProvider, ModelInfo, ProviderProtocol } from "../../types/provider.js";
import type { ModelRequest } from "../../types/message.js";
import type { ModelChunk } from "../../types/chunk.js";
import { httpRequest } from "../../utils/index.js";
import { ANTHROPIC_MODELS } from "./models.js";
import { mapToAnthropicRequest } from "./mapper.js";
import { parseAnthropicSSE, mapSSEToChunks } from "./stream.js";
import { normalizeAnthropicError } from "./errors.js";

export interface AnthropicProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  version?: string;
}

export class AnthropicProvider implements ModelProvider {
  readonly id = "anthropic";
  readonly name = "Anthropic";
  readonly protocol: ProviderProtocol = "anthropic";

  private baseUrl: string;
  private version: string;
  private apiKey?: string;

  constructor(options: AnthropicProviderOptions = {}) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? "https://api.anthropic.com";
    this.version = options.version ?? "2023-06-01";
  }

  setApiKey(key: string): void { this.apiKey = key; }

  async listModels(): Promise<ModelInfo[]> { return ANTHROPIC_MODELS; }

  async testConnection(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const res = await httpRequest(`${this.baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": this.version,
          "Content-Type": "application/json",
        },
        body: { model: "claude-3-5-haiku-latest", max_tokens: 1, messages: [{ role: "user", content: "ping" }] },
      });
      return res.ok;
    } catch { return false; }
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelChunk> {
    if (!this.apiKey) throw new Error("API key not configured");

    const body = mapToAnthropicRequest(request);
    const response = await httpRequest(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": this.version,
        "Content-Type": "application/json",
      },
      body,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      const retryAfter = response.headers.get("Retry-After") ?? undefined;
      const err = normalizeAnthropicError(response.status, text, retryAfter);
      throw new Error(`${err.type}: ${err.message}`);
    }

    for await (const event of parseAnthropicSSE(response.body)) {
      const chunk = mapSSEToChunks(event, request.model);
      if (chunk) yield chunk;
    }
  }
}

export function createAnthropicProvider(apiKey?: string): AnthropicProvider {
  return new AnthropicProvider({ apiKey });
}
