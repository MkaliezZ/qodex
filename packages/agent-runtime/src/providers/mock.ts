/**
 * Qodex Agent Runtime — Mock Streaming Provider
 *
 * Generates streamed text chunks without API keys.
 * Used for testing the end-to-end execution flow.
 */

import type { ModelProvider, ModelInfo } from "@qodex/provider-sdk";
import type { ModelChunk } from "@qodex/provider-sdk";
import type { ModelRequest } from "@qodex/provider-sdk";

export interface MockProviderOptions {
  /** Chunks to emit (joined from defaults if empty) */
  chunks?: string[];
  /** Delay between chunks in ms */
  chunkDelayMs?: number;
}

const DEFAULT_CHUNKS = [
  "Hello",
  " from",
  " Qodex",
  " —",
  " the",
  " desktop-first",
  " multi-model",
  " agent",
  ".",
  "\n\n",
  "I can",
  " work with",
  " any",
  " model",
  " provider",
  " and",
  " understand",
  " your",
  " project",
  " context.",
  "\n\n",
  "This",
  " is a",
  " mock",
  " response",
  " for",
  " development",
  " and",
  " testing.",
];

const DEFAULT_MODELS: ModelInfo[] = [
  {
    id: "mock-model-1",
    displayName: "Mock Model 1",
    contextWindow: 128000,
    supportsTools: true,
  },
];

/**
 * MockStreamingProvider simulates a model provider by emitting
 * pre-defined text chunks with configurable delay.
 *
 * No API key required — purely for development and testing.
 */
export class MockStreamingProvider implements ModelProvider {
  readonly id = "mock";
  readonly name = "Mock Provider";
  readonly protocol = "openai-chat" as const;

  private chunks: string[];
  private chunkDelayMs: number;

  constructor(options: MockProviderOptions = {}) {
    this.chunks = options.chunks ?? DEFAULT_CHUNKS;
    this.chunkDelayMs = options.chunkDelayMs ?? 300;
  }

  async listModels(): Promise<ModelInfo[]> {
    return DEFAULT_MODELS;
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelChunk> {
    if (request.messages.length > 0) {
      const lastMsg = request.messages[request.messages.length - 1];
      if (lastMsg.role === "user") {
        yield { type: "text", text: `[Processing: "${lastMsg.content.slice(0, 40)}"]\n\n` };
      }
    }

    for (const chunk of this.chunks) {
      await sleep(this.chunkDelayMs);
      yield { type: "text", text: chunk } as ModelChunk;
    }
  }

  async testConnection(): Promise<boolean> {
    return true;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
