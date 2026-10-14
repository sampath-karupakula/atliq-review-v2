import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getReport } from "@/lib/data/report";
import { countSeverities, scoreOf } from "@/lib/score/score";
import { daysBetween, formatDate } from "@/lib/checks/dates";
import { splitClauses } from "@/lib/ingest/clauses";
import { appToday, reviewHorizonDays } from "@/lib/config";
import { displayTitle, docLabel } from "@/lib/display";
import { BandPill, Crumbs, SeverityPill, type PipelineSeverity } from "@/components/ui";
import { RunReviewPanel } from "@/components/report/ReviewRunner";
import { INTERRUPTED_MS } from "@/lib/data/driver";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { deadlineWords } from "@/lib/queue";
import { money } from "@/lib/format";
import type { Severity } from "@/lib/pipeline/types";

export const dynamic = "force-dynamic";

type Tab = "review" | "text" | "ai";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const data = /^[0-9a-f-]{36}$/i.test(id) ? await getReport(id) : null;
  return { title: data ? displayTitle(data.contract).primary : "Contract" };
}

export default async function ContractPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await getReport(id);
  if (!data) notFound();
  const { contract, deal, review, company } = data;
  const me = await getCurrentUser();
  const today = appToday();
  const tab: Tab = sp.tab === "text" || sp.tab === "ai" ? sp.tab : "review";
  const title = displayTitle(contract);
  const due = deal?.clientDeadline ?? null;
  const daysLeft = due ? daysBetween(today, due) : null;

  const done = review?.status === "done";
  const counts = countSeverities(data.findings.map((f) => ({ severity: f.severity as Severity, dismissed: f.dismissed })));
  const live = scoreOf(counts);
  // A running review is followed live (it runs on the server); one with no progress for 10 minutes was interrupted.
  const runningElsewhere = !!review && (review.status === "running" || review.status === "queued") && Date.now() - (review.progressAt ?? review.startedAt).getTime() < INTERRUPTED_MS;
  const stopped = review && !done && !runningElsewhere ? review : null;
  const last = stopped ? { reviewId: stopped.id, error: stopped.error, resumable: !!(stopped.artifacts as { state?: unknown })?.state } : null;
  const canRun = can(me, "review.start", { assignee: data.assignment?.reviewer ?? null });
  const order: PipelineSeverity[] = ["serious", "negotiable", "not_sure", "minor"];
  const shown = data.findings.filter((f) => !f.dismissed && f.severity !== "info").sort((a, b) => order.indexOf(a.severity as PipelineSeverity) - order.indexOf(b.severity as PipelineSeverity) || a.sort - b.sort);

  const tabs: [Tab, string][] = [
    ["review", "Review"],
    ["text", "Contract text"],
    ["ai", "What the AI saw"],
  ];

  return (
    <section className="wrap page">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Crumbs
          items={[
            { href: "/contracts", label: "Contracts" },
            ...(company ? [{ href: `/companies/${company.id}`, label: company.name }] : []),
            { label: `${title.secondary} · v${contract.version}` },
          ]}
        />
        <h1 className="display">
          {title.primary} · {docLabel(contract.docType)}
        </h1>
        <div className="dismiss-row" style={{ fontSize: 13.5, color: "var(--ink-2)", gap: "8px 20px" }}>
          <span>
            Client deadline <b>{formatDate(due)}</b> ({deadlineWords(daysLeft)})
          </span>
          {deal ? (
            <span>
              Deal value <b>{money(deal.valueUsd, deal.currency)}</b>
            </span>
          ) : null}
          <span>
            Owner <b>{deal?.owner ?? contract.owner ?? "—"}</b>
          </span>
          {data.assignment ? (
            <span>
              First review <b>{data.assignment.reviewer}</b> by {formatDate(data.assignment.reviewDeadline)}
            </span>
          ) : null}
          {contract.direction === "atliq_buyer" ? <span className="tag buyer">AtliQ is the buyer</span> : null}
        </div>
        <span className="hint" style={{ border: "1px solid var(--rule)", background: "var(--surface)", borderRadius: 6, padding: "6px 10px", alignSelf: "flex-start", fontSize: 13, color: "var(--ink-2)" }}>
          {done && review?.coverageLine ? `${review.coverageLine} · ` : `${contract.clauseCount} numbered clauses found · `}
          {data.registerLine}
        </span>
      </div>

      <nav className="tabs" aria-label="Contract sections">
        {tabs.map(([k, label]) => (
          <Link key={k} href={`/contracts/${contract.id}${k === "review" ? "" : `?tab=${k}`}`} aria-current={tab === k ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </nav>

      {tab === "review" ? (
        done ? (
          <div className="report-grid">
            <div className="rep-main">
              {review?.summary?.length ? (
                <div className="panel">
                  <p className="eyebrow">Summary</p>
                  <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
                    {review.summary.map((s, i) => (
                      <li key={i}>{s.text}</li>
                    ))}
                  </ol>
                </div>
              ) : null}
              <div className="panel">
                <div className="sec-head">
                  <h3>Findings, Serious first</h3>
                  <span className="hint">The full report layout arrives in P5</span>
                </div>
                <ul className="mini-list">
                  {shown.map((f) => (
                    <li key={f.id} style={{ alignItems: "flex-start" }}>
                      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <b>{f.title}</b>
                        <span className="hint">
                          {f.clause ? `Clause ${f.clause}` : "Whole document"}
                          {f.whatItCouldCost ? ` · ${f.whatItCouldCost}` : ""}
                        </span>
                      </span>
                      <SeverityPill severity={f.severity as PipelineSeverity} />
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <aside className="rail">
              <div className="score-card">
                <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
                  <span className="num" style={{ fontFamily: "var(--f-display)", fontSize: 48, lineHeight: 1 }}>
                    {live.score}
                    <small style={{ fontSize: 16, color: "var(--ink-3)" }}>/100</small>
                  </span>
                  <BandPill band={live.band} />
                </div>
                <p className="hint">Score = 20 per Serious, 10 per Negotiable, 2 per Minor or Not sure. Any Serious item makes a contract High risk.</p>
                <p className="hint">
                  Reviewed {review?.finishedAt ? review.finishedAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : ""} · {review?.model}
                </p>
              </div>
              {canRun ? (
                <div className="decide">
                  <h3>Run again</h3>
                  <RunReviewPanel contractId={contract.id} clauses={Math.max(contract.clauseCount, splitClauses(contract.text).sectionCount)} last={null} daysUntilDue={daysLeft} horizonDays={reviewHorizonDays()} />
                </div>
              ) : null}
            </aside>
          </div>
        ) : canRun ? (
          <div className="panel" style={{ maxWidth: 720 }}>
            <h3>AI review</h3>
            <p className="hint">Not reviewed yet. Reading every clause, checking it against AtliQ&apos;s promises, usual terms and the deal, then verifying every quote.</p>
            <RunReviewPanel
              contractId={contract.id}
              clauses={Math.max(contract.clauseCount, splitClauses(contract.text).sectionCount)}
              last={last}
              runningId={runningElsewhere ? review!.id : null}
              daysUntilDue={daysLeft}
              horizonDays={reviewHorizonDays()}
            />
          </div>
        ) : (
          <div className="stub">
            <p>{data.assignment ? `This contract is assigned to ${data.assignment.reviewer}; they start its review.` : "Not reviewed yet."}</p>
          </div>
        )
      ) : null}

      {tab === "text" ? (
        <div className="panel" style={{ maxWidth: "80ch" }}>
          <p className="eyebrow">
            {contract.title} · v{contract.version}
          </p>
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "var(--f-display)", fontSize: 15.5, lineHeight: 1.7, margin: 0 }}>{contract.text}</pre>
        </div>
      ) : null}

      {tab === "ai" ? (
        review?.textMasked ? (
          <div className="panel" style={{ maxWidth: "80ch" }}>
            <p className="hint">
              Exactly what was sent to the AI. Names, emails, phone numbers, addresses and IDs were replaced with labels before every call; the key that maps them back never leaves AtliQ&apos;s server.
            </p>
            <pre style={{ whiteSpace: "pre-wrap", fontFamily: "var(--f-mono)", fontSize: 13, lineHeight: 1.6, margin: 0 }}>{review.textMasked}</pre>
          </div>
        ) : (
          <div className="stub">
            <p>Nothing has been sent to the AI for this contract yet. Masking happens when a review starts.</p>
          </div>
        )
      ) : null}
    </section>
  );
}
