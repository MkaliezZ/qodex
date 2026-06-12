import { createContext, useContext, useState, useCallback, useMemo } from "react";
import type { ModelProvider, ModelInfo } from "@qodex/provider-sdk";
import { OpenAIProvider, DeepSeekProvider, OpenRouterProvider, CustomProvider, AnthropicProvider } from "@qodex/provider-sdk";

export interface ProviderConfig {
  providerId: string | null;
  apiKey: string | null;
  modelId: string | null;
  manualModelId: string | null;
  baseUrl: string;
  connected: boolean;
  error: string | null;
}

interface ProviderContextValue {
  config: ProviderConfig;
  setProvider: (id: string) => void;
  setApiKey: (key: string) => void;
  setModel: (id: string) => void;
  setManualModel: (id: string) => void;
  setBaseUrl: (url: string) => void;
  testConnection: () => Promise<boolean>;
  getProvider: () => ModelProvider | null;
  listModels: () => Promise<ModelInfo[]>;
  getResolvedModel: () => string | null;
}

const ProviderCtx = createContext<ProviderContextValue>({} as ProviderContextValue);
export const useProviderContext = () => useContext(ProviderCtx);

function createProviderInstance(id: string, apiKey: string, baseUrl: string): ModelProvider {
  switch (id) {
    case "openai": return new OpenAIProvider({ apiKey });
    case "deepseek": return new DeepSeekProvider({ apiKey });
    case "openrouter": return new OpenRouterProvider({ apiKey });
    case "anthropic": return new AnthropicProvider({ apiKey });
    case "custom": return new CustomProvider({ id: "custom", name: "Custom", baseUrl, apiKey });
    default: return new DeepSeekProvider({ apiKey });
  }
}

export function ProviderContextProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<ProviderConfig>({
    providerId: null, apiKey: null, modelId: null, manualModelId: null,
    baseUrl: "https://api.openai.com/v1", connected: false, error: null,
  });

  const setProvider = useCallback((id: string) => setConfig((c) => ({ ...c, providerId: id, connected: false, error: null })), []);
  const setApiKey = useCallback((key: string) => setConfig((c) => ({ ...c, apiKey: key || null, connected: false, error: null })), []);
  const setModel = useCallback((id: string) => setConfig((c) => ({ ...c, modelId: id })), []);
  const setManualModel = useCallback((id: string) => setConfig((c) => ({ ...c, manualModelId: id || null })), []);
  const setBaseUrl = useCallback((url: string) => setConfig((c) => ({ ...c, baseUrl: url })), []);

  const getResolvedModel = useCallback((): string | null => {
    return config.modelId || config.manualModelId || null;
  }, [config.modelId, config.manualModelId]);

  const getProvider = useCallback((): ModelProvider | null => {
    if (!config.providerId || !config.apiKey) return null;
    return createProviderInstance(config.providerId, config.apiKey, config.baseUrl);
  }, [config.providerId, config.apiKey, config.baseUrl]);

  const testConnection = useCallback(async (): Promise<boolean> => {
    if (!config.providerId || !config.apiKey) {
      setConfig((c) => ({ ...c, error: "Provider and API key required" }));
      return false;
    }
    try {
      const p = createProviderInstance(config.providerId, config.apiKey, config.baseUrl);
      const ok = await p.testConnection();
      setConfig((c) => ({ ...c, connected: ok, error: ok ? null : "Connection failed" }));
      return ok;
    } catch (e) {
      setConfig((c) => ({ ...c, connected: false, error: e instanceof Error ? e.message : "Connection failed" }));
      return false;
    }
  }, [config.providerId, config.apiKey, config.baseUrl]);

  const listModels = useCallback(async (): Promise<ModelInfo[]> => {
    if (!config.providerId || !config.apiKey) return [];
    try {
      const p = createProviderInstance(config.providerId, config.apiKey, config.baseUrl);
      return await p.listModels();
    } catch { return []; }
  }, [config.providerId, config.apiKey, config.baseUrl]);

  const value = useMemo(() => ({
    config, setProvider, setApiKey, setModel, setManualModel, setBaseUrl,
    testConnection, getProvider, listModels, getResolvedModel,
  }), [config, setProvider, setApiKey, setModel, setManualModel, setBaseUrl, testConnection, getProvider, listModels, getResolvedModel]);

  return <ProviderCtx.Provider value={value}>{children}</ProviderCtx.Provider>;
}
