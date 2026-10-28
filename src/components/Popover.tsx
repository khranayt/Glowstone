import { useEffect, useRef, useState, type ReactNode } from "react";

interface PopoverProps {
  trigger: (state: { open: boolean; toggle: () => void; close: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  className?: string;
  width?: number;
}

// Only one popover should be open at a time. Mouse clicks close others through
// the outside-click listener, but keyboard activation needs this signal too.
const OPEN_EVENT = "glowstone:popover-open";
let nextPopoverId = 1;

export function Popover({ trigger, children, align = "left", className = "", width }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement | null>(null);
  const idRef = useRef(0);
  if (idRef.current === 0) idRef.current = nextPopoverId++;

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const handleOther = (event: Event) => {
      if ((event as CustomEvent<number>).detail !== idRef.current) setOpen(false);
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    window.addEventListener(OPEN_EVENT, handleOther);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener(OPEN_EVENT, handleOther);
    };
  }, [open]);

  const toggle = () => {
    if (!open) {
      window.dispatchEvent(new CustomEvent<number>(OPEN_EVENT, { detail: idRef.current }));
    }
    setOpen((value) => !value);
  };

  return (
    <div className={`popover-wrapper ${className}`} ref={wrapper}>
      {trigger({
        open,
        toggle,
        close: () => setOpen(false),
      })}
      {open && (
        <div
          className={`popover-menu popover-${align}`}
          style={width ? { width } : undefined}
          role="menu"
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
