"use client";

// One lock, at the only point of no return (feature 21). Intend to sign stays off until every Serious item is settled
// (accepted with a note or dismissed). Rejecting as written sends the contract back to negotiation with conditions;
// rejecting for good needs a reason. Every decision is a status only: nothing is signed, sent or changed.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDecision } from "@/app/actions/workflow";
import { rejectAsWritten } from "@/app/actions/negotiation";
import { useToast } from "@/components/Toast";

type Mode = "idle" | "sign" | "negotiate" | "reject";

export function DecisionPanel({
  contractId,
  serious,
  decision,
  decisionNote,
  canDecide,
  onJump,
}: {
  contractId: string;
  serious: { id: string; title: string; settled: boolean }[];
  decision: "sign_intended" | "reject" | null;
  decisionNote: string | null;
  canDecide: boolean;
  onJump: (id: string) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, start] = useTransition();
  const [mode, setMode] = useState<Mode>("idle");
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const settled = serious.filter((s) => s.settled).length;
  const locked = settled < serious.length;

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string, undo?: () => Promise<unknown>) =>
    start(async () => {
      setErr(null);
      const r = await fn();
      if (!r.ok) {
        setErr(r.error ?? "That didn't work.");
        return;
      }
      setMode("idle");
      setText("");
      router.refresh();
      toast(done, undo ? () => void undo().then(() => router.refresh()) : undefined);
    });

  if (decision) {
    return (
      <div className="decide">
        <h3>Decision</h3>
        <div className="recorded" style={{ border: "1px solid var(--ok)", background: "var(--ok-soft)", borderRadius: 6, padding: 12, display: "flex", flexDirection: "column", gap: 8, fontSize: 13.5 }}>
          <b style={{ color: "var(--ok)" }}>Recorded: {decision === "reject" ? "Reject" : "Intend to sign"}</b>
          {decisionNote ? <span>{decisionNote}</span> : null}
          <span>Nothing was signed or sent.</span>
          {decision === "sign_intended" ? (
            <a className="btn small primary" href="/register">
              Check the register for new promises
            </a>
          ) : null}
          {canDecide ? (
            <button type="button" className="btn quiet small" disabled={busy} onClick={() => act(() => setDecision(contractId, null, ""), "Decision removed.")} style={{ alignSelf: "flex-start" }}>
              Undo
            </button>
          ) : null}
        </div>
        <p className="guard">AtliQ Review never signs, sends or edits a contract.</p>
      </div>
    );
  }

  return (
    <div className="decide">
      <h3>Decision</h3>
      <div className="lock">
        <span className="state">
          {locked ? (
            <>
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                <rect x="3" y="7" width="10" height="7" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <path d="M5 7V5a3 3 0 016 0v2" fill="none" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              Locked until Serious items are settled
            </>
          ) : serious.length ? (
            "Ready to decide"
          ) : (
            "No Serious items: nothing locks the decision"
          )}
        </span>
        {serious.length ? (
          <>
            <div className="progress-head">
              <span>
                <b className="num">
                  {settled} of {serious.length}
                </b>{" "}
                Serious settled
              </span>
              <span className="hint">{locked ? `${serious.length - settled} to go` : "Done"}</span>
            </div>
            <div className="meter goal">
              <i style={{ width: `${(settled / serious.length) * 100}%` }} />
            </div>
            <ul>
              {serious.map((s) => (
                <li key={s.id} className={s.settled ? "done" : ""}>
                  <button type="button" onClick={() => onJump(s.id)}>
                    {s.title}
                  </button>
                </li>
              ))}
            </ul>
            {locked ? <span className="hint">Settle each one by accepting it with a note, or upload a revised version that fixes it.</span> : null}
          </>
        ) : null}
      </div>

      {canDecide ? (
        mode === "idle" ? (
          <>
            <button type="button" className="btn primary block" disabled={locked || busy} onClick={() => setMode("sign")}>
              Intend to sign
            </button>
            <button type="button" className="btn block" disabled={busy} onClick={() => setMode("negotiate")}>
              Reject as written · open to negotiate
            </button>
            <button type="button" className="btn block quiet" disabled={busy} onClick={() => setMode("reject")}>
              Reject for good
            </button>
          </>
        ) : (
          <div style={{ border: "1px solid var(--ink)", borderRadius: 6, padding: 12, display: "flex", flexDirection: "column", gap: 8, fontSize: 13.5 }}>
            <b>{mode === "sign" ? "Record “Intend to sign”?" : mode === "negotiate" ? "Reject this version, open to negotiate?" : "Reject for good?"}</b>
            <span>
              {mode === "sign"
                ? "This sets a status only. Nothing is signed, sent or changed in the contract."
                : mode === "negotiate"
                  ? "The contract goes back to negotiating. Your conditions join the pushback list, and the next version is checked against them."
                  : "The contract leaves the queue. You can undo this later."}
            </span>
            {mode === "negotiate" ? (
              <label className="fl" htmlFor="neg-conditions">
                <span>What would make it acceptable? One condition per line</span>
                <textarea id="neg-conditions" value={text} onChange={(e) => setText(e.target.value)} placeholder={"Written waiver from Al Noor naming this client before signing\nLiability capped at 1× the fees"} autoFocus />
              </label>
            ) : null}
            {mode === "reject" ? (
              <label className="fl" htmlFor="rej-note">
                <span>Why (it goes in the record)</span>
                <textarea id="rej-note" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
              </label>
            ) : null}
            {err ? <p className="err">{err}</p> : null}
            <div className="dismiss-row">
              <button
                type="button"
                className="btn primary small"
                disabled={busy}
                onClick={() =>
                  mode === "sign"
                    ? act(() => setDecision(contractId, "sign_intended", ""), "Decision recorded: intend to sign.", () => setDecision(contractId, null, ""))
                    : mode === "reject"
                      ? act(() => setDecision(contractId, "reject", text), "Decision recorded: reject.", () => setDecision(contractId, null, ""))
                      : act(() => rejectAsWritten(contractId, text.split("\n")), "Back to negotiating with your conditions.")
                }
              >
                Record decision
              </button>
              <button
                type="button"
                className="btn small"
                onClick={() => {
                  setMode("idle");
                  setErr(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )
      ) : (
        <p className="hint">Only Karandeep records the decision.</p>
      )}
      <p className="guard">AtliQ Review never signs, sends or edits a contract.</p>
    </div>
  );
}
