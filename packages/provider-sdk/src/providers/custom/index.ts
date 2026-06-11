import { BaseOpenAICompatibleProvider, type BaseProviderOptions } from "../base.js";
import type { ModelInfo } from "../../types/provider.js";
import type { ProviderProtocol } from "../../types/provider.js";

export interface CustomProviderOptions {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  protocol?: ProviderProtocol;
  models?: ModelInfo[];
}

/**
 * Custom OpenAI-compatible provider.
 *
 * Allows users to connect any service that speaks the OpenAI /chat/completions
 * protocol with a custom base URL, API key, and model list.
 */
export class CustomProvider extends BaseOpenAICompatibleProvider {
  constructor(options: CustomProviderOptions) {
    const opts: BaseProviderOptions = {
      id: options.id,
      name: options.name,
      baseUrl: options.baseUrl,
      apiKey: options.apiKey,
      protocol: options.protocol ?? "custom",
      defaultModels: options.models,
    };
    super(opts);
  }
}

/** Factory convenience */
export function createCustomProvider(options: CustomProviderOptions): CustomProvider {
  return new CustomProvider(options);
}
