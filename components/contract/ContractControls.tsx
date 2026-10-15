"use client";

// Contract controls: the deal owner (or an admin) changes the client deadline and asks Karandeep for a quick
// decision; deleting always goes through an admin (the owner asks with a reason, an admin approves or declines).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/Dialog";
import { useToast } from "@/components/Toast";
import { declineDeletion, deleteContract, editClientDeadline, requestDeletion, requestQuickDecision, withdrawDeletionRequest, withdrawQuickDecision } from "@/app/actions/contract";
import { formatDate } from "@/lib/checks/dates";

type Result = { ok: true } | { ok: false; error: string };

function useAct() {
  const [busy, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const run = (fn: () => Promise<Result>, ok: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return toast(r.error, { tone: "error" });
      after?.();
      router.refresh();
      if (ok) toast(ok);
    });
  return { busy, run, router, toast, start };
}

export function EditDeadlineButton({ contractId, clientDeadline }: { contractId: string; clientDeadline: string | null }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(clientDeadline ?? "");
  const { busy, run } = useAct();
  return (
    <>
      <button type="button" className="btn small" onClick={() => (setDate(clientDeadline ?? ""), setOpen(true))}>
        Change client deadline
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} label="Change the client deadline">
        <h2 style={{ margin: 0 }}>Change the client deadline</h2>
        <form
          style={{ display: "flex", flexDirection: "column", gap: 14 }}
          onSubmit={(e) => {
            e.preventDefault();
            run(() => editClientDeadline(contractId, date || null), "Client deadline saved. The change is in the activity log.", () => setOpen(false));
          }}
        >
          <div className="row">
            <label htmlFor="ed-due">Client deadline</label>
            <input id="ed-due" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <span className="hint">Now {clientDeadline ? formatDate(clientDeadline) : "not set"}. Review-by dates, the deadlines page and the dashboards follow it.</span>
          </div>
          <div className="btns">
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={busy || date === (clientDeadline ?? "")}>
              Save
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

/** The deal owner asks an admin to delete the contract; nothing is deleted until an admin approves. */
export function RequestDeletionButton({ contractId, title }: { contractId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { busy, run } = useAct();
  return (
    <>
      <button type="button" className="btn small quiet" onClick={() => (setReason(""), setOpen(true))}>
        Ask to delete
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} label={`Ask to delete ${title}`}>
        <h2 style={{ margin: 0 }}>Ask an admin to delete this contract</h2>
        <p style={{ margin: 0 }}>
          <b>{title}</b> stays until an admin approves. Every deletion is approved by an admin and recorded in the activity log.
        </p>
        <div className="row">
          <label htmlFor="del-why">Why should it be deleted?</label>
          <textarea id="del-why" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Uploaded twice by mistake; the correct copy is v2." />
        </div>
        <div className="btns">
          <button type="button" className="btn" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={busy || reason.trim().length < 10} onClick={() => run(() => requestDeletion(contractId, reason), "Sent to the admins for approval.", () => setOpen(false))}>
            Send for approval
          </button>
        </div>
      </Dialog>
    </>
  );
}

export function WithdrawDeletion({ contractId }: { contractId: string }) {
  const { busy, run } = useAct();
  return (
    <button type="button" className="btn small quiet" disabled={busy} onClick={() => run(() => withdrawDeletionRequest(contractId), "Deletion request withdrawn.")}>
      Withdraw
    </button>
  );
}

/** Admin: delete (approving a pending request, or on their own with a reason) or decline the request. */
export function DeleteContractButton({ contractId, title, signed, lastInDeal, request }: { contractId: string; title: string; signed: boolean; lastInDeal: boolean; request: { by: string; reason: string | null } | null }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const { busy, run, router, toast, start } = useAct();
  const why = request?.reason ?? reason;
  return (
    <>
      <button type="button" className={`btn small${request ? " primary" : " quiet"}`} style={request ? { background: "var(--serious)", borderColor: "var(--serious)" } : { color: "var(--serious)" }} onClick={() => (setTyped(""), setReason(""), setOpen(true))}>
        {request ? "Approve and delete" : "Delete"}
      </button>
      {request ? (
        <button type="button" className="btn small quiet" disabled={busy} onClick={() => run(() => declineDeletion(contractId, ""), `Kept. ${request.by} has been told.`)}>
          Decline
        </button>
      ) : null}
      <Dialog open={open} onClose={() => setOpen(false)} label={`Delete ${title}`}>
        <h2 style={{ margin: 0 }}>{request ? `Approve ${request.by}'s request?` : "Delete this contract?"}</h2>
        <p style={{ margin: 0 }}>
          <b>{title}</b> and its reviews, findings, marks, counsel questions and assignments are removed for everyone. This can&apos;t be undone; the activity log keeps who asked, who approved and why.
        </p>
        {request ? <p className="ask">{request.reason}</p> : null}
        {signed ? <p className="warnline">It&apos;s a signed contract: reviews will no longer be checked against it, and the coverage line drops by one.</p> : null}
        {lastInDeal ? <p className="warnline">It&apos;s the deal&apos;s only document, so the deal and its call notes go too.</p> : null}
        {request ? null : (
          <div className="row">
            <label htmlFor="del-reason">Why is it being deleted?</label>
            <textarea id="del-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Uploaded to the wrong deal." />
          </div>
        )}
        <div className="row">
          <label htmlFor="del-typed">Type DELETE to confirm</label>
          <input id="del-typed" type="text" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </div>
        <div className="btns">
          <button type="button" className="btn" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            style={{ background: "var(--serious)", borderColor: "var(--serious)" }}
            disabled={busy || typed.trim().toLowerCase() !== "delete" || why.trim().length < 10}
            onClick={() =>
              start(async () => {
                const r = await deleteContract(contractId, typed, reason);
                if (!r.ok) return toast(r.error, { tone: "error" });
                setOpen(false);
                toast(`${title} was deleted.`);
                router.push("/contracts");
                router.refresh();
              })
            }
          >
            Delete for everyone
          </button>
        </div>
      </Dialog>
    </>
  );
}

export function QuickDecisionButton({ contractId, clientDeadline }: { contractId: string; clientDeadline: string | null }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  return (
    <>
      <button type="button" className="btn small primary" onClick={() => setOpen(true)}>
        Ask Karandeep to decide
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} label="Ask for a quick decision">
        <h2 style={{ margin: 0 }}>Ask Karandeep for a quick decision</h2>
        <p className="hint" style={{ margin: 0 }}>
          He gets a notification and this contract goes first in his &ldquo;decide&rdquo; card. He still decides; AtliQ Review never signs anything.
        </p>
        <div className="row">
          <label htmlFor="qd-note">Why now? (optional)</label>
          <textarea id="qd-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={clientDeadline ? "The client wants to sign this week." : "The client is ready to sign."} />
        </div>
        <div className="btns">
          <button type="button" className="btn" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={() =>
              start(async () => {
                const r = await requestQuickDecision(contractId, note);
                if (!r.ok) return toast(r.error, { tone: "error" });
                setOpen(false);
                router.refresh();
                toast("Asked Karandeep for a quick decision.");
              })
            }
          >
            Send the request
          </button>
        </div>
      </Dialog>
    </>
  );
}

export function WithdrawQuickDecision({ contractId }: { contractId: string }) {
  const [busy, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  return (
    <button
      type="button"
      className="btn small quiet"
      disabled={busy}
      onClick={() =>
        start(async () => {
          const r = await withdrawQuickDecision(contractId);
          if (!r.ok) return toast(r.error, { tone: "error" });
          router.refresh();
        })
      }
    >
      Withdraw
    </button>
  );
}
