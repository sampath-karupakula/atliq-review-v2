"use client";

// Re-fetches the server page every few seconds while something is running elsewhere (heuristic 1): a review
// started in another tab shows up here without a manual reload. Pauses while the tab is hidden.
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function AutoRefresh({ active, everyMs = 15_000 }: { active: boolean; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, everyMs);
    return () => clearInterval(t);
  }, [active, everyMs, router]);
  return null;
}
