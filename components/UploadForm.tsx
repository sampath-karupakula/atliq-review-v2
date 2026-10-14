"use client";

// Upload: choose a file → it is read at once (the input gate runs early and the deal details are prefilled from
// the contract and existing deals, Tesler's law) → confirm the details (progressive disclosure, Hick's law) → choose
// who reviews it and by when → upload. Nothing is sent to the AI at upload: the assignee starts the review on their
// own time, so contracts that aren't due soon cost no tokens. "Review now" stays available, with a confirmation.
import { useState, type ReactNode } from "react";
import { Briefcase, CheckCircle2, ChevronDown, FileUp, Loader2, Play, ShieldCheck, Sparkles, Upload, UserCheck, X } from "lucide-react";
import { parseMoney } from "@/lib/ux/money";
import { docLabel } from "@/lib/display";
import { btn } from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ResultCard, ReviewProgress, RunnerControls, estimateText, useReviewRunner } from "@/components/report/ReviewRunner";

type Option = { id: string; label: string };

type Props = {
  deals: Option[];
  contracts: Option[];
  msas: Option[];
  previous: { id: string; label: string; counterparty: string; dealId: string | null } | null;
  defaultOwner: string;
  /** People who can own a deal (active admins and reviewers). */
  owners: string[];
  /** The signed-in person, and whether they may assign contracts to other people (admins). */
  me: string;
  canAssignOthers: boolean;
  /** People a contract can be assigned to. */
  assignees: string[];
  today: string;
  /** Contracts due within this many days count as "due soon"; reviewing others early triggers a warning. */
  horizonDays: number;
};

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const prettyDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const daysUntil = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

type Stop = { message: string; duplicateOf?: string | null; fields?: { field: string; message: string }[]; warn?: boolean };
type Guess = {
  docType: string;
  title: string;
  counterparty: string | null;
  clientCountry: string | null;
  value: number | null;
  currency: string | null;
  direction: "atliq_supplier" | "atliq_buyer";
  domain: string | null;
  personalData: boolean;
  phi: boolean;
};
type Inspection = { guess: Guess; clauseCount: number; scheduleItemCount: number; sectionCount: number; deal: { id: string; name: string; owner: string } | null };

const input = "w-full min-h-10 rounded-md border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent";
const invalid = "border-serious ring-1 ring-serious";
const label = "mb-1 block text-sm font-medium";
const ACCEPTED = [".pdf", ".docx", ".md", ".markdown", ".txt"];

function Panel({ title, icon, children, hint, step }: { title: string; icon: ReactNode; children: ReactNode; hint?: ReactNode; step: number }) {
  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <span className="flex size-5 items-center justify-center rounded-full bg-surface-2 text-xs text-muted">{step}</span>
        {icon}
        {title}
      </h2>
      {hint && <p className="mb-3 text-xs text-muted">{hint}</p>}
      <div className={hint ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

function FromContract({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-accent/10 px-1 text-[10px] font-medium text-accent" title="Filled in from the contract; check it">
      <Sparkles className="size-2.5" aria-hidden /> from the contract
    </span>
  );
}

const fmtSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function UploadForm({ deals, contracts, msas, previous, defaultOwner, owners, me, canAssignOthers, assignees, today, horizonDays }: Props) {
  const { state, run, resume, cancel } = useReviewRunner();
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [early, setEarly] = useState<Stop | null>(null);
  const [linkDeal, setLinkDeal] = useState<string>(previous?.dealId ?? "");
  const [counterparty, setCounterparty] = useState(previous?.counterparty ?? "");
  const [owner, setOwner] = useState(defaultOwner);
  const [valueText, setValueText] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [domain, setDomain] = useState("");
  const [country, setCountry] = useState("");
  const [direction, setDirection] = useState<"atliq_supplier" | "atliq_buyer">("atliq_supplier");
  const [personalData, setPersonalData] = useState(false);
  const [phi, setPhi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stop, setStop] = useState<Stop | null>(null);
  const [contractId, setContractId] = useState<string | null>(null);
  const [restart, setRestart] = useState(false);
  const [clientDeadline, setClientDeadline] = useState("");
  const [assignee, setAssignee] = useState(canAssignOthers ? "" : me);
  const [reviewBy, setReviewBy] = useState("");
  const [uploaded, setUploaded] = useState<{ assignee: string | null; reviewBy: string | null } | null>(null);
  const [confirmNow, setConfirmNow] = useState(false);
  // Suggest reviewing two days before the client deadline (or within a week when there is none).
  const suggestedReviewBy = clientDeadline ? (daysUntil(today, clientDeadline) > 2 ? addDays(clientDeadline, -2) : today) : addDays(today, 7);
  const existingDeal = !!linkDeal;
  const needsDealFacts = !existingDeal && !previous;
  const bad = (field: string) => !!stop?.fields?.some((f) => f.field === field);
  const money = parseMoney(valueText);
  const g = inspection?.guess;
  const clauses = inspection ? Math.max(inspection.clauseCount, inspection.sectionCount) : 40;

  async function choose(f: File | null) {
    setFile(f);
    setInspection(null);
    setEarly(null);
    setStop(null);
    if (!f) return;
    const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
    if (!ACCEPTED.includes(ext)) {
      setEarly({ message: `${ext || "This"} files can't be read. Save it as PDF (with a text layer), Word .docx, Markdown or plain text, then choose it again.` });
      return;
    }
    if (f.size > 4 * 1024 * 1024) {
      setEarly({ message: `This file is ${fmtSize(f.size)}; the limit is 4 MB. Remove images or split the document.` });
      return;
    }
    setInspecting(true);
    try {
      const fd = new FormData();
      fd.set("file", f);
      const res = await fetch("/api/contracts/inspect", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (json.stopped) {
        // A standalone freelancer agreement can still be uploaded when linked to a client deal.
        if (json.stop === "out_of_scope") setEarly({ message: json.message, warn: true });
        else return setEarly({ message: json.message, duplicateOf: json.duplicateOf });
      }
      if (json.guess) {
        const i = json as Inspection;
        setInspection(i);
        if (!previous) {
          if (i.guess.counterparty) setCounterparty(i.guess.counterparty);
          if (i.deal && !linkDeal) {
            setLinkDeal(i.deal.id);
            setOwner(i.deal.owner);
          }
        }
        if (i.guess.value) setValueText(i.guess.value.toLocaleString("en-US"));
        if (i.guess.currency) setCurrency(i.guess.currency);
        if (i.guess.domain) setDomain(i.guess.domain);
        if (i.guess.clientCountry) setCountry(i.guess.clientCountry);
        setDirection(i.guess.direction);
        setPersonalData(i.guess.personalData);
        setPhi(i.guess.phi);
      }
    } catch {
      // Inspection is a convenience; the upload itself still validates everything.
    } finally {
      setInspecting(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return setStop({ message: "Choose a file to upload.", fields: [{ field: "file", message: "Choose a file to upload." }] });
    if (valueText.trim() && !money) return setStop({ message: "The deal value couldn't be read. Try e.g. 140000, 88k or $140,000.", fields: [{ field: "valueUsd", message: "" }] });
    setBusy(true);
    setStop(null);
    const form = new FormData(e.currentTarget);
    form.set("file", file);
    if (money) {
      form.set("valueUsd", String(money.value));
      form.set("currency", money.currency ?? currency);
    } else form.delete("valueUsd");
    const res = await fetch("/api/contracts", { method: "POST", body: form });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      return setStop({ message: json.message ?? json.error ?? "Upload failed.", duplicateOf: json.duplicateOf, fields: json.fields });
    }
    setContractId(json.contractId);
    setUploaded({ assignee: json.assignee ?? null, reviewBy: json.reviewBy ?? null });
    setBusy(false);
  }
  // Can the person who uploaded start the review right away? (Admins always; others if it's theirs or unassigned.)
  const canReviewNow = !!uploaded && (canAssignOthers || !uploaded.assignee || uploaded.assignee === me);
  const dueIn = clientDeadline ? daysUntil(today, clientDeadline) : null;

  if (contractId && state.phase === "idle") {
    return (
      <div className="max-w-xl rounded-lg border border-line bg-surface p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <CheckCircle2 className="size-5 text-ok" aria-hidden /> Uploaded
        </h2>
        <p className="mt-1 text-sm text-muted">{file?.name} · nothing has been sent to the AI.</p>
        <p className="mt-3 text-sm">
          {uploaded?.assignee ? (
            <>
              Assigned to <strong>{uploaded.assignee === me ? "you" : uploaded.assignee}</strong>, to review by <strong>{uploaded.reviewBy ? prettyDate(uploaded.reviewBy) : ""}</strong>.
              {uploaded.assignee !== me && " They've been notified and will start the review when they're ready."}
            </>
          ) : (
            "Not assigned yet. Assign it from the contract page, or anyone with reviewer access can take it."
          )}
        </p>
        {dueIn != null && dueIn > horizonDays && (
          <p className="mt-2 rounded-md bg-surface-2 px-3 py-2 text-xs text-muted">The client deadline is {dueIn} days away, so there&rsquo;s no need to spend AI tokens on it yet.</p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={`/contracts/${contractId}`} className={btn("primary", "sm")}>
            Open the contract
          </a>
          {canReviewNow && (
            <button type="button" onClick={() => setConfirmNow(true)} className={btn("secondary", "sm")}>
              <Play className="size-4" aria-hidden /> Review now
            </button>
          )}
          <button type="button" onClick={() => window.location.reload()} className={btn("quiet", "sm")}>
            Upload another
          </button>
        </div>
        <ConfirmDialog
          open={confirmNow}
          title="Start the AI review now?"
          confirmLabel="Start review"
          onCancel={() => setConfirmNow(false)}
          onConfirm={() => {
            setConfirmNow(false);
            void run(contractId);
          }}
        >
          <p>This uses paid AI calls and usually takes {estimateText(clauses)}. It runs in the background.</p>
          {dueIn != null && dueIn > horizonDays && <p className="font-medium text-negotiable">The client deadline is {dueIn} days away. You could wait and review it closer to the date.</p>}
          {uploaded?.assignee && uploaded.assignee !== me && <p>It&rsquo;s assigned to {uploaded.assignee}; starting it yourself is allowed because you&rsquo;re an admin.</p>}
        </ConfirmDialog>
      </div>
    );
  }

  if (contractId) {
    return (
      <div className="max-w-xl rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-1 font-semibold">
          {state.phase === "done" ? "Review finished" : state.phase === "error" ? "The review stopped" : "Reviewing…"}
        </h2>
        <p className="mb-4 text-sm text-muted">
          {file?.name}
          {state.phase === "running" && " · you can leave this page; the review keeps running and you'll get a notification"}
        </p>
        {state.phase === "done" && state.result ? (
          <ResultCard result={state.result} contractId={contractId} />
        ) : (
          <ReviewProgress state={{ ...state, done: new Set(["reading", ...state.done]) }} clauses={clauses} />
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <RunnerControls state={state} onCancel={() => void cancel()} onResume={state.reviewId ? () => void resume(state.reviewId!) : undefined} onRestart={() => setRestart(true)} />
          {state.phase === "error" && (
            <a href={`/contracts/${contractId}`} className={btn("quiet", "sm")}>
              Go to the contract page
            </a>
          )}
        </div>
        <ConfirmDialog
          open={restart}
          title="Start a new review?"
          confirmLabel="Start new review"
          onCancel={() => setRestart(false)}
          onConfirm={() => {
            setRestart(false);
            void run(contractId);
          }}
        >
          <p>This runs every step again with paid AI calls and usually takes {estimateText(clauses)}.</p>
          {state.canResume && <p>To reuse the steps that already finished, choose &ldquo;Resume&rdquo; instead.</p>}
        </ConfirmDialog>
      </div>
    );
  }

  const ready = !!file && !inspecting && !(early && !early.warn);

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]" noValidate={false}>
      <div className="space-y-4">
        <Panel step={1} title="Document" icon={<FileUp className="size-4 text-muted" aria-hidden />}>
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (e.dataTransfer.files[0]) void choose(e.dataTransfer.files[0]);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors focus-within:ring-2 focus-within:ring-accent ${
              dragging ? "border-accent bg-accent/5" : bad("file") ? "border-serious" : "border-line hover:border-accent hover:bg-surface-2"
            }`}
          >
            {file ? (
              <span className="flex flex-wrap items-center justify-center gap-3 text-sm">
                {inspecting ? <Loader2 className="size-5 animate-spin text-muted" aria-hidden /> : <CheckCircle2 className="size-5 text-ok" aria-hidden />}
                <span className="font-medium">{file.name}</span>
                <span className="text-muted">{fmtSize(file.size)}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    void choose(null);
                  }}
                  className="tap rounded p-1 text-muted hover:bg-surface-2 hover:text-fg"
                  aria-label="Remove file"
                >
                  <X className="size-4" />
                </button>
              </span>
            ) : (
              <>
                <Upload className="mb-2 size-6 text-muted" aria-hidden />
                <span className="text-sm font-medium">Drop a contract here, or click to choose</span>
                <span className="mt-1 text-xs text-muted">PDF with a text layer, Word (.docx), Markdown or text · up to 4 MB · English only</span>
                <span className="mt-0.5 text-xs text-muted">Old .doc or .rtf? Save it as .docx or PDF first.</span>
              </>
            )}
            <input type="file" accept={ACCEPTED.join(",")} className="sr-only" onChange={(e) => void choose(e.target.files?.[0] ?? null)} />
          </label>
          <p className="sr-only" aria-live="polite">
            {inspecting ? "Reading the file…" : inspection ? "File read. Details filled in from the contract; please check them." : ""}
          </p>
          {inspecting && <p className="mt-3 text-sm text-muted">Reading the file and filling in what the contract already says…</p>}
          {inspection && g && (
            <p className="mt-3 text-sm">
              <span className="font-medium">{docLabel(g.docType)}</span>
              <span className="text-muted">
                {" "}
                · {inspection.clauseCount ? `${inspection.clauseCount} numbered clauses` : `${inspection.sectionCount} sections`}
                {inspection.scheduleItemCount ? ` + ${inspection.scheduleItemCount} schedule items` : ""}
                {g.counterparty ? ` · with ${g.counterparty}` : ""}
              </span>
            </p>
          )}
          {early && (
            <div className={`mt-3 rounded-md p-3 text-sm ${early.warn ? "bg-negotiable-bg text-negotiable" : "bg-serious-bg text-serious"}`} role="alert">
              <p className="font-medium">{early.message}</p>
              {early.duplicateOf && (
                <a href={`/contracts/${early.duplicateOf}`} className="mt-2 inline-block font-medium underline">
                  Open the existing review
                </a>
              )}
            </div>
          )}
          {previous && (
            <p className="mt-3 rounded-md bg-surface-2 p-3 text-sm">
              New version of <strong>{previous.label}</strong>. The whole document is reviewed again and compared with the previous version.
              <input type="hidden" name="previousVersionId" value={previous.id} />
            </p>
          )}
          {file && (
            <fieldset className="mt-4">
              <legend className={label}>
                This document is <FromContract show={!!g} />
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ["atliq_supplier", "A client contract", "AtliQ supplies the work and gets paid"],
                    ["atliq_buyer", "An agency or freelancer agreement", "AtliQ hires someone and pays them"],
                  ] as const
                ).map(([v, t, d]) => (
                  <label key={v} className={`flex cursor-pointer gap-2 rounded-md border p-2.5 text-sm ${direction === v ? "border-accent bg-accent/5" : "border-line hover:bg-surface-2"}`}>
                    <input type="radio" name="direction" value={v} checked={direction === v} onChange={() => setDirection(v)} className="mt-0.5" />
                    <span>
                      <span className="font-medium">{t}</span>
                      <span className="block text-xs text-muted">{d}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </Panel>

        {ready && (
          <Panel
            step={2}
            title="Deal"
            icon={<Briefcase className="size-4 text-muted" aria-hidden />}
            hint={
              inspection?.deal && linkDeal === inspection.deal.id
                ? `Matched to the existing deal "${inspection.deal.name}". Its value, domain, country and delivery are used.`
                : existingDeal
                  ? "Value, domain, country and delivery come from the linked deal."
                  : g
                    ? "Filled in from the contract where possible. Check the highlighted fields."
                    : "Used for the deal-value arithmetic, the company and law check, and the clash check."
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {!previous && (
                <div className="sm:col-span-2">
                  <label className={label} htmlFor="dealId">
                    Deal
                  </label>
                  <select id="dealId" name="dealId" className={input} value={linkDeal} onChange={(e) => setLinkDeal(e.target.value)}>
                    <option value="">New deal</option>
                    {deals.map((d) => (
                      <option key={d.id} value={d.id}>
                        Add to: {d.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className={label} htmlFor="counterparty">
                  Counterparty * <FromContract show={!!g?.counterparty && counterparty === g.counterparty} />
                </label>
                <input
                  id="counterparty"
                  name="counterparty"
                  required
                  value={counterparty}
                  onChange={(e) => setCounterparty(e.target.value)}
                  className={`${input} ${bad("counterparty") ? invalid : ""}`}
                  placeholder="e.g. Gulf Crown Hotels & Resorts Co."
                />
              </div>
              <div>
                <label className={label} htmlFor="owner">
                  Owner *
                </label>
                <select id="owner" name="owner" className={input} value={owner} onChange={(e) => setOwner(e.target.value)}>
                  {[...new Set([...owners, owner])].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </div>
              {needsDealFacts && (
                <>
                  <div>
                    <label className={label} htmlFor="valueUsd">
                      Deal value <FromContract show={!!g?.value && money?.value === g.value} />
                    </label>
                    <div className="flex gap-2">
                      <select name="currency" className={`${input} w-24`} value={money?.currency ?? currency} onChange={(e) => setCurrency(e.target.value)} aria-label="Currency">
                        <option>USD</option>
                        <option>EUR</option>
                        <option>GBP</option>
                        <option>INR</option>
                      </select>
                      <input
                        id="valueUsd"
                        name="valueUsd"
                        inputMode="decimal"
                        value={valueText}
                        onChange={(e) => setValueText(e.target.value)}
                        className={`${input} ${bad("valueUsd") || (valueText.trim() && !money) ? invalid : ""}`}
                        placeholder="e.g. 140,000 or 88k"
                        aria-describedby="value-hint"
                      />
                    </div>
                    <p id="value-hint" className={`mt-1 text-xs ${valueText.trim() && !money ? "text-serious" : "text-muted"}`}>
                      {valueText.trim() ? (money ? `= ${money.value.toLocaleString("en-US")} ${money.currency ?? currency}` : "Couldn't read this amount") : "Optional; used for the penalty and cap arithmetic"}
                    </p>
                  </div>
                  <div>
                    <label className={label} htmlFor="clientDeadline">
                      Client deadline
                    </label>
                    <input id="clientDeadline" name="clientDeadline" type="date" value={clientDeadline} onChange={(e) => setClientDeadline(e.target.value)} className={input} />
                  </div>
                  <div>
                    <label className={label} htmlFor="domain">
                      Domain * <FromContract show={!!g?.domain && domain === g.domain} />
                    </label>
                    <input
                      id="domain"
                      name="domain"
                      required
                      minLength={2}
                      value={domain}
                      onChange={(e) => setDomain(e.target.value)}
                      className={`${input} ${bad("domain") ? invalid : ""}`}
                      placeholder="e.g. hospitality analytics"
                    />
                  </div>
                  <div>
                    <label className={label} htmlFor="clientCountry">
                      Client country * <FromContract show={!!g?.clientCountry && country === g.clientCountry} />
                    </label>
                    <input
                      id="clientCountry"
                      name="clientCountry"
                      required
                      minLength={2}
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className={`${input} ${bad("clientCountry") ? invalid : ""}`}
                      placeholder="e.g. Saudi Arabia"
                    />
                  </div>
                  <div className="flex flex-wrap gap-4 sm:col-span-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="personalData" value="true" checked={personalData} onChange={(e) => setPersonalData(e.target.checked)} /> Personal data is involved
                      <FromContract show={!!g?.personalData && personalData} />
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="phi" value="true" checked={phi} onChange={(e) => setPhi(e.target.checked)} /> Health information (PHI) is involved
                      <FromContract show={!!g?.phi && phi} />
                    </label>
                  </div>
                </>
              )}
              {existingDeal && (
                <div>
                  <label className={label} htmlFor="docRole">
                    Role in the deal
                  </label>
                  <select id="docRole" name="docRole" className={input} defaultValue="">
                    <option value="">Work it out from the document</option>
                    <option value="baa">BAA</option>
                    <option value="dpa">Data processing agreement</option>
                    <option value="nda">NDA</option>
                    <option value="subcontract">Agency subcontract</option>
                    <option value="freelancer">Freelancer agreement</option>
                    <option value="sow">SOW</option>
                  </select>
                </div>
              )}
            </div>

            {/* Rarely changed details stay folded (progressive disclosure). */}
            <details className="group mt-4 rounded-md border border-line">
              <summary className="tap flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-muted hover:text-fg">
                <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden /> More options
                <span className="text-xs">(delivery location, who touches the data, links to other contracts)</span>
              </summary>
              <div className="grid gap-4 border-t border-line p-3 sm:grid-cols-2">
                {needsDealFacts && (
                  <>
                    <div>
                      <label className={label} htmlFor="deliveredFrom">
                        Delivered from
                      </label>
                      <input id="deliveredFrom" name="deliveredFrom" className={input} defaultValue="Pune, India" />
                    </div>
                    <div>
                      <label className={label} htmlFor="dataTouchers">
                        Who touches the data
                      </label>
                      <input id="dataTouchers" name="dataTouchers" className={input} placeholder="AtliQ Pune team, freelancer name" />
                    </div>
                  </>
                )}
                {!previous && (
                  <>
                    <div>
                      <label className={label} htmlFor="parentContractId">
                        An SOW under a signed MSA
                      </label>
                      <select id="parentContractId" name="parentContractId" className={input} defaultValue="">
                        <option value="">No</option>
                        {msas.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {contracts.length > 0 && (
                      <div>
                        <label className={label} htmlFor="previousVersionId">
                          A new version of…
                        </label>
                        <select id="previousVersionId" name="previousVersionId" className={input} defaultValue="">
                          <option value="">No, a new contract</option>
                          {contracts.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </>
                )}
              </div>
            </details>
          </Panel>
        )}

        {ready && (
          <Panel
            step={3}
            title="Review"
            icon={<UserCheck className="size-4 text-muted" aria-hidden />}
            hint="Who runs the AI review, and by when. Nothing is sent to the AI at upload; they start it when they're ready."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="assignee">
                  Who reviews it
                </label>
                <select id="assignee" name="assignee" className={`${input} ${bad("assignee") ? invalid : ""}`} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                  <option value="">Not assigned yet</option>
                  {(canAssignOthers ? assignees : [me]).map((p) => (
                    <option key={p} value={p}>
                      {p === me ? `Me (${p})` : p}
                    </option>
                  ))}
                </select>
                {!canAssignOthers && <p className="mt-1 text-xs text-muted">Only an admin can assign it to someone else.</p>}
              </div>
              {assignee && (
                <div>
                  <label className={label} htmlFor="reviewBy">
                    Review by
                  </label>
                  <input
                    id="reviewBy"
                    name="reviewBy"
                    type="date"
                    required
                    min={today}
                    value={reviewBy || suggestedReviewBy}
                    onChange={(e) => setReviewBy(e.target.value)}
                    className={`${input} ${bad("reviewBy") ? invalid : ""}`}
                  />
                  <p className="mt-1 text-xs text-muted">{clientDeadline ? "Suggested: two days before the client deadline." : "Suggested: within a week."}</p>
                </div>
              )}
              {assignee && (
                <div className="sm:col-span-2">
                  <label className={label} htmlFor="concerns">
                    What to look at (optional)
                  </label>
                  <input id="concerns" name="concerns" className={input} placeholder="e.g. check the penalty and the BAA" />
                </div>
              )}
            </div>
          </Panel>
        )}

        {stop && (
          <div className="rounded-md bg-serious-bg p-3 text-sm text-serious" role="alert">
            <p className="font-medium">{stop.message}</p>
            {stop.fields && stop.fields.length > 0 && stop.fields[0].message && stop.fields[0].message !== stop.message && (
              <ul className="mt-1 list-disc pl-5">
                {stop.fields.map((f) => (
                  <li key={f.field}>{f.message}</li>
                ))}
              </ul>
            )}
            {stop.duplicateOf && (
              <a href={`/contracts/${stop.duplicateOf}`} className="mt-2 inline-block font-medium underline">
                Open the existing review
              </a>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy || !ready} className={btn("primary")}>
            <Upload className="size-4" aria-hidden />
            {busy ? "Uploading…" : assignee ? `Upload and assign to ${assignee === me ? "me" : assignee}` : "Upload"}
          </button>
          <span className="text-xs text-muted">{file ? "Nothing is sent to the AI until someone starts the review." : "Choose a file to continue."}</span>
        </div>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <section className="rounded-lg border border-line bg-surface p-4 text-sm">
          <h2 className="mb-2 font-semibold">What happens next</h2>
          <ol className="list-decimal space-y-1.5 pl-5 text-muted">
            <li>Now: the text is read and split into clauses; scans, cover letters, non-English documents and duplicates are stopped. No AI is used.</li>
            <li>The person you assign is notified and sees it in their queue with its review-by date.</li>
            <li>When they start the review: names and personal details are hidden, a leak check runs, and every clause is compared with AtliQ&rsquo;s usual terms and past promises.</li>
            <li>Code checks the arithmetic, dates, company and law, then verifies every quote word for word.</li>
          </ol>
          <p className="mt-3 text-xs text-muted">Nothing is signed, sent or edited.</p>
        </section>
        <section className="rounded-lg border border-line bg-ok-bg p-4 text-sm">
          <h2 className="mb-1 flex items-center gap-2 font-semibold text-ok">
            <ShieldCheck className="size-4" aria-hidden /> Privacy
          </h2>
          <p className="text-muted">The AI only sees labels like CLIENT_A and PERSON_1. The key that maps them back stays on AtliQ&rsquo;s server and is never sent or logged.</p>
        </section>
      </aside>
    </form>
  );
}
