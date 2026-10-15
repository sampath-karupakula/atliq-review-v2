"use client";

// Deal-owner (or admin) controls on a contract: edit the contract and deal details, delete the contract, and ask
// Karandeep for a quick decision after the first review.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/Dialog";
import { useToast } from "@/components/Toast";
import { deleteContract, editContractDetails, requestQuickDecision, withdrawQuickDecision, type DetailsInput } from "@/app/actions/contract";
import { docLabel } from "@/lib/display";

const DOC_TYPES = ["msa", "sow", "nda", "baa", "dpa", "partnership", "subcontract", "freelancer", "waiver", "other"] as const;
type DealFields = NonNullable<DetailsInput["deal"]>;
const tri = (v: boolean | null) => (v === null ? "" : v ? "yes" : "no");
const fromTri = (v: string) => (v === "" ? null : v === "yes");

export function EditDetailsButton({ contractId, initial, people, canChangeOwner }: { contractId: string; initial: DetailsInput; people: string[]; canChangeOwner: boolean }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(initial);
  const [busy, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const setDeal = (patch: Partial<DealFields>) => setV((x) => ({ ...x, deal: x.deal ? { ...x.deal, ...patch } : x.deal }));
  const d = v.deal;
  return (
    <>
      <button type="button" className="btn small" onClick={() => (setV(initial), setOpen(true))}>
        Edit details
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} label="Edit contract details" wide>
        <h2 style={{ margin: 0 }}>Edit details</h2>
        <form
          className="form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await editContractDetails(contractId, v);
              if (!r.ok) return toast(r.error, { tone: "error" });
              setOpen(false);
              router.refresh();
              toast("Details saved. The change is in the activity log.");
            });
          }}
        >
          <div className="row span2">
            <label htmlFor="ed-title">Title</label>
            <input id="ed-title" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
          </div>
          <div className="row">
            <label htmlFor="ed-cp">Counterparty</label>
            <input id="ed-cp" value={v.counterparty} onChange={(e) => setV({ ...v, counterparty: e.target.value })} />
          </div>
          <div className="row">
            <label htmlFor="ed-type">Document type</label>
            <select id="ed-type" value={v.docType} onChange={(e) => setV({ ...v, docType: e.target.value as (typeof DOC_TYPES)[number] })}>
              {DOC_TYPES.map((t) => (
                <option key={t} value={t}>
                  {docLabel(t)}
                </option>
              ))}
            </select>
          </div>
          {d ? (
            <>
              <h3 className="span2" style={{ margin: "8px 0 0" }}>
                Deal
              </h3>
              <div className="row">
                <label htmlFor="ed-due">Client deadline</label>
                <input id="ed-due" type="date" value={d.clientDeadline ?? ""} onChange={(e) => setDeal({ clientDeadline: e.target.value || null })} />
              </div>
              <div className="row">
                <label htmlFor="ed-duenote">Why that date (optional)</label>
                <input id="ed-duenote" value={d.deadlineNote ?? ""} onChange={(e) => setDeal({ deadlineNote: e.target.value })} placeholder="Client wants go-live before Eid" />
              </div>
              <div className="row">
                <label htmlFor="ed-value">Deal value</label>
                <input id="ed-value" type="number" min={0} step="any" value={d.valueUsd ?? ""} onChange={(e) => setDeal({ valueUsd: e.target.value === "" ? null : Number(e.target.value) })} />
              </div>
              <div className="row">
                <label htmlFor="ed-cur">Currency</label>
                <select id="ed-cur" value={d.currency} onChange={(e) => setDeal({ currency: e.target.value as DealFields["currency"] })}>
                  {["USD", "EUR", "GBP", "INR", "AED"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="row">
                <label htmlFor="ed-domain">Business domain</label>
                <input id="ed-domain" value={d.domain} onChange={(e) => setDeal({ domain: e.target.value })} />
              </div>
              <div className="row">
                <label htmlFor="ed-country">Client country</label>
                <input id="ed-country" value={d.clientCountry} onChange={(e) => setDeal({ clientCountry: e.target.value })} />
              </div>
              <div className="row">
                <label htmlFor="ed-pd">Personal data</label>
                <select id="ed-pd" value={tri(d.personalData)} onChange={(e) => setDeal({ personalData: fromTri(e.target.value) })}>
                  <option value="">Not known</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div className="row">
                <label htmlFor="ed-phi">Patient data (PHI)</label>
                <select id="ed-phi" value={tri(d.phi)} onChange={(e) => setDeal({ phi: fromTri(e.target.value) })}>
                  <option value="">Not known</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div className="row">
                <label htmlFor="ed-owner">Deal owner</label>
                <select id="ed-owner" value={d.owner} disabled={!canChangeOwner} onChange={(e) => setDeal({ owner: e.target.value })}>
                  {[...new Set([d.owner, ...people])].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
                {canChangeOwner ? null : <span className="hint">Only an admin hands a deal to someone else.</span>}
              </div>
              <p className="hint span2" style={{ margin: 0 }}>
                Changing the value, country, domain or data facts marks finished reviews as based on old details; run the review again to use the new ones.
              </p>
            </>
          ) : null}
          <div className="btns span2">
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={busy}>
              Save
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function DeleteContractButton({ contractId, title, signed, lastInDeal }: { contractId: string; title: string; signed: boolean; lastInDeal: boolean }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  return (
    <>
      <button type="button" className="btn small quiet" style={{ color: "var(--serious)" }} onClick={() => (setTyped(""), setOpen(true))}>
        Delete
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} label={`Delete ${title}`}>
        <h2 style={{ margin: 0 }}>Delete this contract?</h2>
        <p style={{ margin: 0 }}>
          <b>{title}</b> and its reviews, findings, marks, counsel questions and assignments are removed for everyone. This can&apos;t be undone; the activity log keeps a line saying you deleted it.
        </p>
        {signed ? <p className="warnline">It&apos;s a signed contract: reviews will no longer be checked against it, and the coverage line drops by one.</p> : null}
        {lastInDeal ? <p className="warnline">It&apos;s the deal&apos;s only document, so the deal and its call notes go too.</p> : null}
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
            disabled={busy || typed.trim().toLowerCase() !== "delete"}
            onClick={() =>
              start(async () => {
                const r = await deleteContract(contractId, typed);
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
