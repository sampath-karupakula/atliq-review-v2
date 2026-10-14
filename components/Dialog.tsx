"use client";

import { useEffect, useRef, type ReactNode } from "react";

// A native <dialog> with the prototype's look. Esc closes it; clicking the scrim closes it.
export function Dialog({
  open,
  onClose,
  label,
  wide,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  wide?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`dialog${wide ? " wide" : ""}`}
      aria-label={label}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div style={{ display: "contents" }} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </dialog>
  );
}
