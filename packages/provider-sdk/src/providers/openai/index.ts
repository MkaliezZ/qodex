import { BaseOpenAICompatibleProvider, type BaseProviderOptions } from "../base.js";
import type { ModelInfo } from "../../types/provider.js";

const DEFAULT_MODELS: ModelInfo[] = [
  { id: "gpt-4o", displayName: "GPT-4o", contextWindow: 128000, supportsTools: true, supportsVision: true },
  { id: "gpt-4o-mini", displayName: "GPT-4o Mini", contextWindow: 128000, supportsTools: true, supportsVision: true },
  { id: "gpt-4.5-preview", displayName: "GPT-4.5 Preview", contextWindow: 128000, supportsTools: true },
  { id: "o3-mini", displayName: "o3 Mini", contextWindow: 200000, supportsTools: true, supportsReasoning: true },
];

export type OpenAIProviderOptions = {
  apiKey?: string;
};

/**
 * OpenAI provider.
 *
 * protocol: openai-chat
 * base URL: https://api.openai.com/v1
 */
export class OpenAIProvider extends BaseOpenAICompatibleProvider {
  constructor(options: OpenAIProviderOptions = {}) {
    const opts: BaseProviderOptions = {
      id: "openai",
      name: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      apiKey: options.apiKey,
      defaultModels: DEFAULT_MODELS,
    };
    super(opts);
    this.protocol = "openai-chat";
  }
}

/** Factory convenience */
export function createOpenAIProvider(apiKey?: string): OpenAIProvider {
  return new OpenAIProvider({ apiKey });
}
