import { useState, useEffect } from "react";
import { useProviderContext } from "./ProviderContext";

const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.40)", marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "6px 10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#fff", fontSize: 13, outline: "none" };
const selectStyle: React.CSSProperties = { ...inputStyle, cursor: "pointer" };
const btnStyle: React.CSSProperties = { padding: "5px 12px", background: "rgba(91,140,255,0.12)", border: "1px solid rgba(91,140,255,0.20)", borderRadius: 6, color: "#5B8CFF", fontSize: 12, cursor: "pointer" };

export function ProviderSettings() {
  const { config, setProvider, setApiKey, setModel, setBaseUrl, testConnection, listModels } = useProviderContext();
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<{ id: string; displayName: string }[]>([]);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (config.providerId && config.apiKey && config.connected) {
      listModels().then((m) => setModels(m.map((x) => ({ id: x.id, displayName: x.displayName }))));
    } else setModels([]);
  }, [config.providerId, config.apiKey, config.connected]);

  const handleTest = async () => { setTesting(true); await testConnection(); setTesting(false); };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={labelStyle}>Provider</div>
        <select style={selectStyle} data-testid="provider-select" value={config.providerId ?? ""} onChange={(e) => setProvider(e.target.value)}>
          <option value="" disabled>Select provider...</option>
          <option value="openai">OpenAI</option>
          <option value="deepseek">DeepSeek</option>
          <option value="openrouter">OpenRouter</option>
          <option value="custom">Custom (OpenAI-compatible)</option>
        </select>
      </div>

      <div>
        <div style={labelStyle}>API Key</div>
        <div style={{ display: "flex", gap: 6 }}>
          <input type={showKey ? "text" : "password"} style={inputStyle} data-testid="api-key-input" placeholder="sk-..." value={config.apiKey ?? ""} onChange={(e) => setApiKey(e.target.value)} />
          <button data-testid="api-key-toggle" onClick={() => setShowKey(!showKey)} style={{ ...btnStyle, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.40)", flexShrink: 0 }}>{showKey ? "Hide" : "Show"}</button>
        </div>
      </div>

      {config.providerId === "custom" && (
        <div>
          <div style={labelStyle}>Base URL</div>
          <input type="text" style={inputStyle} value={config.baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com/v1" />
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button data-testid="connection-test-button" onClick={handleTest} disabled={!config.providerId || !config.apiKey || testing} style={{ ...btnStyle, opacity: (!config.providerId || !config.apiKey) ? 0.4 : 1 }}>{testing ? "Testing..." : "Test Connection"}</button>
        {config.connected && <span data-testid="connection-status" style={{ fontSize: 12, color: "#4FFFC2" }}>✓ Connected</span>}
        {config.error && <span style={{ fontSize: 11, color: "#FF5C7A" }}>{config.error}</span>}
      </div>

      {models.length > 0 && (
        <div>
          <div style={labelStyle}>Model</div>
          <select style={selectStyle} data-testid="model-select" value={config.modelId ?? ""} onChange={(e) => setModel(e.target.value)}>
            <option value="" disabled>Select model...</option>
            {models.map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
