import { useRef, useState } from "react";
import { Check, ChevronRight, Command, Minus } from "lucide-react";
import { AnchoredPopover } from "./AnchoredPopover";
import { useRuntimeContext } from "./AppShell";

export function SkillDrawer() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { setActiveView } = useRuntimeContext();

  return (
    <div className="skill-drawer">
      <button
        ref={triggerRef}
        type="button"
        className="qodex-button qodex-button-secondary"
        data-testid="skill-drawer-trigger"
        onClick={() => setOpen(!open)}
        title="Insert skill"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? "skill-popover" : undefined}
      >
        <Command size={12} aria-hidden="true" />
        <span>skill</span>
      </button>
      <AnchoredPopover
        ariaLabel="Loaded skills"
        className="skill-popover"
        id="skill-popover"
        onClose={() => setOpen(false)}
        open={open}
        role="menu"
        triggerRef={triggerRef}
        width={220}
      >
        <div className="popover-label">Loaded skills</div>
        <div className="skill-popover-row" role="menuitemcheckbox" aria-checked="true" aria-disabled="true">
          <Check size={12} aria-hidden="true" />General
        </div>
        <div className="skill-popover-row" role="menuitemcheckbox" aria-checked="true" aria-disabled="true">
          <Check size={12} aria-hidden="true" />TypeScript
        </div>
        <div className="skill-popover-row is-disabled" role="menuitemcheckbox" aria-checked="false" aria-disabled="true">
          <Minus size={12} aria-hidden="true" />React
        </div>
        <button
          type="button"
          role="menuitem"
          className="skill-manage-action"
          onClick={() => {
            setOpen(false);
            setActiveView("skills");
          }}
        >
          Manage skills <ChevronRight size={12} aria-hidden="true" />
        </button>
      </AnchoredPopover>
    </div>
  );
}
