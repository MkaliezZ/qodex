import { BaseOpenAICompatibleProvider, type BaseProviderOptions } from "../base.js";

export type OpenRouterProviderOptions = {
  apiKey?: string;
};

/**
 * OpenRouter provider — aggregator that routes to many models.
 *
 * Protocol: openai-chat
 * Base URL: https://openrouter.ai/api/v1
 *
 * Models are fetched dynamically from the /models endpoint;
 * no hardcoded defaults since OpenRouter's catalogue grows constantly.
 */
export class OpenRouterProvider extends BaseOpenAICompatibleProvider {
  constructor(options: OpenRouterProviderOptions = {}) {
    const opts: BaseProviderOptions = {
      id: "openrouter",
      name: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: options.apiKey,
    };
    super(opts);
  }
}

/** Factory convenience */
export function createOpenRouterProvider(apiKey?: string): OpenRouterProvider {
  return new OpenRouterProvider({ apiKey });
}
