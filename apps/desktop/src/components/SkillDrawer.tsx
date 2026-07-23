import { useState } from "react";
import { Check, ChevronRight, Command, Minus } from "lucide-react";
import { useRuntimeContext } from "./AppShell";

export function SkillDrawer() {
  const [open, setOpen] = useState(false);
  const { setActiveView } = useRuntimeContext();

  return (
    <div className="skill-drawer">
      <button
        className="qodex-button qodex-button-secondary"
        onClick={() => setOpen(!open)}
        title="Insert skill"
        aria-expanded={open}
      >
        <Command size={12} aria-hidden="true" />
        <span>skill</span>
      </button>
      {open && (
        <>
          <div
            className="popover-scrim"
            onClick={() => setOpen(false)}
          />
          <div className="skill-popover">
            <div className="popover-label">Loaded skills</div>
            <div className="skill-popover-row"><Check size={12} aria-hidden="true" />General</div>
            <div className="skill-popover-row"><Check size={12} aria-hidden="true" />TypeScript</div>
            <div className="skill-popover-row is-disabled"><Minus size={12} aria-hidden="true" />React</div>
            <button
              type="button"
              className="skill-manage-action"
              onClick={() => {
                setOpen(false);
                setActiveView("skills");
              }}
            >
              Manage skills <ChevronRight size={12} aria-hidden="true" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
