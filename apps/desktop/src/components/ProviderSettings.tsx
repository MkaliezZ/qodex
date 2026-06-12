import { useState, useEffect } from "react";
import { useProviderContext } from "./ProviderContext";
import { PROVIDER_PRESETS } from "./presets";

const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.40)", marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "6px 10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#fff", fontSize: 13, outline: "none" };
const selectStyle: React.CSSProperties = { ...inputStyle, cursor: "pointer" };
const btnStyle: React.CSSProperties = { padding: "5px 12px", background: "rgba(91,140,255,0.12)", border: "1px solid rgba(91,140,255,0.20)", borderRadius: 6, color: "#5B8CFF", fontSize: 12, cursor: "pointer" };

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
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Provider Selection */}
      <div>
        <div style={labelStyle}>Provider</div>
        <select style={selectStyle} data-testid="provider-select" value={config.providerId ?? ""} onChange={(e) => setProvider(e.target.value)}>
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
        <div>
          <div style={labelStyle}>Preset</div>
          <select style={selectStyle} value={currentPreset?.id ?? "custom"} onChange={(e) => {
            const p = PROVIDER_PRESETS.find((x) => x.id === e.target.value);
            if (p) { setBaseUrl(p.baseUrl); if (p.modelExamples[0]) setManualModel(p.modelExamples[0]); }
          }}>
            {PROVIDER_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label} {p.risk !== "low" ? `(${p.risk})` : ""}</option>)}
          </select>
        </div>
      )}

      {/* Base URL (always editable for custom) */}
      <div>
        <div style={labelStyle}>{isCustom ? "Base URL" : "API Key"}</div>
        {isCustom ? (
          <input type="text" style={inputStyle} value={config.baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com/v1" />
        ) : (
          <>
            <div style={{ display: "flex", gap: 6 }}>
              <input type={showKey ? "text" : "password"} style={inputStyle} data-testid="api-key-input" placeholder="sk-..." value={config.apiKey ?? ""} onChange={(e) => setApiKey(e.target.value)} />
              <button data-testid="api-key-toggle" onClick={() => setShowKey(!showKey)} style={{ ...btnStyle, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.40)", flexShrink: 0 }}>{showKey ? "Hide" : "Show"}</button>
            </div>
          </>
        )}
      </div>

      {/* API Key (for custom, shown after base URL) */}
      {isCustom && (
        <div>
          <div style={labelStyle}>API Key</div>
          <div style={{ display: "flex", gap: 6 }}>
            <input type={showKey ? "text" : "password"} style={inputStyle} data-testid="api-key-input" placeholder="sk-..." value={config.apiKey ?? ""} onChange={(e) => setApiKey(e.target.value)} />
            <button data-testid="api-key-toggle" onClick={() => setShowKey(!showKey)} style={{ ...btnStyle, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.40)", flexShrink: 0 }}>{showKey ? "Hide" : "Show"}</button>
          </div>
        </div>
      )}

      {/* Manual Model ID (Custom only — always visible) */}
      {isCustom && (
        <div>
          <div style={labelStyle}>Model ID</div>
          <input type="text" style={inputStyle} data-testid="manual-model-input" placeholder={presetPlaceholder} value={config.manualModelId ?? ""} onChange={(e) => setManualModel(e.target.value)} />
        </div>
      )}

      {/* Connection Test */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button data-testid="connection-test-button" onClick={handleTest} disabled={!config.providerId || !config.apiKey || testing} style={{ ...btnStyle, opacity: (!config.providerId || !config.apiKey) ? 0.4 : 1 }}>{testing ? "Testing..." : "Test Connection"}</button>
        {config.connected && <span data-testid="connection-status" style={{ fontSize: 12, color: "#4FFFC2" }}>✓ Connected</span>}
        {config.error && <span style={{ fontSize: 11, color: "#FF5C7A" }}>{config.error}</span>}
      </div>

      {/* Model Selection (auto-loaded, non-custom only) */}
      {models.length > 0 && (
        <div>
          <div style={labelStyle}>Model</div>
          <select style={selectStyle} data-testid="model-select" value={config.modelId ?? ""} onChange={(e) => setModel(e.target.value)}>
            <option value="" disabled>Select model...</option>
            {models.map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
          </select>
        </div>
      )}

      {/* Model Selection (for custom when listModels succeeded) */}
      {isCustom && models.length > 0 && (
        <div>
          <div style={labelStyle}>Available Models</div>
          <select style={selectStyle} value={config.modelId ?? ""} onChange={(e) => setModel(e.target.value)}>
            <option value="">Use manual model ID</option>
            {models.map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
