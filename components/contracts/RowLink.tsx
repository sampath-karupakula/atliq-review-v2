"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

// The whole row opens the item: a far bigger target than a small link. Enter works from the keyboard too, and a
// real link in the first cell keeps middle-click and screen readers working.
export function RowLink({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <tr
      className="clickable"
      tabIndex={0}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button")) return;
        router.push(href);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") router.push(href);
      }}
    >
      {children}
    </tr>
  );
}
