"use client";

import { useId, useState, type ReactNode } from "react";
import { Chevron } from "./ui";

// A one-line summary that opens into detail. Used for Minor items, protections and usual terms on the report.
// Uncontrolled by default; pass `open` and `onOpenChange` when something else must open it (a jump to a finding).
export function Fold({
  summary,
  children,
  defaultOpen = false,
  open: openProp,
  onOpenChange,
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [own, setOwn] = useState(defaultOpen);
  const open = openProp ?? own;
  const id = useId();
  const toggle = () => {
    if (openProp === undefined) setOwn(!open);
    onOpenChange?.(!open);
  };
  return (
    <section className="fold" data-open={open}>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={toggle}>
        <span>{summary}</span>
        <Chevron />
      </button>
      {open ? (
        <div className="fold-body" id={id}>
          {children}
        </div>
      ) : null}
    </section>
  );
}
