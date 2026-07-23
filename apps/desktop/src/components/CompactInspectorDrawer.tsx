import { type RefObject, useCallback, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { ContextPanel } from "./ContextPanel";

export function CompactInspectorDrawer({
  onClose,
  open,
  triggerRef,
}: {
  onClose: () => void;
  open: boolean;
  triggerRef: RefObject<HTMLButtonElement>;
}) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const closeAndRestoreFocus = useCallback(() => {
    onClose();
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, [onClose, triggerRef]);

  useEffect(() => {
    if (!open) return;

    window.requestAnimationFrame(() => closeRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeAndRestoreFocus();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeAndRestoreFocus, open]);

  if (!open) return null;

  return (
    <div className="compact-inspector-layer" data-testid="compact-inspector-layer">
      <button
        type="button"
        className="compact-inspector-backdrop"
        aria-label="Close context inspector"
        onClick={closeAndRestoreFocus}
      />
      <div
        ref={drawerRef}
        className="compact-inspector-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Context inspector"
      >
        <div className="compact-inspector-toolbar">
          <span>Context inspector</span>
          <button
            ref={closeRef}
            type="button"
            className="compact-inspector-close"
            aria-label="Close context inspector"
            onClick={closeAndRestoreFocus}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
        <div className="context-panel-shell">
          <ContextPanel />
        </div>
      </div>
    </div>
  );
}
