"use client";

// The marking screen: agree / disagree / question per finding, Karandeep's conditions first in a re-review, a bar
// that fills as you mark, and "Review done" that stays off until everything is marked.
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { finishReview, reviewHeartbeat, setConditionAddressed, setMark } from "@/app/actions/handoff";
import { canFinish, markProgress, needsNote, pushbackFromMarks, type Mark, type MarkRow } from "@/lib/review/handoff";
import { clauseLabel } from "@/lib/display";

type Item = { id: string; severity: string; title: string; clause: string | null; quote: string | null; whatItMeans: string | null; dismissed: boolean; versionTag: string | null };
type Condition = { id: string; text: string; addressed: string | null };
const SEV: Record<string, [string, string]> = { serious: ["serious", "Serious"], negotiable: ["negotiable", "Negotiable"], not_sure: ["unsure", "Not sure"] };
const MARKS: Mark[] = ["agree", "disagree", "question"];

export function MarkingBoard({ contractId, items, initialMarks, conditions, done, readOnly, round }: { contractId: string; items: Item[]; initialMarks: MarkRow[]; conditions: Condition[]; done: boolean; readOnly: boolean; round: number }) {
  const [marks, setMarks] = useState<MarkRow[]>(initialMarks);
  const [conds, setConds] = useState(conditions);
  const [busy, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const p = markProgress(items, marks);
  const gate = canFinish(items, marks, conds);
  const locked = done || readOnly;

  // Count time on this screen while it is open and in front (one minute at a time, checked on the server).
  useEffect(() => {
    if (locked) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible" && document.hasFocus()) void reviewHeartbeat(contractId);
    }, 60_000);
    return () => clearInterval(t);
  }, [contractId, locked]);

  const save = (findingId: string, mark: Mark, note: string) => {
    setMarks((ms) => [...ms.filter((m) => m.findingId !== findingId), { findingId, mark, note }]);
    start(async () => {
      const r = await setMark(contractId, findingId, mark, note);
      if (!r.ok) toast(r.error, { tone: "error" });
    });
  };

  return (
    <>
      {conds.length ? (
        <div className="group">
          <h2 style={{ fontSize: 18 }}>Karandeep&apos;s conditions · check them in v{round}</h2>
          {conds.map((c) => (
            <div key={c.id} className="mark-row">
              <div className="top">
                <b style={{ flex: 1, minWidth: 200 }}>{c.text}</b>
                <span className="seg" role="group" aria-label="Addressed in this version?">
                  {(["yes", "no"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={c.addressed === k}
                      disabled={locked}
                      onClick={() => {
                        setConds((cs) => cs.map((x) => (x.id === c.id ? { ...x, addressed: k } : x)));
                        start(async () => {
                          const r = await setConditionAddressed(contractId, c.id, k);
                          if (!r.ok) toast(r.error, { tone: "error" });
                        });
                      }}
                    >
                      {k === "yes" ? "Addressed" : "Not addressed"}
                    </button>
                  ))}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="panel">
        <div className="progress-head">
          <span>
            <b className="num">
              {p.marked} of {p.total}
            </b>{" "}
            marked
          </span>
          <span className="hint">{p.left ? `${p.left} to go` : "All marked"}</span>
        </div>
        <div className="meter goal">
          <i style={{ width: `${p.total ? (p.marked / p.total) * 100 : 100}%` }} />
        </div>
        <p className="hint" style={{ margin: 0 }}>
          Agree means &ldquo;push back on this&rdquo;. Your Agree marks on Serious and Negotiable findings become the pushback list. Disagree and Question need a note; they show on the report for Karandeep.
        </p>
      </div>

      <div className="group">
        {items.map((f) => {
          const m = marks.find((x) => x.findingId === f.id);
          const [cls, name] = SEV[f.severity] ?? ["neutral", f.severity];
          return (
            <div key={f.id} className="mark-row">
              <div className="top">
                <span className={`sev ${cls}`}>{name}</span>
                <span className="hint">{clauseLabel(f.clause) || "Whole document"}</span>
                <b style={{ flex: 1, minWidth: 180 }}>{f.title}</b>
                {f.versionTag === "unchanged" && m ? <span className="tag">Unchanged · your mark kept</span> : f.versionTag === "new" ? <span className="tag new">New in this version</span> : null}
                <span className="seg" role="group" aria-label={`Your view on ${f.title}`}>
                  {MARKS.map((k) => (
                    <button key={k} type="button" aria-pressed={m?.mark === k} disabled={locked} onClick={() => save(f.id, k, m?.note ?? "")}>
                      {k[0]!.toUpperCase() + k.slice(1)}
                    </button>
                  ))}
                </span>
              </div>
              {f.quote ? <p className="quote" style={{ margin: "8px 0 0" }}>{f.quote}</p> : null}
              {m && needsNote(m.mark) ? (
                <input
                  type="text"
                  aria-label={m.mark === "question" ? "Your question for Karandeep" : "Why you disagree"}
                  placeholder={m.mark === "question" ? "Your question for Karandeep" : "Why you disagree"}
                  defaultValue={m.note ?? ""}
                  disabled={locked}
                  style={{ marginTop: 8 }}
                  onBlur={(e) => {
                    if (e.target.value !== (m.note ?? "")) save(f.id, m.mark, e.target.value);
                  }}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="dismiss-row">
        {done ? (
          <span className="tag fast">Review done</span>
        ) : readOnly ? (
          <span className="hint">Only the assigned reviewer marks this review.</span>
        ) : (
          <>
            <button
              type="button"
              className="btn primary"
              disabled={!gate.ok || busy}
              onClick={() =>
                start(async () => {
                  const r = await finishReview(contractId);
                  if (!r.ok) return toast(r.error, { tone: "error" });
                  router.refresh();
                  toast("Review done. Karandeep has been told in AtliQ Review.");
                })
              }
            >
              {round > 2 ? "Changes checked" : "Review done"}
            </button>
            <span className="hint">{gate.ok ? `${pushbackFromMarks(items, marks).length} item${pushbackFromMarks(items, marks).length === 1 ? "" : "s"} go to the pushback list.` : `Not yet: ${gate.why}.`}</span>
          </>
        )}
      </div>
    </>
  );
}
