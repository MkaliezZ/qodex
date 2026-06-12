import { useState } from "react";
import { useProviderContext } from "./ProviderContext";

export function ModelSwitcher() {
  const [open, setOpen] = useState(false);
  const { config } = useProviderContext();

  const label = config.connected && config.modelId
    ? config.modelId
    : config.connected
      ? "Connected"
      : config.providerId
        ? `${config.providerId} (not connected)`
        : "Configure provider";

  return (
    <div style={{ position: "relative" }}>
      <div className="model-badge" data-testid="model-switcher" onClick={() => setOpen(!open)} style={{ cursor: "pointer", userSelect: "none" }}>
        <span>{label}</span>
        <span style={{ fontSize: 9, opacity: 0.5, marginLeft: 4 }}>▼</span>
      </div>
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, minWidth: 180,
          background: "rgba(20,24,36,0.95)", backdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 10, padding: 4, zIndex: 100 }}
          onClick={() => setOpen(false)}>
          <div style={{ padding: "6px 10px", fontSize: 12, color: "rgba(255,255,255,0.30)", cursor: "default" }}>
            {config.connected ? `Connected to ${config.providerId}` : "Configure provider in Settings"}
          </div>
        </div>
      )}
    </div>
  );
}
