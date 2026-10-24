import { useEffect, useRef, useState, type ReactNode } from "react";

interface PopoverProps {
  trigger: (state: { open: boolean; toggle: () => void; close: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  className?: string;
  width?: number;
}

export function Popover({ trigger, children, align = "left", className = "", width }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div className={`popover-wrapper ${className}`} ref={wrapper}>
      {trigger({
        open,
        toggle: () => setOpen((value) => !value),
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
