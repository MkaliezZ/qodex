/**
 * Qodex Provider SDK — Configuration Types
 *
 * User-facing provider configuration schema.
 * These types mirror the JSON Schema defined in docs/P3/01_API_CONTRACT.
 */

import type { ProviderType, ProviderProtocol, ModelInfo } from "./provider";

/** Full provider configuration stored per-provider */
export interface ProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  protocol: ProviderProtocol;
  baseUrl?: string | null;
  apiKeyRef?: string | null;
  defaultModel?: string | null;
  enabled: boolean;
}

/** Per-model override / metadata held alongside a provider */
export interface ModelConfig {
  modelId: string;
  displayName: string;
  providerId: string;
  temperature?: number;
  maxTokens?: number;
}

/** Payload for creating a new provider via registry */
export interface CreateProviderOptions {
  name: string;
  type: ProviderType;
  protocol: ProviderProtocol;
  baseUrl?: string;
  apiKey?: string;
  defaultModel?: string;
  models?: ModelInfo[];
}
