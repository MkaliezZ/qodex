/**
 * Qodex Provider SDK — Message Types
 *
 * Defines the canonical message format that all providers must
 * translate to/from. No provider-specific message schemas leak
 * beyond this boundary.
 */

/** A single message in a conversation */
export interface ModelMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
}

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
