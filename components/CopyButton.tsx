"use client";

import { useState } from "react";

// Copy only: AtliQ Review never edits a contract, so suggested wording is something the user copies and sends.
export function CopyButton({ text, label = "Copy wording" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn small"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(
          () => {
            setDone(true);
            setTimeout(() => setDone(false), 2000);
          },
          () => setDone(false),
        );
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}
