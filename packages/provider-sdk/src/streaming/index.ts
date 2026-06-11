/**
 * Qodex Provider SDK — Stream Manager
 *
 * Normalises streaming output from any provider into a uniform
 * AsyncIterable<ModelChunk>.
 *
 * The stream manager handles:
 *  - Chunk conversion (provider-native → ModelChunk)
 *  - Cancellation via AbortSignal
 *  - Graceful error wrapping
 */

import type { ModelChunk } from "../types/chunk.js";
import type { ProviderError } from "../errors/index.js";
import { createError } from "../errors/index.js";

/** Callback signature for provider-specific chunk parsing */
export type ChunkParser = (raw: string) => ModelChunk | ModelChunk[] | null;

/** Options for creating a managed stream */
export interface StreamManagerOptions {
  parser: ChunkParser;
  signal?: AbortSignal;
}

/**
 * StreamManager wraps a raw SSE byte stream with a chunk parser.
 *
 * Usage:
 * ```ts
 * const managed = new StreamManager({ parser: openaiChunkParser });
 * for await (const chunk of managed.run(reader)) { ... }
 * ```
 */
export class StreamManager {
  private parser: ChunkParser;
  private signal?: AbortSignal;

  constructor(options: StreamManagerOptions) {
    this.parser = options.parser;
    this.signal = options.signal;
  }

  /**
   * Consume a byte stream reader and yield normalised ModelChunks.
   *
   * Catches parse errors gracefully (yields an error chunk instead of crashing)
   * and respects the AbortSignal for cancellation.
   */
  async *run(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    abortSignal?: AbortSignal,
  ): AsyncGenerator<ModelChunk, void, undefined> {
    const signal = abortSignal ?? this.signal;
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        if (signal?.aborted) {
          yield { type: "text", text: "" };
          return;
        }

        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") return;

          const parsed = this.parser(data);
          if (parsed === null) continue;
          if (Array.isArray(parsed)) {
            for (const chunk of parsed) yield chunk;
          } else {
            yield parsed;
          }
        }
      }

      // Flush remaining
      if (buffer.startsWith("data: ")) {
        const data = buffer.slice(6).trim();
        if (data !== "[DONE]") {
          const parsed = this.parser(data);
          if (parsed) {
            if (Array.isArray(parsed)) {
              for (const chunk of parsed) yield chunk;
            } else {
              yield parsed;
            }
          }
        }
      }
    } catch (err) {
      const error = err as ProviderError;
      yield { type: "error", message: error.message ?? String(err) };
    }
  }
}
