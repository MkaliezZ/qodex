import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

const VIEWPORT_MARGIN = 8;
const TRIGGER_GAP = 6;

interface AnchoredPopoverProps {
  ariaLabel: string;
  children: ReactNode;
  className: string;
  id: string;
  onClose: () => void;
  open: boolean;
  role: "dialog" | "menu";
  triggerRef: RefObject<HTMLButtonElement>;
  width: number;
}

export function AnchoredPopover({
  ariaLabel,
  children,
  className,
  id,
  onClose,
  open,
  role,
  triggerRef,
  width,
}: AnchoredPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CSSProperties>({ visibility: "hidden" });

  const closeAndRestoreFocus = useCallback(() => {
    onClose();
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, [onClose, triggerRef]);

  useLayoutEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const triggerRect = trigger.getBoundingClientRect();
      const popoverWidth = Math.min(width, window.innerWidth - VIEWPORT_MARGIN * 2);
      const left = Math.min(
        Math.max(triggerRect.left, VIEWPORT_MARGIN),
        window.innerWidth - popoverWidth - VIEWPORT_MARGIN,
      );

      setPosition({
        bottom: window.innerHeight - triggerRect.top + TRIGGER_GAP,
        left,
        maxHeight: Math.max(120, triggerRect.top - TRIGGER_GAP - VIEWPORT_MARGIN),
        visibility: "visible",
        width: popoverWidth,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, triggerRef, width]);

  useLayoutEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeAndRestoreFocus();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeAndRestoreFocus, open]);

  if (!open) return null;

  return createPortal(
    <>
      <div
        className="popover-scrim"
        aria-hidden="true"
        onMouseDown={closeAndRestoreFocus}
      />
      <div
        ref={popoverRef}
        id={id}
        className={`composer-popover ${className}`}
        data-testid={id}
        role={role}
        aria-label={ariaLabel}
        style={position}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}
