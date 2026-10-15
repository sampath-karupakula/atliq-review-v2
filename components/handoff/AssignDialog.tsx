"use client";

// Assign a first (or second) review. The review-by date is filled in two days before the client deadline, and the
// dialog warns before a date that is too late, a reviewer who owns the deal, or one who is already busy.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/Dialog";
import { useToast } from "@/components/Toast";
import { assignReview } from "@/app/actions/workflow";
import { assignSecondReviewer } from "@/app/actions/handoff";
import { assignWarnings } from "@/lib/review/handoff";
import { formatDate } from "@/lib/checks/dates";

export type AssignProps = {
  contractId: string;
  title: string;
  clientDeadline: string | null;
  owner: string | null;
  today: string;
  defaultDate: string;
  people: { name: string; open: number }[];
  mode?: "first" | "second";
  exclude?: string | null;
  label?: string;
  primary?: boolean;
};

export function AssignButton(p: AssignProps) {
  const [open, setOpen] = useState(false);
  // Least busy first and the deal owner last, so the default is a fresh pair of eyes; a second review never goes to the owner.
  const people = p.people
    .filter((x) => x.name !== p.exclude && !(p.mode === "second" && x.name === p.owner))
    .sort((a, b) => Number(a.name === p.owner) - Number(b.name === p.owner) || a.open - b.open || a.name.localeCompare(b.name));
  const [reviewer, setReviewer] = useState(people[0]?.name ?? "");
  const [date, setDate] = useState(p.defaultDate);
  const [concerns, setConcerns] = useState("");
  const [busy, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const second = p.mode === "second";
  const warnings = assignWarnings({ reviewBy: date, clientDeadline: p.clientDeadline, reviewer, owner: p.owner, today: p.today, openReviews: people.find((x) => x.name === reviewer)?.open ?? 0 });

  return (
    <>
      <button type="button" className={`btn small${p.primary ? " primary" : ""}`} onClick={() => setOpen(true)}>
        {p.label ?? (second ? "Assign a second reviewer" : "Assign first review")}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} label={second ? "Assign a second review" : "Assign first review"}>
        <h2 style={{ margin: 0 }}>{second ? "Assign a second review" : "Assign first review"}</h2>
        <p className="hint" style={{ margin: 0 }}>
          {p.title}
          {p.clientDeadline ? ` · client deadline ${formatDate(p.clientDeadline)}` : ""}
        </p>
        <form
          style={{ display: "flex", flexDirection: "column", gap: 14 }}
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = second ? await assignSecondReviewer(p.contractId, reviewer, date) : await assignReview({ contractId: p.contractId, reviewer, reviewDeadline: date, concerns });
              if (!r.ok) return toast(r.error, { tone: "error" });
              setOpen(false);
              router.refresh();
              toast(`${reviewer} ${second ? "does the second review" : "reviews it"} by ${formatDate(date)}. They get a notification in AtliQ Review.`);
            });
          }}
        >
          <div className="row">
            <label>Reviewer</label>
            <div className="radio-list">
              {people.map((x) => (
                <label key={x.name}>
                  <span>
                    <input type="radio" name="reviewer" value={x.name} checked={reviewer === x.name} onChange={() => setReviewer(x.name)} /> {x.name}
                  </span>
                  <span className="hint">
                    {x.open} open review{x.open === 1 ? "" : "s"}
                  </span>
                </label>
              ))}
            </div>
          </div>
          {warnings.map((w) => (
            <p key={w} className="warnline" style={{ margin: 0 }}>
              {w}
            </p>
          ))}
          <div className="row">
            <label htmlFor="asgDate">Review by</label>
            <input type="date" id="asgDate" value={date} onChange={(e) => setDate(e.target.value)} />
            <span className="hint">Suggested: two days before the client deadline.</span>
          </div>
          {second ? null : (
            <div className="row">
              <label htmlFor="asgQ">What should they look at?</label>
              <textarea id="asgQ" value={concerns} onChange={(e) => setConcerns(e.target.value)} placeholder="For example: is the Al Noor clash real, or does the Seaside waiver cover it?" />
            </div>
          )}
          <div className="btns">
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={busy || !reviewer}>
              Assign
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
