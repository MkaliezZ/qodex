/**
 * Qodex Provider SDK — Message Types
 *
 * Defines the canonical message format that all providers must
 * translate to/from. No provider-specific message schemas leak
 * beyond this boundary.
 */

/** A completed provider-neutral tool request. */
export interface ModelToolCall {
  id: string;
  name: string;
  arguments: unknown;
}

export interface ModelTextMessage {
  role: "system" | "user";
  content: string;
}

export interface ModelAssistantMessage {
  role: "assistant";
  content: string;
  toolCalls?: ModelToolCall[];
}

export interface ModelToolResultMessage {
  role: "tool";
  content: string;
  toolCallId: string;
  name?: string;
}

/** Canonical conversation history used by every provider adapter. */
export type ModelMessage =
  | ModelTextMessage
  | ModelAssistantMessage
  | ModelToolResultMessage;

/** Tool definition passed alongside the message list */
export interface ModelTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Complete request sent to a provider.
 *
 * `model` and `messages` are required; everything else is optional
 * with provider-specific fallback behaviour.
 */
export interface ModelRequest {
  model: string;
  messages: ModelMessage[];
  tools?: ModelTool[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  metadata?: Record<string, unknown>;
}
