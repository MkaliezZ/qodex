import { useState } from "react";
import { ChevronDown } from "lucide-react";
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
    <div className="model-switcher">
      <button
        type="button"
        className="model-badge"
        data-testid="model-switcher"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span>{label}</span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open && (
        <div className="model-popover"
          onClick={() => setOpen(false)}>
          <div className="model-popover-copy">
            {config.connected ? `Connected to ${config.providerId}` : "Configure provider in Settings"}
          </div>
        </div>
      )}
    </div>
  );
}
