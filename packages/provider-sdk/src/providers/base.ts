/**
 * Qodex Provider SDK — Base OpenAI-Compatible Provider
 *
 * Implements the OpenAI /chat/completions streaming protocol.
 * DeepSeek, OpenRouter, and most Chinese vendors use this exact wire format,
 * so they can instantiate this class with different defaults.
 *
 * Provider-specific quirks are isolated here; they never leak upward.
 */

import type { ModelProvider, ModelInfo, ProviderProtocol } from "../types/provider.js";
import type { ModelRequest, ModelMessage } from "../types/message.js";
import type { ModelChunk } from "../types/chunk.js";
import { httpRequest } from "../utils/index.js";
import { tryParseJSON } from "../utils/index.js";
import { errorFromException } from "../errors/index.js";
import type { ProviderError } from "../errors/index.js";

export interface BaseProviderOptions {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  protocol?: ProviderProtocol;
  defaultModels?: ModelInfo[];
}

/**
 * Base class for all OpenAI /chat/completions compatible providers.
 *
 * Override `listModels()` or provide `defaultModels` to customise.
 */
export class BaseOpenAICompatibleProvider implements ModelProvider {
  readonly id: string;
  readonly name: string;
  readonly protocol: ProviderProtocol;
  readonly baseUrl: string;

  protected apiKey?: string;
  protected defaultModels: ModelInfo[];

  constructor(options: BaseProviderOptions) {
    this.id = options.id;
    this.name = options.name;
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.protocol = options.protocol ?? "openai-chat";
    this.apiKey = options.apiKey;
    this.defaultModels = options.defaultModels ?? [];
  }

  /** Set or update the API key at runtime */
  setApiKey(key: string): void {
    this.apiKey = key;
  }

  async listModels(): Promise<ModelInfo[]> {
    if (this.defaultModels.length > 0) return this.defaultModels;

    try {
      const response = await httpRequest(`${this.baseUrl}/models`, {
        headers: this.authHeaders(),
      });
      const json = (await response.json()) as { data?: Array<{ id: string }> };
      return (json.data ?? []).map((m) => ({ id: m.id, displayName: m.id }));
    } catch {
      return this.defaultModels;
    }
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelChunk> {
    const body = {
      model: request.model,
      messages: request.messages,
      temperature: request.temperature ?? 0.2,
      max_tokens: request.maxTokens,
      stream: true,
    };

    try {
      const response = await httpRequest(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: this.authHeaders(),
        body,
      });

      const reader = response.body?.getReader();
      if (!reader) {
        yield { type: "error", message: "Response body is not readable" };
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let lines: string[] = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") return;

          const json = tryParseJSON(data);
          if (!json) continue;

          const delta = (json as any).choices?.[0]?.delta;
          if (!delta) continue;

          if (delta.content) {
            yield { type: "text", text: delta.content } as ModelChunk;
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls as Array<{ function?: { name?: string; arguments?: string } }>) {
              if (tc.function?.name) {
                yield {
                  type: "tool_call",
                  name: tc.function.name,
                  arguments: tryParseJSON(tc.function.arguments ?? "{}"),
                } as ModelChunk;
              }
            }
          }
        }
      }

      // Emit a usage chunk if present in the final non-empty line
      if (lines.length > 0) {
        const lastData = lines.filter((l) => l.startsWith("data: ")).pop();
        if (lastData) {
          const raw = lastData.slice(6).trim();
          if (raw && raw !== "[DONE]") {
            const parsed = tryParseJSON(raw) as Record<string, unknown> | undefined;
            const usage = (parsed as any)?.usage;
            if (usage) {
              yield {
                type: "usage",
                inputTokens: usage.prompt_tokens ?? usage.input_tokens,
                outputTokens: usage.completion_tokens ?? usage.output_tokens,
              } as ModelChunk;
            }
          }
        }
      }

    } catch (err) {
      // If already a ProviderError (thrown by httpRequest), use message directly
      const message = typeof (err as ProviderError)?.type === "string"
        ? (err as ProviderError).message
        : errorFromException(err).message;
      yield { type: "error", message };
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await httpRequest(`${this.baseUrl}/models`, {
        headers: this.authHeaders(),
      });
      return true;
    } catch {
      return false;
    }
  }

  /** Build auth header; API key is never logged */
  protected authHeaders(): Record<string, string> {
    return this.apiKey
      ? { Authorization: `Bearer ${this.apiKey}` }
      : {};
  }
}
