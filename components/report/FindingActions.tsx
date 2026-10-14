"use client";

// What a person can do with one finding. Serious: Karandeep accepts it with a written reason (it stays visible and no
// longer locks the decision) or withdraws that acceptance. Everything else: dismiss with a reason, restore. Each
// change shows at once, with Undo in the message (user control and freedom).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptFinding, dismissFinding, restoreFinding, withdrawAcceptance } from "@/app/actions/workflow";
import { useToast } from "@/components/Toast";

export type Perms = { accept: boolean; dismiss: boolean; dismissSerious: boolean; decide: boolean; comment: boolean };

const REASONS = ["Standard for AtliQ", "Not relevant to this deal", "Already agreed with the client", "Other"];

export function FindingActions({
  f,
  perms,
  onOpenContract,
}: {
  f: { id: string; severity: string; title: string; dismissed: boolean; accepted: boolean; acceptNote: string | null; hasHighlight: boolean };
  perms: Perms;
  onOpenContract: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, start] = useTransition();
  const [mode, setMode] = useState<"idle" | "accept" | "dismiss">("idle");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState(REASONS[0]!);
  const [other, setOther] = useState("");
  const serious = f.severity === "serious";
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string, undo?: () => Promise<unknown>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        toast(r.error ?? "That didn't work.", { tone: "error" });
        return;
      }
      setMode("idle");
      router.refresh();
      toast(done, undo ? () => void undo().then(() => router.refresh()) : undefined);
    });

  const open = (
    <button type="button" className="btn small" onClick={onOpenContract} disabled={!f.hasHighlight}>
      Open in contract
    </button>
  );

  if (!perms.comment) {
    return (
      <div className="f-actions">
        {open}
        <span className="hint">Read-only. Ask questions in the counsel pack.</span>
      </div>
    );
  }

  if (f.dismissed) {
    return (
      <div className="f-actions">
        {(serious ? perms.dismissSerious : perms.dismiss) ? (
          <button type="button" className="btn small" disabled={busy} onClick={() => run(() => restoreFinding(f.id), `Restored “${f.title}”.`)}>
            Restore
          </button>
        ) : null}
      </div>
    );
  }

  if (serious) {
    if (f.accepted) {
      return (
        <div className="f-actions" style={{ justifyContent: "space-between" }}>
          <span style={{ fontSize: 13.5 }}>
            <b>Accepted risk:</b> “{f.acceptNote}”
          </span>
          {perms.accept ? (
            <button type="button" className="btn small" disabled={busy} onClick={() => run(() => withdrawAcceptance(f.id), "Acceptance withdrawn. It locks the decision again.")}>
              Withdraw
            </button>
          ) : null}
        </div>
      );
    }
    if (mode === "accept") {
      const n = note.trim().length;
      return (
        <div className="panel" style={{ background: "var(--paper)", gap: 8, padding: 12 }}>
          <label htmlFor={`acc-${f.id}`} style={{ fontSize: 13, fontWeight: 600 }}>
            Why are you accepting this risk?
          </label>
          <textarea id={`acc-${f.id}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: Al Noor agreed on a call to waive this; written waiver expected Friday." autoFocus />
          <p className={n >= 15 ? "hint" : "hint"} aria-live="polite">
            {n >= 15 ? "Ready to record." : `At least 15 characters, so the record makes sense later (${n} so far).`}
          </p>
          <div className="dismiss-row">
            <button
              type="button"
              className="btn primary small"
              disabled={busy || n < 15}
              onClick={() => run(() => acceptFinding(f.id, note), "Risk accepted with your note.", () => withdrawAcceptance(f.id))}
            >
              Accept risk
            </button>
            <button type="button" className="btn small" onClick={() => setMode("idle")}>
              Cancel
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="f-actions">
        {open}
        {perms.accept ? (
          <button type="button" className="btn small" onClick={() => setMode("accept")}>
            Accept with a note
          </button>
        ) : (
          <span className="hint">Only Karandeep can accept a Serious risk.</span>
        )}
      </div>
    );
  }

  return (
    <div className="f-actions">
      {open}
      {perms.dismiss ? (
        mode === "dismiss" ? (
          <span className="dismiss-row">
            <label className="hint" htmlFor={`dr-${f.id}`}>
              Reason
            </label>
            <select id={`dr-${f.id}`} className="field" style={{ width: "auto", minHeight: 34 }} value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            {reason === "Other" ? <input type="text" aria-label="Your reason" value={other} onChange={(e) => setOther(e.target.value)} placeholder="Say why" style={{ width: 200, minHeight: 34 }} /> : null}
            <button
              type="button"
              className="btn primary small"
              disabled={busy || (reason === "Other" && other.trim().length < 5)}
              onClick={() => {
                const why = reason === "Other" ? other.trim() : reason;
                run(() => dismissFinding(f.id, why), `Dismissed: ${why}.`, () => restoreFinding(f.id));
              }}
            >
              Dismiss
            </button>
            <button type="button" className="btn quiet small" onClick={() => setMode("idle")}>
              Cancel
            </button>
          </span>
        ) : (
          <button type="button" className="btn quiet small" onClick={() => setMode("dismiss")}>
            Dismiss with a reason
          </button>
        )
      ) : null}
    </div>
  );
}
