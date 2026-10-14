"use client";

// A modal confirmation for costly or hard-to-undo actions (heuristic 5). Native <dialog>: Escape closes it,
// focus is trapped while open and returns to the trigger afterwards.
import { useEffect, useRef, type ReactNode } from "react";
import { btn } from "@/components/ui";

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  tone = "primary",
  confirmDisabled,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onCancel();
      }}
      aria-labelledby="confirm-title"
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface p-0 text-fg shadow-xl backdrop:bg-black/40"
    >
      {open && (
        <form
          method="dialog"
          className="space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            onConfirm();
          }}
        >
          <h2 id="confirm-title" className="text-base font-semibold">
            {title}
          </h2>
          <div className="space-y-2 text-sm text-muted">{children}</div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCancel} className={btn("secondary")}>
              Cancel
            </button>
            <button type="submit" autoFocus disabled={confirmDisabled} className={btn(tone)}>
              {confirmLabel}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
