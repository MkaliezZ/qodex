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
import type { ModelMessage, ModelRequest, ModelTool } from "../types/message.js";
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
  readonly capabilities = { toolAgentLoop: true } as const;
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

  supportsAgentTools(_modelId: string): boolean {
    return this.capabilities.toolAgentLoop;
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelChunk> {
    const body = {
      model: request.model,
      messages: request.messages.map(toOpenAIMessage),
      ...(request.tools?.length
        ? { tools: request.tools.map(toOpenAITool), tool_choice: "auto" }
        : {}),
      temperature: request.temperature ?? 0.2,
      max_tokens: request.maxTokens,
      stream: true,
      stream_options: { include_usage: true },
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
      const pendingCalls = new Map<number, PendingToolCall>();

      const completePendingCalls = (): ModelChunk[] => {
        const completed: ModelChunk[] = [];
        for (const call of [...pendingCalls.values()].sort((left, right) => left.index - right.index)) {
          if (call.completed) continue;
          call.completed = true;
          if (!call.id || !call.name) {
            completed.push({
              type: "tool_call_error",
              id: call.id || undefined,
              index: call.index,
              name: call.name || undefined,
              argumentsText: call.argumentsText,
              message: "Completed tool call is missing a stable ID or function name.",
            });
            continue;
          }
          const parsedArguments = tryParseJSON(call.argumentsText || "{}");
          if (parsedArguments === undefined) {
            completed.push({
              type: "tool_call_error",
              id: call.id,
              index: call.index,
              name: call.name,
              argumentsText: call.argumentsText,
              message: "Completed tool call arguments are not valid JSON.",
            });
            continue;
          }
          completed.push({
            type: "tool_call",
            id: call.id,
            name: call.name,
            arguments: parsedArguments,
          });
        }
        return completed;
      };

      const parseEvent = (raw: string): ModelChunk[] => {
        const parsed = tryParseJSON(raw);
        if (!isRecord(parsed)) return [];

        if (isRecord(parsed.error)) {
          const message = typeof parsed.error.message === "string"
            ? parsed.error.message
            : "The provider returned an error during streaming.";
          pendingCalls.clear();
          return [{ type: "error", message }];
        }

        const chunks: ModelChunk[] = [];
        if (isRecord(parsed.usage)) {
          chunks.push({
            type: "usage",
            inputTokens: numberValue(parsed.usage.prompt_tokens) ?? numberValue(parsed.usage.input_tokens),
            outputTokens: numberValue(parsed.usage.completion_tokens) ?? numberValue(parsed.usage.output_tokens),
          });
        }

        const choices = Array.isArray(parsed.choices) ? parsed.choices : [];
        const choice = choices.find(isRecord);
        if (!choice) return chunks;
        const delta = isRecord(choice.delta) ? choice.delta : undefined;
        if (delta && typeof delta.content === "string" && delta.content.length > 0) {
          chunks.push({ type: "text", text: delta.content });
        }

        if (delta && Array.isArray(delta.tool_calls)) {
          delta.tool_calls.forEach((candidate, position) => {
            if (!isRecord(candidate)) return;
            const index = numberValue(candidate.index) ?? position;
            const existing = pendingCalls.get(index) ?? {
              index,
              id: "",
              name: "",
              argumentsText: "",
              completed: false,
            };
            if (typeof candidate.id === "string" && candidate.id.length > 0) {
              existing.id = candidate.id;
            }
            const fn = isRecord(candidate.function) ? candidate.function : undefined;
            const nameDelta = fn && typeof fn.name === "string" ? fn.name : undefined;
            const argumentsDelta = fn && typeof fn.arguments === "string" ? fn.arguments : undefined;
            if (nameDelta) existing.name += nameDelta;
            if (argumentsDelta) existing.argumentsText += argumentsDelta;
            pendingCalls.set(index, existing);
            chunks.push({
              type: "tool_call_delta",
              id: existing.id || `pending-tool-call-${index}`,
              index,
              ...(nameDelta ? { name: nameDelta } : {}),
              ...(argumentsDelta !== undefined ? { argumentsDelta } : {}),
            });
          });
        }

        if (choice.finish_reason === "tool_calls" || choice.finish_reason === "stop") {
          chunks.push(...completePendingCalls());
        }
        return chunks;
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const normalized = line.trimEnd();
          if (!normalized.startsWith("data:")) continue;
          const data = normalized.slice(5).trim();
          if (data === "[DONE]") {
            for (const chunk of completePendingCalls()) yield chunk;
            return;
          }
          for (const chunk of parseEvent(data)) yield chunk;
        }
      }

      buffer += decoder.decode();
      const trailing = buffer.trim();
      if (trailing.startsWith("data:")) {
        const data = trailing.slice(5).trim();
        if (data !== "[DONE]") {
          for (const chunk of parseEvent(data)) yield chunk;
        }
      }
      for (const chunk of completePendingCalls()) yield chunk;

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

interface PendingToolCall {
  index: number;
  id: string;
  name: string;
  argumentsText: string;
  completed: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toOpenAIMessage(message: ModelMessage): Record<string, unknown> {
  if (message.role === "assistant") {
    return {
      role: "assistant",
      content: message.content || null,
      ...(message.toolCalls?.length
        ? {
            tool_calls: message.toolCalls.map((call) => ({
              id: call.id,
              type: "function",
              function: {
                name: call.name,
                arguments: JSON.stringify(call.arguments ?? {}),
              },
            })),
          }
        : {}),
    };
  }
  if (message.role === "tool") {
    return {
      role: "tool",
      content: message.content,
      tool_call_id: message.toolCallId,
      ...(message.name ? { name: message.name } : {}),
    };
  }
  return { role: message.role, content: message.content };
}

function toOpenAITool(tool: ModelTool): Record<string, unknown> {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  };
}
