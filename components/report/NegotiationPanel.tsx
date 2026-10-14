"use client";

// The pushback list for this round: Karandeep's conditions first, then the open Serious and Negotiable findings with
// AtliQ's softer wording. The user copies the email and sends it themselves; "Mark pushback sent" records that.
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { markPushbackSent, setConditionOpen, undoPushback } from "@/app/actions/negotiation";
import { useToast } from "@/components/Toast";
import { pushbackEmail } from "@/lib/stage";

export type PushItem = { id: string; label: string; title: string; ask: string; severity: string };

export function NegotiationPanel({
  contractId,
  round,
  counterparty,
  from,
  conditions,
  items,
  sentOn,
  canEdit,
  canDecide,
  onJump,
}: {
  contractId: string;
  round: number;
  counterparty: string;
  from: string;
  conditions: { id: string; text: string; open: boolean; addressed: string | null }[];
  items: PushItem[];
  sentOn: string | null;
  canEdit: boolean;
  canDecide: boolean;
  onJump: (id: string) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const open = conditions.filter((c) => c.open);
  const total = open.length + items.length;
  const email = pushbackEmail({ counterparty, from, conditions: open.map((c) => c.text), items: items.map((i) => ({ label: i.label, ask: i.ask })) });

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string, undo?: () => Promise<unknown>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return toast(r.error ?? "That didn't work.", { tone: "error" });
      router.refresh();
      toast(done, undo ? () => void undo().then(() => router.refresh()) : undefined);
    });

  return (
    <section style={{ border: "1.5px solid var(--nego)", background: "var(--nego-soft)", borderRadius: 8, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="sec-head">
        <h3>
          Negotiation · round {round} · {sentOn ? `waiting for ${counterparty}` : "preparing pushback"}
        </h3>
        <span className="tag">
          {total} item{total === 1 ? "" : "s"} to push back
        </span>
      </div>
      {open.length ? (
        <div style={{ background: "var(--surface)", borderRadius: 6, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          <b>Karandeep&apos;s conditions</b>
          <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
            {open.map((c) => (
              <li key={c.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <p className="quote" style={{ background: "var(--surface)" }}>
                  {c.text}
                </p>
                {canDecide ? (
                  <button
                    type="button"
                    className="btn quiet small"
                    style={{ alignSelf: "flex-start" }}
                    disabled={busy}
                    onClick={() => run(() => setConditionOpen(c.id, false), "Condition dropped.", () => setConditionOpen(c.id, true))}
                  >
                    Drop this condition
                  </button>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {items.length ? (
        <>
          <b>From the review</b>
          <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 10 }}>
            {items.map((i) => (
              <li key={i.id} style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 14 }}>
                <div>
                  <b>
                    {i.label}: {i.title}
                  </b>{" "}
                  <span className={`sev ${i.severity === "serious" ? "serious" : "negotiable"}`}>{i.severity === "serious" ? "Serious" : "Negotiable"}</span>
                </div>
                <p className="quote" style={{ background: "var(--surface)" }}>
                  {i.ask}
                </p>
                <button type="button" className="btn quiet small" style={{ alignSelf: "flex-start" }} onClick={() => onJump(i.id)}>
                  See finding
                </button>
              </li>
            ))}
          </ol>
        </>
      ) : null}
      <p className="hint">Open Serious and Negotiable findings, minus anything accepted or dismissed. If the list empties, negotiation ends by itself.</p>
      {canEdit ? (
        <div className="dismiss-row">
          {sentOn ? (
            <>
              <span className="hint">Pushback sent {sentOn}.</span>
              <Link className="btn primary" href={`/contracts/new?previous=${contractId}`}>
                Upload the revised version from {counterparty}
              </Link>
              <button type="button" className="btn quiet small" disabled={busy} onClick={() => run(() => undoPushback(contractId), "“Pushback sent” taken back.")}>
                Not sent after all
              </button>
              <span className="hint">Starts round {round + 1}: the whole contract is read again.</span>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  void navigator.clipboard?.writeText(email).then(
                    () => {
                      setCopied(true);
                      toast("Pushback email copied. Paste it into your own email.");
                    },
                    () => toast("Copy isn't available here. Select the text in the findings instead.", { tone: "error" }),
                  )
                }
              >
                {copied ? "Copied" : "Copy pushback email"}
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={busy || !total}
                onClick={() => run(() => markPushbackSent(contractId, [...open.map((c) => c.text), ...items.map((i) => `${i.label}: ${i.ask}`)]), "Marked as sent. Waiting for the revised version.", () => undoPushback(contractId))}
              >
                Mark pushback sent
              </button>
              <span className="hint">AtliQ Review never sends it. You send it from your own email.</span>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
