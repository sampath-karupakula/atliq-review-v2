"use client";

// "Would we accept this?" — AtliQ's own buyer-side paper read as if a client had sent it to AtliQ.
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { CopyButton } from "@/components/CopyButton";
import { approveTemplateFix } from "@/app/actions/templates";
import { clauseLabel } from "@/lib/display";
import type { MirrorItem } from "@/lib/report/mirror";

export function MirrorCheck({ contractId, items, approved, canApprove }: { contractId: string; items: MirrorItem[]; approved: string[]; canApprove: boolean }) {
  const [busy, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  return (
    <section className="panel" id="mirror">
      <div className="sec-head">
        <h3>Would we accept this?</h3>
        <span className="hint">
          {items.length} clause{items.length === 1 ? "" : "s"} AtliQ would push back on if a client sent them
        </span>
      </div>
      <p className="hint" style={{ margin: 0 }}>
        AtliQ is the buyer here. Each clause is read as if a client had sent it to AtliQ. A fair version is ready to copy; if this is AtliQ&apos;s own template, approve fixing the template so the next agency doesn&apos;t receive it.
      </p>
      {items.length ? (
        items.map((m) => (
          <div key={m.findingId} className="answer warn">
            <span className="h">
              <span className="sev negotiable">Would we accept this?</span>
              {m.title}
              {m.clause ? <span className="hint">{clauseLabel(m.clause)}</span> : null}
            </span>
            {m.quote ? <p className="quote" style={{ padding: "6px 8px" }}>{m.quote}</p> : null}
            {m.clientSide ? <span className="src">{m.clientSide}</span> : null}
            <p>
              <b>Fair version:</b> {m.fairVersion}
            </p>
            <span className="dismiss-row">
              <CopyButton text={m.fairVersion} label="Copy the fair version" />
              {approved.includes(m.category) ? (
                <span className="tag fast">Template fix approved</span>
              ) : canApprove ? (
                <button
                  type="button"
                  className="btn small quiet"
                  disabled={busy}
                  onClick={() =>
                    start(async () => {
                      const r = await approveTemplateFix(contractId, m.findingId);
                      if (!r.ok) return toast(r.error, { tone: "error" });
                      router.refresh();
                      toast("Template fix approved. It's on the Register's Template fixes list.");
                    })
                  }
                >
                  Fix our template
                </button>
              ) : null}
            </span>
          </div>
        ))
      ) : (
        <p className="hint">Nothing here AtliQ would refuse from a client: the paper matches AtliQ&apos;s buyer-side terms.</p>
      )}
    </section>
  );
}
