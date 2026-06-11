/**
 * Qodex Provider SDK — Core Provider Types
 *
 * Defines the provider abstraction that all model integrations must implement.
 * Every future provider (OpenAI, DeepSeek, Claude, Gemini, Ollama, custom)
 * plugs in through these interfaces.
 */

/** Supported provider wire protocols */
export type ProviderProtocol =
  | "openai-chat"
  | "openai-responses"
  | "anthropic"
  | "gemini"
  | "ollama"
  | "custom";

/** Provider type identifier for configuration and registry */
export type ProviderType =
  | "openai"
  | "deepseek"
  | "openrouter"
  | "anthropic"
  | "gemini"
  | "qwen"
  | "glm"
  | "minimax"
  | "mimo"
  | "kimi"
  | "grok"
  | "ollama"
  | "custom";

/**
 * Model metadata returned by listModels().
 * Varies by provider; unknown fields should be omitted rather than guessed.
 */
export interface ModelInfo {
  id: string;
  displayName: string;
  contextWindow?: number;
  supportsTools?: boolean;
  supportsVision?: boolean;
  supportsReasoning?: boolean;
}

/**
 * Core provider interface.
 *
 * Every model provider, whether native or aggregator, must conform
 * to this interface. The Agent Runtime (M3) depends solely on this
 * abstraction and knows nothing about provider-specific wire formats.
 */
export interface ModelProvider {
  /** Stable identifier, e.g. "openai", "deepseek", "my-custom-vendor" */
  id: string;
  /** Human-readable name for UI display */
  name: string;
  /** Wire protocol used by this provider */
  protocol: ProviderProtocol;
  /** Fetch available models (may return hardcoded defaults) */
  listModels(): Promise<ModelInfo[]>;
  /**
   * Stream a model response as an async iterable of ModelChunk.
   *
   * Each chunk is either:
   * - a text delta
   * - a tool_call signal
   * - a usage summary (typically the last chunk)
   * - an error
   */
  stream(request: ModelRequest): AsyncIterable<ModelChunk>;
  /** Quick connectivity / auth check */
  testConnection(): Promise<boolean>;
}
