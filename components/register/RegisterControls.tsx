"use client";

// Register editing for an admin: confirm a promise, correct it, add one, record a waiver, and label a past
// position. Everyone else sees the register read-only (the page does not render these).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/Dialog";
import { useToast } from "@/components/Toast";
import { addCommitment, addWaiver, confirmCommitment, editCommitment, labelPosition, type CommitmentInput, type WaiverInput } from "@/app/actions/register";
import { PRECEDENT_LABELS } from "@/lib/format";

export type PromiseValues = CommitmentInput & { id: string };

const EMPTY: CommitmentInput = {
  type: "non_compete",
  contract: "",
  signed: "",
  entity: "PVT",
  clauses: "",
  bindsAffiliates: false,
  activity: "",
  forWhom: "",
  territory: "",
  domain: "",
  starts: "",
  ends: "",
  endRule: "",
  quote: "",
};

function useRun() {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return toast(r.error ?? "Something went wrong.", { tone: "error" });
      after?.();
      router.refresh();
      toast(success);
    });
  return { busy, run };
}

export function PromiseControls({ row }: { row: PromiseValues & { confirmed: boolean; label: string } }) {
  const { busy, run } = useRun();
  const [edit, setEdit] = useState(false);
  const [waiver, setWaiver] = useState(false);
  return (
    <span className="dismiss-row" style={{ marginTop: 6 }}>
      {!row.confirmed ? (
        <button type="button" className="btn small primary" disabled={busy} onClick={() => run(() => confirmCommitment(row.id), `${row.id} confirmed.`)}>
          Confirm
        </button>
      ) : null}
      <button type="button" className="btn small quiet" onClick={() => setEdit(true)}>
        Correct
      </button>
      <button type="button" className="btn small quiet" onClick={() => setWaiver(true)}>
        Add waiver
      </button>
      <PromiseDialog open={edit} onClose={() => setEdit(false)} title={`Correct ${row.id}`} initial={row} busy={busy} onSave={(v) => run(() => editCommitment(row.id, v), `${row.id} corrected. Reviews use the new wording from now on.`, () => setEdit(false))} />
      <WaiverDialog open={waiver} onClose={() => setWaiver(false)} label={row.label} busy={busy} onSave={(v) => run(() => addWaiver(row.id, v), `Waiver added to ${row.id}.`, () => setWaiver(false))} />
    </span>
  );
}

export function AddPromiseButton() {
  const { busy, run } = useRun();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn small" onClick={() => setOpen(true)}>
        Add a promise
      </button>
      <PromiseDialog open={open} onClose={() => setOpen(false)} title="Add a promise" initial={EMPTY} busy={busy} onSave={(v) => run(() => addCommitment(v), "Promise added. The next review checks against it.", () => setOpen(false))} />
    </>
  );
}

function PromiseDialog({ open, onClose, title, initial, busy, onSave }: { open: boolean; onClose: () => void; title: string; initial: CommitmentInput; busy: boolean; onSave: (v: CommitmentInput) => void }) {
  const [v, setV] = useState<CommitmentInput>(initial);
  const set = (k: keyof CommitmentInput) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Dialog open={open} onClose={onClose} label={title} wide>
      <h2 style={{ margin: 0 }}>{title}</h2>
      <form
        key={open ? "open" : "closed"}
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(v);
        }}
      >
        <div className="row">
          <label htmlFor="p-type">Kind of promise</label>
          <select id="p-type" value={v.type} onChange={set("type")}>
            <option value="non_compete">Non-compete</option>
            <option value="best_price">Best price</option>
            <option value="partner_exclusivity">Partner exclusivity</option>
            <option value="ip_assigned">IP assigned</option>
          </select>
        </div>
        <div className="row">
          <label htmlFor="p-contract">Contract it is in</label>
          <input id="p-contract" value={v.contract} onChange={set("contract")} placeholder="Al Noor Hospitality — MSA" />
        </div>
        <div className="row">
          <label htmlFor="p-entity">Binds</label>
          <select id="p-entity" value={v.entity} onChange={set("entity")}>
            <option value="PVT">AtliQ Technologies Pvt Ltd</option>
            <option value="INC">AtliQ Inc</option>
          </select>
        </div>
        <div className="row">
          <label htmlFor="p-clauses">Clauses</label>
          <input id="p-clauses" value={v.clauses} onChange={set("clauses")} placeholder="9.1, 9.2" />
        </div>
        <div className="row span2">
          <label htmlFor="p-activity">What it restricts</label>
          <textarea id="p-activity" rows={2} value={v.activity} onChange={set("activity")} />
        </div>
        <div className="row">
          <label htmlFor="p-for">For whom</label>
          <input id="p-for" value={v.forWhom} onChange={set("forWhom")} placeholder="Hotel groups in the GCC" />
        </div>
        <div className="row">
          <label htmlFor="p-territory">Where (comma separated)</label>
          <input id="p-territory" value={v.territory} onChange={set("territory")} placeholder="UAE, Saudi Arabia" />
        </div>
        <div className="row">
          <label htmlFor="p-domain">Field</label>
          <input id="p-domain" value={v.domain} onChange={set("domain")} placeholder="hospitality guest analytics" />
        </div>
        <label className="row" style={{ flexDirection: "row", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={v.bindsAffiliates} onChange={(e) => setV((x) => ({ ...x, bindsAffiliates: e.target.checked }))} />
          Binds every AtliQ affiliate too
        </label>
        <div className="row">
          <label htmlFor="p-signed">Signed</label>
          <input id="p-signed" type="date" value={v.signed} onChange={set("signed")} />
        </div>
        <div className="row">
          <label htmlFor="p-starts">Starts</label>
          <input id="p-starts" type="date" value={v.starts} onChange={set("starts")} />
        </div>
        <div className="row">
          <label htmlFor="p-ends">Ends</label>
          <input id="p-ends" type="date" value={v.ends} onChange={set("ends")} />
        </div>
        <div className="row">
          <label htmlFor="p-rule">Or how it ends</label>
          <input id="p-rule" value={v.endRule} onChange={set("endRule")} placeholder="term + 18 months" />
        </div>
        <div className="row span2">
          <label htmlFor="p-quote">Clause wording</label>
          <textarea id="p-quote" rows={3} value={v.quote} onChange={set("quote")} />
          <span className="hint">Live or expired is worked out from the dates, never typed in.</span>
        </div>
        <div className="btns span2">
          <button type="button" className="btn quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            Save
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function WaiverDialog({ open, onClose, label, busy, onSave }: { open: boolean; onClose: () => void; label: string; busy: boolean; onSave: (v: WaiverInput) => void }) {
  const [v, setV] = useState<WaiverInput>({ source: "", dated: "", scope: "", excludes: "", quote: "" });
  const set = (k: keyof WaiverInput) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Dialog open={open} onClose={onClose} label={`Add a waiver to ${label}`}>
      <h2 style={{ margin: 0 }}>Add a waiver</h2>
      <p className="hint" style={{ margin: 0 }}>{label}</p>
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(v);
        }}
      >
        <div className="row span2">
          <label htmlFor="w-source">Letter or email</label>
          <input id="w-source" value={v.source} onChange={set("source")} placeholder="Al Noor waiver letter" />
        </div>
        <div className="row">
          <label htmlFor="w-dated">Dated</label>
          <input id="w-dated" type="date" value={v.dated} onChange={set("dated")} />
        </div>
        <div className="row span2">
          <label htmlFor="w-scope">What it allows</label>
          <input id="w-scope" value={v.scope} onChange={set("scope")} />
        </div>
        <div className="row span2">
          <label htmlFor="w-excl">What it does not cover</label>
          <input id="w-excl" value={v.excludes} onChange={set("excludes")} />
        </div>
        <div className="row span2">
          <label htmlFor="w-quote">Wording</label>
          <textarea id="w-quote" rows={3} value={v.quote} onChange={set("quote")} />
        </div>
        <div className="btns span2">
          <button type="button" className="btn quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            Save waiver
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function LabelSelect({ id, label, who }: { id: number; label: string; who: string }) {
  const { busy, run } = useRun();
  return (
    <select
      aria-label={`Label for ${who}`}
      value={label}
      disabled={busy}
      onChange={(e) => {
        const next = e.target.value;
        run(() => labelPosition(id, next), `${who} labelled ${PRECEDENT_LABELS[next]?.text ?? next}.`);
      }}
    >
      {Object.entries(PRECEDENT_LABELS).map(([k, l]) => (
        <option key={k} value={k}>
          {l.text}
        </option>
      ))}
    </select>
  );
}
