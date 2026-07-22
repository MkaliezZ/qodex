/**
 * Qodex Provider SDK — Stream Chunk Types
 *
 * Unified chunk format for all streaming responses.
 * Every provider stream must be normalised into these atoms.
 */

/** A single event emitted during a streaming model response */
export type ModelChunk =
  | { type: "text"; text: string }
  | {
      type: "tool_call_delta";
      id: string;
      index: number;
      name?: string;
      argumentsDelta?: string;
    }
  | { type: "tool_call"; id: string; name: string; arguments: unknown }
  | {
      type: "tool_call_error";
      id?: string;
      index: number;
      name?: string;
      argumentsText: string;
      message: string;
    }
  | { type: "usage"; inputTokens?: number; outputTokens?: number }
  | { type: "error"; message: string };
