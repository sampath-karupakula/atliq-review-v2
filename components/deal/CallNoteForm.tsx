"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addCallNote } from "@/app/actions/deals";
import { useToast } from "@/components/Toast";

export function CallNoteForm({ dealId, today }: { dealId: string; today: string }) {
  const [text, setText] = useState("");
  const [on, setOn] = useState(today);
  const [busy, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  return (
    <section className="panel">
      <h3>Add a call note</h3>
      <form
        style={{ display: "flex", flexDirection: "column", gap: 10 }}
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await addCallNote(dealId, text, on);
            if (!r.ok) return toast(r.error, { tone: "error" });
            setText("");
            router.refresh();
            toast("Call note added. It's compared with the draft when the AI features arrive (P12).");
          });
        }}
      >
        <label className="fl" htmlFor="callNote">
          <span>What was said or agreed</span>
          <textarea id="callNote" value={text} onChange={(e) => setText(e.target.value)} placeholder="For example: agreed India hotels only, no GCC properties" />
        </label>
        <label className="fl" htmlFor="callOn" style={{ maxWidth: 220 }}>
          <span>Date of the call</span>
          <input id="callOn" type="date" value={on} onChange={(e) => setOn(e.target.value)} />
        </label>
        <div className="dismiss-row">
          <button type="submit" className="btn primary" disabled={busy || text.trim().length < 10}>
            Add note
          </button>
          <span className="hint">Notes stay inside AtliQ Review and are never sent to the client.</span>
        </div>
      </form>
    </section>
  );
}
