import { BaseOpenAICompatibleProvider, type BaseProviderOptions } from "../base.js";
import type { ModelInfo } from "../../types/provider.js";

const DEFAULT_MODELS: ModelInfo[] = [
  {
    id: "deepseek-chat",
    displayName: "DeepSeek Chat (V4)",
    contextWindow: 65536,
    supportsTools: true,
    supportsReasoning: false,
  },
  {
    id: "deepseek-reasoner",
    displayName: "DeepSeek Reasoner",
    contextWindow: 65536,
    supportsTools: false,
    supportsReasoning: true,
  },
];

export type DeepSeekProviderOptions = {
  apiKey?: string;
};

/**
 * DeepSeek provider.
 *
 * Protocol: openai-chat (fully compatible with /chat/completions).
 * Base URL: https://api.deepseek.com/v1
 */
export class DeepSeekProvider extends BaseOpenAICompatibleProvider {
  constructor(options: DeepSeekProviderOptions = {}) {
    const opts: BaseProviderOptions = {
      id: "deepseek",
      name: "DeepSeek",
      baseUrl: "https://api.deepseek.com/v1",
      apiKey: options.apiKey,
      defaultModels: DEFAULT_MODELS,
    };
    super(opts);
  }
}

/** Factory convenience */
export function createDeepSeekProvider(apiKey?: string): DeepSeekProvider {
  return new DeepSeekProvider({ apiKey });
}
