"use client";

import { useId, useState, type ReactNode } from "react";
import { Chevron } from "./ui";

// A one-line summary that opens into detail. Used for Minor items, protections and usual terms on the report.
export function Fold({ summary, children, defaultOpen = false }: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className="fold" data-open={open}>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
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
