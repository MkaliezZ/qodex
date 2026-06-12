/**
 * Qodex Provider SDK — Entry Point
 *
 * Re-exports all public interfaces, classes, and factory functions.
 * Consumers import from this single module:
 *
 *   import { ProviderRegistry, OpenAIProvider, type ModelChunk } from "@qodex/provider-sdk";
 */

// ── Types ────────────────────────────────────────────
export type {
  ProviderProtocol,
  ProviderType,
  ModelInfo,
  ModelProvider,
} from "./types/provider.js";

export type {
  ModelMessage,
  ModelTool,
  ModelRequest,
} from "./types/message.js";

export type {
  ModelChunk,
} from "./types/chunk.js";

export type {
  ProviderConfig,
  ModelConfig,
  CreateProviderOptions,
} from "./types/config.js";

// ── Errors ───────────────────────────────────────────
export type {
  ProviderErrorType,
  ProviderError,
} from "./errors/index.js";

export {
  errorFromHttpStatus,
  errorFromException,
  createError,
} from "./errors/index.js";

// ── Registry ─────────────────────────────────────────
export {
  ProviderRegistry,
  defaultRegistry,
} from "./registry/index.js";

// ── Streaming ────────────────────────────────────────
export {
  StreamManager,
} from "./streaming/index.js";
export type { StreamManagerOptions, ChunkParser } from "./streaming/index.js";

// ── Providers ────────────────────────────────────────
export {
  BaseOpenAICompatibleProvider,
} from "./providers/base.js";
export type { BaseProviderOptions } from "./providers/base.js";

export {
  OpenAIProvider,
  createOpenAIProvider,
} from "./providers/openai/index.js";

export {
  DeepSeekProvider,
  createDeepSeekProvider,
} from "./providers/deepseek/index.js";

export {
  OpenRouterProvider,
  createOpenRouterProvider,
} from "./providers/openrouter/index.js";

export {
  CustomProvider,
  createCustomProvider,
} from "./providers/custom/index.js";
export type { CustomProviderOptions } from "./providers/custom/index.js";

export {
  AnthropicProvider,
  createAnthropicProvider,
} from "./providers/anthropic/index.js";
export type { AnthropicProviderOptions } from "./providers/anthropic/index.js";

// ── Utils ────────────────────────────────────────────
export {
  httpRequest,
  parseSSEStream,
  tryParseJSON,
} from "./utils/index.js";
