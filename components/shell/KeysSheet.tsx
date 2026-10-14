"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/Dialog";

// The ? key opens this. The list grows as later phases add j/k/o on the report.
export function useKeysSheet() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test((document.activeElement as HTMLElement | null)?.tagName ?? "");
      if (e.key === "?" && !typing) setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}

export function KeysSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} label="Keyboard shortcuts">
      <h2>Keyboard shortcuts</h2>
      <ul className="mini-list">
        <li>
          <span>Search or jump</span>
          <kbd>Ctrl K</kbd>
        </li>
        <li>
          <span>Next / previous finding (report)</span>
          <span>
            <kbd>j</kbd> <kbd>k</kbd>
          </span>
        </li>
        <li>
          <span>Open or close the finding</span>
          <kbd>o</kbd>
        </li>
        <li>
          <span>Close any panel</span>
          <kbd>Esc</kbd>
        </li>
        <li>
          <span>This list</span>
          <kbd>?</kbd>
        </li>
      </ul>
      <div className="btns">
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </Dialog>
  );
}
