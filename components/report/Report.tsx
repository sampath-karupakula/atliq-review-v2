"use client";

// The report (S2), in the prototype's order: summary → Not sure → clash → Serious (open) → Negotiable (headline and
// cost) → Minor (folded) → rule checks → Can we deliver? → missing protections → usual terms; the rail holds the
// score, the exposure against the deal value and the decision lock. Contract text, What the AI saw and Versions are
// tabs on the same page, so a quote opens its highlight and a highlight opens its finding.
import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Fold } from "@/components/Fold";
import { Chevron, SeverityPill } from "@/components/ui";
import { clauseLabel } from "@/lib/display";
import { termLabel } from "@/lib/format";
import {
  exposureHeadline,
  exposureRows,
  groupFindings,
  liveCounts,
  ndaTiles,
  nextStep,
  scoreBand,
  usualTerms,
  type ReportFinding,
  type Sev,
} from "@/lib/report/model";
import type { DiffRow } from "@/lib/ux/diff";
import { RunReviewPanel } from "@/components/report/ReviewRunner";
import { FindingActions, type Perms } from "@/components/report/FindingActions";
import { DecisionPanel } from "@/components/report/DecisionPanel";
import { NegotiationPanel, type PushItem } from "@/components/report/NegotiationPanel";
import { dismissMany, restoreMany } from "@/app/actions/workflow";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";

export type Tab = "findings" | "text" | "ai" | "versions";

export type ReportProps = {
  contractId: string;
  docType: string;
  initialTab: Tab;
  text: string;
  maskedText: string | null;
  findings: ReportFinding[];
  summary: { text: string; findingIds: string[] }[];
  baseline: { term: string; usual: string; count: string | null }[];
  dealValue: number | null;
  currency: string;
  coverageLine: string;
  registerLine: string;
  extract: unknown;
  deal: { deliveredFrom: string; dataTouchers: string[]; personalData: boolean | null; phi: boolean | null; clientCountry: string } | null;
  versions: { prevId: string; prevVersion: number; rows: DiffRow[] } | null;
  version: number;
  reviewedAt: string | null;
  model: string | null;
  canDecide: boolean;
  perms: Perms;
  decision: "sign_intended" | "reject" | null;
  decisionNote: string | null;
  /** Set while the contract is negotiating: conditions and whether the pushback went out. */
  negotiation: {
    round: number;
    counterparty: string;
    from: string;
    conditions: { id: string; text: string; open: boolean; addressed: string | null }[];
    sentOn: string | null;
  } | null;
  history: { at: string; text: string }[];
  /** Set when the viewer may run the review again. */
  rerun: { clauses: number; daysUntilDue: number | null; horizonDays: number } | null;
  /** Server-rendered hand-off cards (first review, second reviewer, counsel, review time), shown under the score. */
  handoff?: ReactNode;
};

const SYMBOL: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", INR: "₹" };
const SEV_ORDER: Sev[] = ["serious", "negotiable", "minor", "not_sure"];
const SEV_NAME: Record<Sev, string> = { serious: "Serious", negotiable: "Negotiable", minor: "Minor", not_sure: "Not sure", info: "Info" };
const MIX_COLOR: Record<Sev, string> = { serious: "var(--serious)", negotiable: "var(--nego)", minor: "var(--ok)", not_sure: "var(--unsure)", info: "var(--rule)" };
const LABELS: Record<string, { text: string; cls: string }> = {
  standard: { text: "Standard", cls: "standard" },
  deliberate_exception: { text: "Deliberate exception · not a precedent", cls: "exception" },
  waved_through: { text: "Waved through · never copy", cls: "waved" },
  unclear: { text: "Unclear", cls: "unclear" },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "14 Sep 2029", the same as lib/checks/dates formatDate. */
const fmtDate = (s: unknown) => {
  const v = String(s ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return `${+v.slice(8, 10)} ${MONTHS[+v.slice(5, 7) - 1]} ${v.slice(0, 4)}`;
};

function Check({ ok }: { ok: boolean }) {
  return ok ? (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 2.5 18.5 17h-17z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M10 8v4.2M10 14.6v.1" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

export function Report(p: ReportProps) {
  const [tab, setTab] = useState<Tab>(p.initialTab);
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {};
    for (const f of p.findings) if (f.severity === "serious" && !f.dismissed) o[f.id] = true;
    return o;
  });
  const [howtoSeen, setHowtoSeen] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);
  const [minorOpen, setMinorOpen] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const [dismissedOpen, setDismissedOpen] = useState(false);
  const money = useCallback((n: number) => (SYMBOL[p.currency] ?? `${p.currency} `) + Math.round(n).toLocaleString("en-US"), [p.currency]);

  const g = useMemo(() => groupFindings(p.findings), [p.findings]);
  const counts = useMemo(() => liveCounts(p.findings), [p.findings]);
  const { score, band } = scoreBand(counts);
  const expo = useMemo(() => exposureRows(p.findings), [p.findings]);
  const usual = useMemo(() => usualTerms(p.baseline, p.findings, p.docType), [p.baseline, p.findings, p.docType]);
  const tiles = p.docType === "nda" ? ndaTiles(p.extract as Parameters<typeof ndaTiles>[0]) : null;
  const byKey = useMemo(() => new Map(p.findings.map((f) => [f.key, f])), [p.findings]);
  // Low risk reads calm on purpose: no red, so the next red report stands out. Items to check by hand stay visible.
  const calm = counts.serious === 0 && band === "Low";
  const serious = p.findings.filter((f) => f.severity === "serious" && !f.dismissed && f.versionTag !== "resolved");

  useEffect(() => {
    try {
      setHowtoSeen(localStorage.getItem("atliq-howto") === "1");
    } catch {
      setHowtoSeen(true);
    }
  }, []);

  const go = useCallback((id: string) => {
    setTab("findings");
    setOpen((o) => ({ ...o, [id]: true }));
    // A finding inside a folded group opens its fold first.
    const target = p.findings.find((f) => f.id === id);
    if (target?.dismissed) setDismissedOpen(true);
    else if (target?.severity === "minor") setMinorOpen(true);
    setTimeout(() => {
      const el = document.getElementById(`f-${id}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        el.focus({ preventScroll: true });
        setFlash(id);
        setTimeout(() => setFlash(null), 1600);
      }
    }, 30);
  }, [p.findings]);

  const showInText = useCallback((id: string) => {
    setTab("text");
    setTimeout(() => {
      const el = document.getElementById(`hl-${id}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("flash");
        setTimeout(() => el.classList.remove("flash"), 1600);
      }
    }, 30);
  }, []);

  // j / k move between findings, o opens or closes one (shortcut sheet).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (tab !== "findings" || e.ctrlKey || e.metaKey || e.altKey) return;
      if (/INPUT|TEXTAREA|SELECT/.test((document.activeElement as HTMLElement | null)?.tagName ?? "")) return;
      if (!["j", "k", "o"].includes(e.key)) return;
      const cards = [...document.querySelectorAll<HTMLElement>("article.finding")];
      if (!cards.length) return;
      const cur = cards.findIndex((c) => c.contains(document.activeElement));
      if (e.key === "o" && cur > -1) {
        const id = cards[cur]!.dataset.id!;
        setOpen((o) => ({ ...o, [id]: !o[id] }));
        return;
      }
      const nx = e.key === "j" ? Math.min(cards.length - 1, cur + 1) : Math.max(0, cur - 1);
      cards[nx]!.focus();
      cards[nx]!.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab]);

  const card = (f: ReportFinding) => {
    const isOpen = !!open[f.id];
    const step = nextStep(f);
    const past = typeof f.related.quote === "string" && typeof f.related.contract === "string" ? f.related : null;
    const docB = typeof f.related.docB === "string" ? f.related : null;
    const perPeriod = typeof f.related.perPeriod === "number" ? (f.related.perPeriod as number) : null;
    const periods = typeof f.related.periodsToFullFee === "number" ? (f.related.periodsToFullFee as number) : null;
    const notSureReason = typeof f.related.notSureReason === "string" ? f.related.notSureReason : null;
    const hasHl = !!f.related.highlight;
    return (
      <article key={f.id} id={`f-${f.id}`} data-id={f.id} tabIndex={-1} className={`finding ${f.severity}${f.dismissed ? " dismissed" : ""}${flash === f.id ? " flash" : ""}`}>
        <button type="button" className="f-top" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [f.id]: !o[f.id] }))}>
          <span className="t">
            <small>
              {f.clause ? clauseLabel(f.clause) : f.absent ? "Whole document" : "—"}
              {f.versionTag === "new" ? (
                <>
                  {" · "}
                  <span className="tag new">New in this version</span>
                </>
              ) : null}
              {f.check === "missing_protection" ? (
                <>
                  {" · "}
                  <span className="tag miss">Missing protection</span>
                </>
              ) : null}
            </small>
            <b>{f.title}</b>
            {!isOpen && f.whatItCouldCost && f.severity !== "minor" ? <span className="cost-inline">{f.whatItCouldCost}</span> : null}
          </span>
          {f.accepted ? <span className="tag">Accepted</span> : null}
          <span className={`nextstep ${step.kind}`}>{step.text}</span>
          <Chevron />
        </button>
        {isOpen ? (
          <div className="f-body">
            {past || docB ? (
              <div className="pair framed">
                <div>
                  <span className="lbl">This contract{f.clause ? ` · ${clauseLabel(f.clause)}` : ""}</span>
                  {f.quote ? (
                    <button type="button" className="quote" onClick={() => hasHl && showInText(f.id)} disabled={!hasHl}>
                      {f.quote}
                    </button>
                  ) : (
                    <p className="quote">Not found after reading the whole document.</p>
                  )}
                </div>
                <div>
                  <span className="lbl">
                    {past ? `${String(past.contract)}${past.clause ? ` · Clause ${String(past.clause)}` : ""}` : `${String(docB!.docB)}${docB!.clauseB ? ` · ${clauseLabel(String(docB!.clauseB))}` : ""}`}
                  </span>
                  <p className="quote">{past ? String(past.quote) : typeof docB!.quoteB === "string" ? docB!.quoteB : "Not found after reading the whole document."}</p>
                  {past ? (
                    <span className="hint">
                      {past.status === "expired" ? `Expired ${fmtDate(past.ends)}` : past.status === "permanent" ? "Permanent" : `Live until ${fmtDate(past.ends)}`}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : f.quote ? (
              <button type="button" className="quote" onClick={() => hasHl && showInText(f.id)} disabled={!hasHl} title={hasHl ? "Show it in the contract" : undefined}>
                {f.quote}
              </button>
            ) : f.absent ? (
              <p className="quote" style={{ color: "var(--ink-2)" }}>
                Not found after reading the whole document.
              </p>
            ) : null}
            {docB && typeof docB.dataMustNotMoveUntil === "string" && docB.dataMustNotMoveUntil ? (
              <p className="gate no" style={{ alignSelf: "flex-start" }}>
                Data must not move until {fmtDate(docB.dataMustNotMoveUntil)}
              </p>
            ) : null}
            <div className={`evid${f.quoteVerified || f.absent ? "" : " warn"}`}>
              <Check ok={f.quoteVerified || f.absent} />
              <div>
                <b>Evidence</b>{" "}
                <span className="hint">
                  {f.absent ? "checked against every clause" : f.quoteVerified ? "quote matched word for word" : "quote not found word for word: check by hand"}
                </span>
                {notSureReason && f.severity === "not_sure" ? <div>Why not sure: {notSureReason}</div> : null}
                <div className="hint">
                  {f.source === "code" ? "Found by AtliQ's rules" : "Found by the AI, checked by code"}
                  {hasHl ? (
                    <>
                      {" · "}
                      <button type="button" className="linkish lnk" onClick={() => showInText(f.id)}>
                        Open in contract
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
            {perPeriod && periods ? (
              <>
                <div className="tiles">
                  <div className="tile">
                    <b>{money(perPeriod)}</b>
                    <span>per {String(f.related.period ?? "day")} late</span>
                  </div>
                  <div className="tile">
                    <b>{periods} {String(f.related.period ?? "day")}s</b>
                    <span>to reach the full fee</span>
                  </div>
                  <div className="tile">
                    <b>{p.dealValue ? money(p.dealValue) : "—"}</b>
                    <span>deal value</span>
                  </div>
                </div>
                <p className="hint">Worked out by code from the deal value, never by the AI.</p>
              </>
            ) : null}
            <div className="three">
              <div>
                <h4>What it means</h4>
                <p>{f.whatItMeans || "—"}</p>
              </div>
              <div>
                <h4>What it could cost</h4>
                <p>{f.whatItCouldCost || "—"}</p>
              </div>
              <div>
                <h4>How to soften it</h4>
                <p>{f.howToSoften || "—"}</p>
              </div>
            </div>
            {f.positions.length ? (
              <div className="prec">
                <span>How AtliQ handled this before:</span>
                {f.positions.map((x) => (
                  <span key={x.id} className="prec-item">
                    <Link
                      href={`/register?tab=prec#pos-${x.id}`}
                      className={`p ${LABELS[x.label]?.cls ?? "unclear"}`}
                      title={`${x.term} → ${x.outcome}. Open in the register.`}
                    >
                      {x.counterparty} ({x.date}): {LABELS[x.label]?.text ?? x.label}
                    </Link>
                    {x.contractId ? (
                      <Link href={`/contracts/${x.contractId}?tab=text`} className="prec-src" title={`Open the signed ${x.counterparty} contract`}>
                        Contract
                      </Link>
                    ) : null}
                  </span>
                ))}
              </div>
            ) : null}
            {f.dismissed ? (
              <p className="hint">
                Dismissed by {f.dismissedBy}: {f.dismissReason}
              </p>
            ) : null}
            <FindingActions
              f={{ id: f.id, severity: f.severity, title: f.title, dismissed: f.dismissed, accepted: f.accepted, acceptNote: f.acceptNote, hasHighlight: hasHl }}
              perms={p.perms}
              onOpenContract={() => showInText(f.id)}
            />
          </div>
        ) : null}
      </article>
    );
  };

  const group = (sev: Sev, list: ReportFinding[], note?: string) =>
    list.length ? (
      <section className="group" aria-label={`${SEV_NAME[sev]} findings`}>
        <div className="group-h">
          <h2>
            <SeverityPill severity={sev} /> <span className="num">{list.length}</span>
          </h2>
          {note ? <span className="hint">{note}</span> : null}
        </div>
        {list.map(card)}
      </section>
    ) : null;

  // ---------- contract text with highlights ----------
  const highlighted = useMemo(() => {
    const marks = p.findings
      .filter((f) => !f.dismissed && f.related.highlight && f.versionTag !== "resolved")
      .map((f) => ({ f, ...(f.related.highlight as { start: number; end: number }) }))
      .filter((m) => m.start >= 0 && m.end > m.start && m.end <= p.text.length)
      .sort((a, b) => a.start - b.start);
    const out: ReactNode[] = [];
    let at = 0;
    for (const m of marks) {
      if (m.start < at) continue; // overlapping quote: the first one wins
      out.push(<Fragment key={`t${at}`}>{p.text.slice(at, m.start)}</Fragment>);
      const cls = m.f.severity === "serious" ? "s" : m.f.severity === "not_sure" ? "u" : "";
      out.push(
        <mark
          key={`m${m.f.id}`}
          id={`hl-${m.f.id}`}
          className={cls}
          tabIndex={0}
          title={`${SEV_NAME[m.f.severity]}: ${m.f.title}. Click to open the finding.`}
          onClick={() => go(m.f.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter") go(m.f.id);
          }}
        >
          {p.text.slice(m.start, m.end)}
        </mark>,
      );
      at = m.end;
    }
    out.push(<Fragment key="tail">{p.text.slice(at)}</Fragment>);
    return out;
  }, [p.findings, p.text, go]);

  const tabs: [Tab, string][] = [
    ["findings", "Findings"],
    ["text", "Contract text"],
    ["ai", "What the AI saw"],
    ["versions", "Versions"],
  ];

  const deliveryRows: { mk: "y" | "n" | "w"; label: string; text: string; id?: string }[] = [
    ...g.delivery.map((f) => ({ mk: (f.severity === "serious" ? "n" : "w") as "n" | "w", label: f.title, text: f.whatItMeans ?? "", id: f.id })),
  ];
  if (p.deal && !g.delivery.length) {
    deliveryRows.push({ mk: "y", label: `Delivered from ${p.deal.deliveredFrom}`, text: "No document or rule in this deal stops that." });
    deliveryRows.push({
      mk: "y",
      label: p.deal.phi ? "Patient data" : p.deal.personalData ? "Personal data" : "Data",
      text: p.deal.phi || p.deal.personalData ? "No missing data agreement was found for this deal." : "No personal or patient data recorded for this deal.",
    });
  }
  const deliverVerdict = deliveryRows.some((r) => r.mk === "n") ? ["serious", "Not deliverable as written"] : deliveryRows.some((r) => r.mk === "w") ? ["negotiable", "Deliverable with conditions"] : ["okc", "Deliverable"];
  const usualDiffers = usual.filter((u) => u.differs).length;
  const pushItems: PushItem[] = p.findings
    .filter((f) => !f.dismissed && !f.accepted && f.versionTag !== "resolved" && (f.severity === "serious" || f.severity === "negotiable"))
    .map((f) => ({ id: f.id, label: f.clause ? clauseLabel(f.clause) : "Whole document", title: f.title, ask: f.howToSoften || f.whatItMeans || f.title, severity: f.severity }));
  const missingCount = g.missing.length;

  const findingsTab = (
    <>
      {!howtoSeen ? (
        <div className="howto">
          <div>
            <b>How to read this report</b>
            <ol>
              <li>Read the three-line summary first.</li>
              <li>Serious items lock the decision until each is settled.</li>
              <li>Every finding quotes the contract word for word. Click a quote to see it in the contract.</li>
            </ol>
          </div>
          <button
            type="button"
            className="btn small"
            onClick={() => {
              setHowtoSeen(true);
              try {
                localStorage.setItem("atliq-howto", "1");
              } catch {
                /* the tip shows again next time */
              }
            }}
          >
            Got it
          </button>
        </div>
      ) : null}

      {p.negotiation ? (
        <NegotiationPanel
          contractId={p.contractId}
          round={p.negotiation.round}
          counterparty={p.negotiation.counterparty}
          from={p.negotiation.from}
          conditions={p.negotiation.conditions}
          items={pushItems}
          sentOn={p.negotiation.sentOn}
          canEdit={p.perms.comment}
          canDecide={p.perms.decide}
          onJump={go}
        />
      ) : null}

      {calm ? (
        <>
          <div className="calm">
            <b>{counts.not_sure ? `Low risk: ${counts.not_sure} item${counts.not_sure === 1 ? "" : "s"} to check by hand` : "No action needed"}</b>
            <p>
              No Serious items
              {counts.negotiable ? `, ${counts.negotiable} negotiable point${counts.negotiable === 1 ? "" : "s"}` : ""}
              {counts.minor ? `, ${counts.minor} minor` : ""}
              {counts.not_sure ? `, and ${counts.not_sure === 1 ? "one thing" : `${counts.not_sure} things`} the tool couldn't verify (below)` : ", and nothing the tool couldn't verify"}. {p.coverageLine}.
            </p>
          </div>
          {tiles ? (
            <div className="qtiles">
              {tiles.map((t) => (
                <div key={t.label} className="qtile">
                  <small>{t.label}</small>
                  <span className={`v${t.ok ? "" : " no"}`}>{t.value}</span>
                  <small>{t.where}</small>
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      {p.summary.length && !calm ? (
        <div className="summary">
          <p className="eyebrow">Summary</p>
          <ol>
            {p.summary.slice(0, 3).map((s, i) => {
              const target = s.findingIds.map((k) => byKey.get(k)).find(Boolean);
              return (
                <li key={i}>
                  <span className="n">{i + 1}</span>
                  <span style={{ flex: 1 }}>{s.text}</span>
                  {target ? (
                    <button type="button" onClick={() => go(target.id)}>
                      See it
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}

      {tiles && !calm ? (
        <div className="qtiles">
          {tiles.map((t) => (
            <div key={t.label} className="qtile">
              <small>{t.label}</small>
              <span className={`v${t.ok ? "" : " no"}`}>{t.value}</span>
              <small>{t.where}</small>
            </div>
          ))}
        </div>
      ) : null}

      {g.notSure.length ? (
        <section className="unsure-tray" role="region" aria-label="Not sure">
          <div className="ut-head">
            <Check ok={false} />
            <h3>
              Not sure · {g.notSure.length} item{g.notSure.length === 1 ? "" : "s"} the tool couldn&apos;t verify
            </h3>
          </div>
          <p style={{ fontSize: 13.5, color: "var(--ink-2)" }}>Check these by hand before deciding. Nothing here is counted as safe.</p>
          {g.notSure.map((f) => (
            <button key={f.id} type="button" className="ut-item" onClick={() => go(f.id)}>
              <p>
                <b>
                  {f.clause ? `${clauseLabel(f.clause)}: ` : ""}
                  {f.title}
                </b>
              </p>
              <p>{typeof f.related.notSureReason === "string" ? f.related.notSureReason : f.whatItMeans}</p>
            </button>
          ))}
        </section>
      ) : null}

      {g.clashes.filter((f) => typeof f.related.quote === "string" && f.related.quote).map((f) => {
        const r = f.related;
        return (
          <div key={`clash-${f.id}`} className="clash">
            <div className="clash-head">
              <h3>Clashes with a promise AtliQ already made</h3>
              <span>
                {String(r.contract ?? "")}
                {r.clause ? ` · Clause ${String(r.clause)}` : ""}
                {r.ends ? ` · live until ${fmtDate(r.ends)}` : r.status === "permanent" ? " · permanent" : ""}
              </span>
            </div>
            <div className="pair">
              <div>
                <span className="lbl">This contract{f.clause ? ` · ${clauseLabel(f.clause)}` : ""}</span>
                <p className="quote">{f.quote ?? "—"}</p>
              </div>
              <div>
                <span className="lbl">{String(r.contract ?? "Earlier promise")}</span>
                <p className="quote">{String(r.quote ?? "")}</p>
              </div>
            </div>
            <div className="scope">
              <span>{f.whatItMeans}</span>
              <span className="dismiss-row">
                <button type="button" className="btn small" onClick={() => go(f.id)}>
                  See the finding
                </button>
                {typeof r.commitmentId === "string" ? (
                  <Link className="btn quiet small" href={`/register?tab=promises&f=all#${r.commitmentId}`}>
                    Register row
                  </Link>
                ) : null}
              </span>
            </div>
          </div>
        );
      })}

      {group("serious", g.serious)}
      {group("negotiable", g.negotiable, "Headline and cost; open any one for detail.")}
      {g.minor.length ? (
        <Fold
          open={minorOpen}
          onOpenChange={setMinorOpen}
          summary={
            <>
              <SeverityPill severity="minor" /> <span className="num">{g.minor.length}</span> item{g.minor.length === 1 ? "" : "s"}:{" "}
              {g.minor
                .slice(0, 3)
                .map((f) => f.title.toLowerCase())
                .join(", ")}
              {g.minor.length > 3 ? "…" : ""}
            </>
          }
        >
          <div className="group" style={{ paddingTop: 4 }}>
            {g.minor.map(card)}
            {p.perms.dismiss ? (
              <button
                type="button"
                className="btn small"
                style={{ alignSelf: "flex-start" }}
                onClick={async () => {
                  const ids = g.minor.map((f) => f.id);
                  const r = await dismissMany(ids, "Standard for AtliQ");
                  if (!r.ok) return toast(r.error, { tone: "error" });
                  router.refresh();
                  toast(`${ids.length} minor item${ids.length === 1 ? "" : "s"} dismissed as standard.`, () => void restoreMany(ids).then(() => router.refresh()));
                }}
              >
                Dismiss all minor as standard
              </button>
            ) : null}
          </div>
        </Fold>
      ) : null}

      <section className="panel">
        <div className="sec-head">
          <h3>Checked by rules</h3>
          <span className="hint">Facts, not AI judgement</span>
        </div>
        <ul className="checks">
          {g.rules.map((f) => (
            <li key={f.id}>
              <span className={`mk ${f.severity === "serious" ? "n" : "w"}`}>{f.severity === "serious" ? "Fix" : "Confirm"}</span>
              <span>
                <button type="button" className="linkish" onClick={() => go(f.id)}>
                  {f.title}
                </button>
                <span className="src">{f.whatItMeans}</span>
              </span>
            </li>
          ))}
          {!g.rules.length ? (
            <li>
              <span className="mk y">OK</span>
              <span>
                Signing company and governing law match AtliQ&apos;s rules.
                <span className="src">AtliQ Inc for US clients only; AtliQ Technologies Pvt Ltd for everyone else</span>
              </span>
            </li>
          ) : null}
          {g.history.map((f) => (
            <li key={f.id}>
              <span className="mk y">History</span>
              <span>
                {f.title}
                <span className="src">An expired promise: shown for context, not as a clash</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {deliveryRows.length ? (
        <section className="panel">
          <div className="sec-head">
            <h3>Can we deliver?</h3>
            <span className={`sev ${deliverVerdict[0]}`}>{deliverVerdict[1]}</span>
          </div>
          <p className="hint">Checked against the deal&apos;s documents, AtliQ&apos;s deal-type rules and where the work is delivered from.</p>
          <ul className="checks">
            {deliveryRows.map((r, i) => (
              <li key={i}>
                <span className={`mk ${r.mk}`}>{r.mk === "y" ? "OK" : r.mk === "n" ? "Blocker" : "Check"}</span>
                <span>
                  {r.id ? (
                    <button type="button" className="linkish" onClick={() => go(r.id!)}>
                      <b>{r.label}</b>
                    </button>
                  ) : (
                    <b>{r.label}</b>
                  )}
                  <span className="src">{r.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Fold
        summary={
          <>
            <span className={`sev ${missingCount ? "negotiable" : "okc"}`}>Protections</span>{" "}
            {missingCount ? `${missingCount} protection${missingCount === 1 ? "" : "s"} a supplier needs ${missingCount === 1 ? "is" : "are"} missing` : "No missing protections found"}
          </>
        }
      >
        {g.missing.length ? (
          g.missing.map((f) => (
            <div key={f.id} className="fold-row">
              <span className="mk n" style={{ fontWeight: 600, fontSize: 12, minWidth: 62 }}>
                Missing
              </span>
              <span className="grow">{f.title}</span>
              <button type="button" className="btn quiet small" onClick={() => go(f.id)}>
                See finding
              </button>
            </div>
          ))
        ) : (
          <p className="hint" style={{ padding: "8px 0" }}>
            Checked only where the risk exists: penalty cap and client-delay exclusion, liability cap, indemnity, payment for work done, AtliQ&apos;s own tools, NDA exceptions, data agreements.
          </p>
        )}
      </Fold>

      <Fold
        summary={
          <>
            <span className="sev neutral">Usual terms</span> {usualDiffers} of {usual.length} terms differ from what AtliQ usually signs
          </>
        }
      >
        <div className="tablewrap" style={{ marginTop: 4 }}>
          <table>
            <thead>
              <tr>
                <th>Term</th>
                <th>Our usual</th>
                <th>This contract</th>
              </tr>
            </thead>
            <tbody>
              {usual.map((u) => (
                <tr key={u.term}>
                  <td className="co">
                    {termLabel(u.term)}
                    {u.count ? <small>{u.count}</small> : null}
                  </td>
                  <td style={{ maxWidth: 320 }}>{u.usual}</td>
                  <td style={{ maxWidth: 320 }}>
                    {u.differs ? (
                      <>
                        <span className="mk n" style={{ fontWeight: 600 }}>
                          Differs
                        </span>{" "}
                        <button type="button" className="linkish lnk" onClick={() => go(u.differs!.id)}>
                          {u.differs.title}
                        </button>
                      </>
                    ) : (
                      <span className="mk y" style={{ fontWeight: 600 }}>
                        No difference found
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint" style={{ paddingTop: 8 }}>
          Learned from AtliQ&apos;s signed client contracts. <Link className="lnk" href="/register?tab=usual">See the sources</Link>
        </p>
      </Fold>

      {g.dismissed.length ? (
        <Fold open={dismissedOpen} onOpenChange={setDismissedOpen} summary={<><span className="sev neutral">Dismissed</span> {g.dismissed.length} item{g.dismissed.length === 1 ? "" : "s"}</>}>
          <div className="group" style={{ paddingTop: 4 }}>
            {g.dismissed.map(card)}
          </div>
        </Fold>
      ) : null}
    </>
  );

  const rail = (
    <aside className="rail">
      <div className="score-card">
        <div className="score-row">
          <span className="score num">
            {score}
            <small>/100</small>
          </span>
          <span className={`sev ${band.toLowerCase()}`}>{band} risk</span>
        </div>
        <p className="hint">Any Serious item makes a contract High risk. Score = 20 per Serious, 10 per Negotiable, 2 per Minor or Not sure.</p>
        <div className="mix" aria-hidden="true">
          {SEV_ORDER.map((s) => (counts[s] ? <i key={s} style={{ flex: counts[s] * Math.max(1, s === "minor" || s === "not_sure" ? 2 : s === "serious" ? 20 : 10), background: MIX_COLOR[s] }} /> : null))}
        </div>
        <div className="legend">
          {SEV_ORDER.map((s) => {
            const first = p.findings.find((f) => f.severity === s && !f.dismissed && f.versionTag !== "resolved");
            return (
              <button key={s} type="button" onClick={() => first && go(first.id)} disabled={!first}>
                <span className={`sev ${s === "not_sure" ? "unsure" : s}`}>{SEV_NAME[s]}</span> <b>{counts[s]}</b>
              </button>
            );
          })}
        </div>
      </div>
      {p.handoff}

      {expo.length ? (
        <div className="score-card">
          <h3>What it could cost</h3>
          <p style={{ fontSize: 14 }}>
            <b>{exposureHeadline(expo, p.dealValue, money)}</b>
          </p>
          <div className="expo">
            {(() => {
              const fin = expo.filter((r) => r.value !== null).map((r) => r.value!);
              const max = Math.max(p.dealValue ?? 0, ...fin, 1) * 1.12;
              const pos = (v: number) => Math.min(100, (v / max) * 100);
              return (
                <>
                  {p.dealValue ? (
                    <div className="ex-head">
                      <span>Bars are drawn to one scale</span>
                      <span>Dashed line: deal value, {money(p.dealValue)}</span>
                    </div>
                  ) : null}
                  {expo.map((r) => (
                    <button key={r.id} type="button" className={`ex-row${r.accepted ? " done" : ""}`} onClick={() => go(r.id)}>
                      <span className="ex-top">
                        <span>
                          {r.label}
                          {r.accepted ? " · Accepted" : ""}
                        </span>
                        <b>{r.value === null ? "Unlimited" : money(r.value)}</b>
                      </span>
                      <span className="ex-track" aria-hidden="true">
                        <i className={r.value === null ? "inf" : ""} style={r.value === null ? undefined : { width: `${pos(r.value)}%`, background: r.severity === "serious" ? "var(--serious)" : "var(--nego)" }} />
                        {p.dealValue ? <span className="ex-deal" style={{ left: `${pos(p.dealValue)}%` }} /> : null}
                      </span>
                      {r.note ? <span className="hint">{r.note}</span> : null}
                    </button>
                  ))}
                </>
              );
            })()}
          </div>
          <p className="hint">Worked out by code from the deal value. Costs can overlap, so they aren&apos;t added up.</p>
        </div>
      ) : null}

      <DecisionPanel
        contractId={p.contractId}
        serious={serious.map((f) => ({ id: f.id, title: f.title, settled: f.accepted }))}
        decision={p.decision}
        decisionNote={p.decisionNote}
        canDecide={p.canDecide}
        onJump={go}
      />
      {p.history.length ? (
        <div className="score-card">
          <h3>Stage history</h3>
          <ul className="mini-list">
            {[...p.history].reverse().map((h, i) => (
              <li key={i} style={{ alignItems: "flex-start", fontSize: 13 }}>
                <span>{h.text}</span>
                <span className="hint num" style={{ whiteSpace: "nowrap" }}>
                  {h.at}
                </span>
              </li>
            ))}
          </ul>
          <p className="hint">Built from what happened. Nobody moves a stage by hand.</p>
        </div>
      ) : null}
      {p.rerun ? (
        <details className="decide">
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Run the review again</summary>
          <div style={{ marginTop: 10 }}>
            <RunReviewPanel contractId={p.contractId} clauses={p.rerun.clauses} last={null} daysUntilDue={p.rerun.daysUntilDue} horizonDays={p.rerun.horizonDays} />
          </div>
          <p className="hint" style={{ marginTop: 8 }}>
            Reviewed {p.reviewedAt ? new Date(p.reviewedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : ""} with {p.model}.
          </p>
        </details>
      ) : null}
    </aside>
  );

  return (
    <>
      <nav className="tabs" role="tablist" aria-label="Report">
        {tabs.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {label}
            {k === "versions" && p.version > 1 ? <span className="muted num" style={{ marginLeft: 6 }}>v{p.version}</span> : null}
          </button>
        ))}
      </nav>
      <div className="report-grid">
        <div className="rep-main">
          {tab === "findings" ? findingsTab : null}
          {tab === "text" ? (
            <>
              <p className="hint">Highlighted passages have findings: red for Serious, amber for the rest. Click one to open its finding.</p>
              <pre className="doc">{highlighted}</pre>
            </>
          ) : null}
          {tab === "ai" ? (
            p.maskedText ? (
              <>
                <p className="hint">
                  Exactly what was sent to the AI. Names, emails, phone numbers, addresses and IDs were replaced with labels such as CLIENT_A and PERSON_1 before every call. The key that maps them back
                  never leaves AtliQ&apos;s server.
                </p>
                <pre className="doc masked">{p.maskedText}</pre>
              </>
            ) : (
              <div className="stub">
                <p>Nothing has been sent to the AI for this contract yet.</p>
              </div>
            )
          ) : null}
          {tab === "versions" ? (
            p.versions ? (
              <>
                <section className="panel">
                  <div className="sec-head">
                    <h3>
                      v{p.versions.prevVersion} → v{p.version}
                    </h3>
                    <span className="hint">The whole contract was read again; this shows what moved.</span>
                  </div>
                  <div className="dismiss-row">
                    <span className="tag fast">{g.resolved.length} resolved</span>
                    <span className="tag new">{p.findings.filter((f) => f.versionTag === "new").length} new</span>
                    <span className="tag">{p.findings.filter((f) => f.versionTag === "unchanged").length} unchanged</span>
                  </div>
                  <ul className="mini-list">
                    {[...g.resolved, ...p.findings.filter((f) => f.versionTag === "new")].map((f) => (
                      <li key={f.id}>
                        <span>
                          <span className={`tag ${f.versionTag === "resolved" ? "fast" : "new"}`}>{f.versionTag === "resolved" ? "Resolved" : "New"}</span> <b>{f.title}</b>{" "}
                          <span className="hint">{f.clause ? clauseLabel(f.clause) : ""}</span>
                        </span>
                        {f.versionTag !== "resolved" ? (
                          <button type="button" className="btn quiet small" onClick={() => go(f.id)}>
                            See finding
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
                <section className="panel">
                  <div className="sec-head">
                    <h3>What changed in the text</h3>
                    <Link className="lnk" href={`/contracts/${p.versions.prevId}`}>
                      Open v{p.versions.prevVersion}
                    </Link>
                  </div>
                  <div style={{ border: "1px solid var(--rule)", borderRadius: 6 }}>
                    {p.versions.rows.filter((r) => r.kind !== "same").length ? (
                      p.versions.rows
                        .filter((r) => r.kind !== "same")
                        .map((r, i) => (
                          <div key={i} className="diffrow">
                            <div>
                              {r.kind === "change" ? r.left.map((w, j) => <span key={j} className={w.kind === "del" ? "del" : undefined}>{w.text}</span>) : r.kind === "del" ? <span className="del">{r.left}</span> : null}
                            </div>
                            <div>
                              {r.kind === "change" ? r.right.map((w, j) => <span key={j} className={w.kind === "add" ? "add" : undefined}>{w.text}</span>) : r.kind === "add" ? <span className="add">{r.right}</span> : null}
                            </div>
                          </div>
                        ))
                    ) : (
                      <p className="hint" style={{ padding: 12 }}>
                        No wording changed.
                      </p>
                    )}
                  </div>
                </section>
              </>
            ) : (
              <section className="panel">
                <h3>Versions</h3>
                <p className="hint">
                  Only one version so far. When a revised draft arrives, upload it as a new version: the whole contract is read again and this tab shows what changed, word by word.
                </p>
                <div>
                  <Link className="btn small" href={`/contracts/new?previous=${p.contractId}`}>
                    Upload a revised version
                  </Link>
                </div>
              </section>
            )
          ) : null}
        </div>
        {rail}
      </div>
    </>
  );
}
