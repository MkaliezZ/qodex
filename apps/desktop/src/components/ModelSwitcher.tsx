import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { AnchoredPopover } from "./AnchoredPopover";
import { useProviderContext } from "./ProviderContext";

export function ModelSwitcher() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
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
        ref={triggerRef}
        type="button"
        className="model-badge"
        data-testid="model-switcher"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? "model-popover" : undefined}
      >
        <span>{label}</span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      <AnchoredPopover
        ariaLabel="Model connection"
        className="model-popover"
        id="model-popover"
        onClose={() => setOpen(false)}
        open={open}
        role="dialog"
        triggerRef={triggerRef}
        width={240}
      >
        <button
          type="button"
          className="model-popover-copy"
          onClick={() => {
            setOpen(false);
            window.requestAnimationFrame(() => triggerRef.current?.focus());
          }}
        >
          {config.connected ? `Connected to ${config.providerId}` : "Configure provider in Settings"}
        </button>
      </AnchoredPopover>
    </div>
  );
}
