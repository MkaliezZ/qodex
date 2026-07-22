import { useState, useEffect } from "react";
import { useProviderContext } from "./ProviderContext";
import { PROVIDER_PRESETS } from "./presets";

export function ProviderSettings() {
  const { config, setProvider, setApiKey, setModel, setManualModel, setBaseUrl, testConnection, listModels } = useProviderContext();
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<{ id: string; displayName: string }[]>([]);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (config.providerId && config.apiKey && config.connected) {
      listModels().then((m) => setModels(m.map((x) => ({ id: x.id, displayName: x.displayName }))));
    } else setModels([]);
  }, [config.providerId, config.apiKey, config.connected]);

  const handleTest = async () => { setTesting(true); await testConnection(); setTesting(false); };

  const isCustom = config.providerId === "custom";
  const currentPreset = PROVIDER_PRESETS.find((p) => p.baseUrl === config.baseUrl);
  const presetPlaceholder = isCustom ? (currentPreset?.modelExamples[0] ?? "Enter model ID...") : undefined;

  return (
    <div className="provider-settings">
      {/* Provider Selection */}
      <div className="field-group">
        <label>Provider</label>
        <select className="qodex-input" data-testid="provider-select" value={config.providerId ?? ""} onChange={(e) => setProvider(e.target.value)}>
          <option value="" disabled>Select provider...</option>
          <option value="openai">OpenAI</option>
          <option value="deepseek">DeepSeek</option>
          <option value="openrouter">OpenRouter</option>
          <option value="anthropic">Anthropic</option>
          <option value="custom">Custom (OpenAI-compatible)</option>
        </select>
      </div>

      {/* Preset Selection (Custom only) */}
      {isCustom && (
        <div className="field-group">
          <label>Preset</label>
          <select className="qodex-input" value={currentPreset?.id ?? "custom"} onChange={(e) => {
            const p = PROVIDER_PRESETS.find((x) => x.id === e.target.value);
            if (p) { setBaseUrl(p.baseUrl); if (p.modelExamples[0]) setManualModel(p.modelExamples[0]); }
          }}>
            {PROVIDER_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label} {p.risk !== "low" ? `(${p.risk})` : ""}</option>)}
          </select>
        </div>
      )}

      {/* Base URL (always editable for custom) */}
      <div className="field-group">
        <label>{isCustom ? "Base URL" : "API Key"}</label>
        {isCustom ? (
          <input type="text" className="qodex-input" data-testid="base-url-input" value={config.baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com/v1" />
        ) : (
          <>
            <div className="input-action-row">
              <input type={showKey ? "text" : "password"} className="qodex-input" data-testid="api-key-input" placeholder="sk-..." value={config.apiKey ?? ""} onChange={(e) => setApiKey(e.target.value)} />
              <button data-testid="api-key-toggle" onClick={() => setShowKey(!showKey)} className="qodex-button qodex-button-secondary qodex-button-small">{showKey ? "Hide" : "Show"}</button>
            </div>
          </>
        )}
      </div>

      {/* API Key (for custom, shown after base URL) */}
      {isCustom && (
        <div className="field-group">
          <label>API Key</label>
          <div className="input-action-row">
            <input type={showKey ? "text" : "password"} className="qodex-input" data-testid="api-key-input" placeholder="sk-..." value={config.apiKey ?? ""} onChange={(e) => setApiKey(e.target.value)} />
            <button data-testid="api-key-toggle" onClick={() => setShowKey(!showKey)} className="qodex-button qodex-button-secondary qodex-button-small">{showKey ? "Hide" : "Show"}</button>
          </div>
        </div>
      )}

      {/* Manual Model ID (Custom only — always visible) */}
      {isCustom && (
        <div className="field-group">
          <label>Model ID</label>
          <input type="text" className="qodex-input" data-testid="manual-model-input" placeholder={presetPlaceholder} value={config.manualModelId ?? ""} onChange={(e) => setManualModel(e.target.value)} />
        </div>
      )}

      {/* Connection Test */}
      <div className="provider-actions">
        <button data-testid="connection-test-button" onClick={handleTest} disabled={!config.providerId || !config.apiKey || testing} className="qodex-button qodex-button-small">{testing ? "Testing..." : "Test connection"}</button>
        {config.connected && <span data-testid="connection-status" className="connection-success">✓ Connected</span>}
        {config.error && <span className="form-error">{config.error}</span>}
      </div>

      {/* Model Selection (auto-loaded, non-custom only) */}
      {models.length > 0 && (
        <div className="field-group">
          <label>Model</label>
          <select className="qodex-input" data-testid="model-select" value={config.modelId ?? ""} onChange={(e) => setModel(e.target.value)}>
            <option value="" disabled>Select model...</option>
            {models.map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
          </select>
        </div>
      )}

      {/* Model Selection (for custom when listModels succeeded) */}
      {isCustom && models.length > 0 && (
        <div className="field-group">
          <label>Available Models</label>
          <select className="qodex-input" value={config.modelId ?? ""} onChange={(e) => setModel(e.target.value)}>
            <option value="">Use manual model ID</option>
            {models.map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
