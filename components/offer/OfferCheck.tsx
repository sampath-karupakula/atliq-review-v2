"use client";

// Answers as you type: the rules run in the browser over the register and usual terms the page passed in, so there
// is no round trip during a live call. Pressing Enter (or tapping an example) records the check; the server works
// the answer out again before storing it.
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { checkOffer, VERDICT_LABEL, type OfferPromise, type OfferTerm, type Verdict } from "@/lib/offer/check";
import { recordOfferCheck } from "@/app/actions/deals";
import { useToast } from "@/components/Toast";

const CHIP: Record<Verdict, string> = { stop: "serious", warn: "negotiable", ok: "okc" };
const EXAMPLES = ["$72/hr senior data engineer", "Hotels in UAE and Oman", "Reuse PipeKit for a new client", "90-day payment terms", "Patient data with the Pune team"];

export function OfferCheck({
  promises,
  terms,
  coverage,
  compact,
  canRecord,
}: {
  promises: OfferPromise[];
  terms: OfferTerm[];
  coverage: { onFile: number; signedInTracker: number };
  compact?: boolean;
  canRecord?: boolean;
}) {
  const [q, setQ] = useState("");
  const answers = useMemo(() => checkOffer(q, promises, terms, coverage), [q, promises, terms, coverage]);
  const [busy, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const record = (text: string) => {
    if (!canRecord || text.trim().length < 3) return;
    start(async () => {
      const r = await recordOfferCheck(text);
      if (!r.ok) return toast(r.error, { tone: "error" });
      router.refresh();
    });
  };
  const id = compact ? "offerQuick" : "offerIn";

  return (
    <div className={compact ? undefined : "offer"} style={compact ? { display: "flex", flexDirection: "column", gap: 10 } : undefined}>
      {compact ? null : (
        <label htmlFor={id} style={{ fontWeight: 600 }}>
          Type the term you&apos;re about to offer
        </label>
      )}
      <input
        type="text"
        id={id}
        value={q}
        placeholder={compact ? "For example: hotels in Oman" : "For example: $72/hr senior data engineer"}
        autoComplete="off"
        aria-label={compact ? "Term to check" : undefined}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") record(q);
        }}
      />
      {compact ? null : (
        <div className="chips" role="group" aria-label="Examples">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              className="chip"
              onClick={() => {
                setQ(ex);
                record(ex);
              }}
            >
              {ex}
            </button>
          ))}
        </div>
      )}
      <div className="answers" aria-live="polite">
        {answers.length ? (
          (compact ? answers.slice(0, 2) : answers).map((a, i) => (
            <div key={`${a.ruleId}-${i}`} className={`answer ${a.verdict}`}>
              <span className="h">
                <span className={`sev ${CHIP[a.verdict]}`}>{VERDICT_LABEL[a.verdict]}</span>
                {a.head}
              </span>
              {compact ? null : <p>{a.body}</p>}
              <span className="src">{a.source}</span>
            </div>
          ))
        ) : (
          <p className="hint">Answers appear as you type.</p>
        )}
      </div>
      {compact ? (
        <Link className="btn quiet small" href="/offer" style={{ alignSelf: "flex-start" }}>
          Open the full check
        </Link>
      ) : (
        <p className="hint" style={{ margin: 0 }}>
          Checks the promises register and AtliQ&apos;s usual terms. Read-only: you can&apos;t change the register here.
          {canRecord ? (busy ? " Saving…" : " Press Enter to keep this check in your recent checks.") : null}
        </p>
      )}
    </div>
  );
}
