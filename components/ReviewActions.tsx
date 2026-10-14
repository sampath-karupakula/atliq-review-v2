"use client";

// Start reviews from outside the contract page: one contract (queue row, deal page) or every unreviewed contract in
// the queue. Reviews run in the background on the server; a confirmation names the cost first (heuristic 5).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, PlayCircle } from "lucide-react";
import { btn } from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { friendlyError } from "@/lib/ux/errors";

export function ReviewOneButton({
  contractId,
  label = "Review",
  again = false,
  size = "sm",
  daysUntilDue = null,
  horizonDays = 14,
  assignee = null,
}: {
  contractId: string;
  label?: string;
  again?: boolean;
  size?: "sm" | "md";
  /** Days until the review-by date or client deadline, to warn before spending tokens on a contract not due soon. */
  daysUntilDue?: number | null;
  horizonDays?: number;
  assignee?: string | null;
}) {
  const notDueSoon = daysUntilDue != null && daysUntilDue > horizonDays;
  const router = useRouter();
  const { toast } = useToast();
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const go = () =>
    start(async () => {
      setConfirm(false);
      const res = await fetch("/api/reviews", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contractId }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.failed) {
        const e = friendlyError(json.message ?? json.error);
        toast(e.title, { tone: "error" });
        return;
      }
      toast(json.mode === "queued" ? "Review queued; it starts when a slot frees up." : "Review started. It runs in the background; you'll get a notification.");
      router.refresh();
    });
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setConfirm(true);
        }}
        className={`${btn("secondary", size)} relative z-10`}
      >
        <Play className="size-3.5" aria-hidden /> {pending ? "Starting…" : label}
      </button>
      <ConfirmDialog open={confirm} title={again ? "Review this contract again?" : "Start a review?"} confirmLabel={again ? "Review again" : "Start review"} onConfirm={go} onCancel={() => setConfirm(false)}>
        <p>This uses paid AI calls and usually takes a few minutes. It runs in the background; the owner, the assignee and the admins get a notification when it&rsquo;s done.</p>
        {notDueSoon && <p className="font-medium text-negotiable">It isn&rsquo;t due for {daysUntilDue} days. You could wait and review it closer to the date.</p>}
        {assignee && <p>Assigned to {assignee}.</p>}
        {again && <p>The new review replaces the current report. Dismissals carry over only to a new version of the document.</p>}
      </ConfirmDialog>
    </>
  );
}

/** Bulk review of the contracts due soon (within the horizon) that this person may start. Later ones are left alone. */
export function ReviewAllButton({ contractIds, horizonDays = 14, laterCount = 0 }: { contractIds: string[]; horizonDays?: number; laterCount?: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  if (!contractIds.length) {
    return laterCount ? <span className="text-xs text-muted">Nothing due in the next {horizonDays} days needs a review</span> : null;
  }
  const go = () =>
    start(async () => {
      setConfirm(false);
      const res = await fetch("/api/reviews/bulk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contractIds }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.failed) {
        toast(friendlyError(json.message ?? json.error).title, { tone: "error" });
        return;
      }
      const n = json.started.length + json.queued.length;
      toast(`${n} review${n === 1 ? "" : "s"} started (${json.concurrency} at a time)${json.skipped.length ? `; ${json.skipped.length} skipped` : ""}.`);
      router.refresh();
    });
  return (
    <>
      <button type="button" disabled={pending} onClick={() => setConfirm(true)} className={btn("secondary", "sm")}>
        <PlayCircle className="size-4" aria-hidden /> {pending ? "Starting…" : `Review due soon (${contractIds.length})`}
      </button>
      <ConfirmDialog open={confirm} title={`Review ${contractIds.length} contract${contractIds.length === 1 ? "" : "s"} due soon?`} confirmLabel={`Start ${contractIds.length} reviews`} onConfirm={go} onCancel={() => setConfirm(false)}>
        <p>
          This starts {contractIds.length} reviews with paid AI calls (roughly $0.35–$1.50 each on Opus): the contracts not yet reviewed that are due in the next{" "}
          {horizonDays} days and that you may review. They run in the background a few at a time, and each one sends a notification when it finishes.
          {laterCount > 0 && ` ${laterCount} contract${laterCount === 1 ? "" : "s"} due later ${laterCount === 1 ? "is" : "are"} left alone, so no tokens are spent on them yet.`}
        </p>
      </ConfirmDialog>
    </>
  );
}
