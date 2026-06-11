/**
 * Qodex Provider SDK — Stream Chunk Types
 *
 * Unified chunk format for all streaming responses.
 * Every provider stream must be normalised into these atoms.
 */

/** A single event emitted during a streaming model response */
export type ModelChunk =
  | { type: "text"; text: string }
  | { type: "tool_call"; name: string; arguments: unknown }
  | { type: "usage"; inputTokens?: number; outputTokens?: number }
  | { type: "error"; message: string };
