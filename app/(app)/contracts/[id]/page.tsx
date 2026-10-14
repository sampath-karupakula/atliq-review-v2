import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { contracts } from "@/lib/db/schema";
import { getReport } from "@/lib/data/report";
import { daysBetween, formatDate } from "@/lib/checks/dates";
import { splitClauses } from "@/lib/ingest/clauses";
import { appToday, reviewHorizonDays } from "@/lib/config";
import { displayTitle, docLabel } from "@/lib/display";
import { Crumbs } from "@/components/ui";
import { RunReviewPanel } from "@/components/report/ReviewRunner";
import { Report, type Tab } from "@/components/report/Report";
import { INTERRUPTED_MS } from "@/lib/data/driver";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { deadlineWords } from "@/lib/queue";
import { money } from "@/lib/format";
import { diffParagraphs } from "@/lib/ux/diff";
import type { ReportFinding, Sev } from "@/lib/report/model";

export const dynamic = "force-dynamic";

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
  const title = displayTitle(contract);
  const due = deal?.clientDeadline ?? null;
  const daysLeft = due ? daysBetween(today, due) : null;
  const clauses = Math.max(contract.clauseCount, splitClauses(contract.text).sectionCount);
  const done = review?.status === "done";
  const canRun = can(me, "review.start", { assignee: data.assignment?.reviewer ?? null });
  // A running review is followed live (it runs on the server); one with no progress for 10 minutes was interrupted.
  const runningElsewhere = !!review && (review.status === "running" || review.status === "queued") && Date.now() - (review.progressAt ?? review.startedAt).getTime() < INTERRUPTED_MS;
  const stopped = review && !done && !runningElsewhere ? review : null;
  const last = stopped ? { reviewId: stopped.id, error: stopped.error, resumable: !!(stopped.artifacts as { state?: unknown })?.state } : null;

  const posById = new Map(data.positions.map((x) => [x.id, x]));
  const findings: ReportFinding[] = data.findings.map((f) => {
    const rel = (f.related ?? {}) as Record<string, unknown>;
    return {
      id: f.id,
      key: String(rel.key ?? f.id),
      check: f.check,
      category: f.category,
      severity: f.severity as Sev,
      title: f.title,
      clause: f.clause,
      quote: f.quote,
      quoteVerified: f.quoteVerified,
      absent: f.absent,
      whatItMeans: f.whatItMeans,
      whatItCouldCost: f.whatItCouldCost,
      howToSoften: f.howToSoften,
      versionTag: f.versionTag,
      dismissed: f.dismissed,
      dismissedBy: f.dismissedBy,
      dismissReason: f.dismissReason,
      accepted: f.accepted,
      acceptNote: f.acceptNote,
      source: f.source,
      related: rel,
      positions: f.pastPositions.map((pid) => posById.get(pid)).filter((x): x is NonNullable<typeof x> => !!x),
    };
  });

  let versions: { prevId: string; prevVersion: number; rows: ReturnType<typeof diffParagraphs> } | null = null;
  if (contract.previousVersionId) {
    const [prev] = await getDb().select({ id: contracts.id, version: contracts.version, text: contracts.text }).from(contracts).where(eq(contracts.id, contract.previousVersionId));
    if (prev) versions = { prevId: prev.id, prevVersion: prev.version, rows: diffParagraphs(prev.text, contract.text) };
  }

  const state = (review?.artifacts as { state?: { extract?: unknown } } | undefined)?.state;
  const bundleDocs = data.bundle.filter((b) => b.id !== contract.id);
  const initialTab: Tab = (["findings", "text", "ai", "versions"] as const).includes(sp.tab as Tab) ? (sp.tab as Tab) : "findings";

  const runPanel = (
    <RunReviewPanel contractId={contract.id} clauses={clauses} last={last} runningId={runningElsewhere ? review!.id : null} daysUntilDue={daysLeft} horizonDays={reviewHorizonDays()} />
  );

  return (
    <section className="wrap page">
      <div className="rep-head">
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
        <div className="rep-meta">
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
          <span>
            Version <b>v{contract.version}</b>
          </span>
          {contract.direction === "atliq_buyer" ? <span className="tag buyer">AtliQ is the buyer</span> : null}
        </div>
        {deal && bundleDocs.length ? (
          <p className="partof">
            Part of the deal <b>{deal.name}</b> · {bundleDocs.length + 1} documents
            <Link className="btn small" href={`/deals/${deal.id}`}>
              Open the deal
            </Link>
          </p>
        ) : null}
        <span className="coverage">
          {done && review?.coverageLine ? review.coverageLine : `${contract.clauseCount} numbered clauses found`} · {data.registerLine}
        </span>
      </div>

      {done ? (
        <Report
          contractId={contract.id}
          docType={contract.docType}
          initialTab={initialTab}
          text={contract.text}
          maskedText={review?.textMasked ?? null}
          findings={findings}
          summary={review?.summary ?? []}
          baseline={data.baseline.map((b) => ({ term: b.term, usual: b.usual, count: b.count }))}
          dealValue={deal?.valueUsd ?? null}
          currency={deal?.currency ?? "USD"}
          coverageLine={review?.coverageLine ?? ""}
          registerLine={data.registerLine}
          extract={state?.extract ?? null}
          deal={deal ? { deliveredFrom: deal.deliveredFrom, dataTouchers: deal.dataTouchers, personalData: deal.personalData, phi: deal.phi, clientCountry: deal.clientCountry } : null}
          versions={versions}
          version={contract.version}
          reviewedAt={review?.finishedAt?.toISOString() ?? null}
          model={review?.model ?? null}
          canDecide={can(me, "decision.set")}
          rerun={canRun ? { clauses, daysUntilDue: daysLeft, horizonDays: reviewHorizonDays() } : null}
        />
      ) : canRun ? (
        <div className="report-grid">
          <div className="panel">
            <h3>AI review</h3>
            <p className="hint">Not reviewed yet. Every clause is read, checked against AtliQ&apos;s promises, usual terms and the deal, and every quote is verified word for word.</p>
            {runPanel}
          </div>
          <aside className="side">
            <div className="panel">
              <h3>Before the review</h3>
              <p className="hint">The contract text is already on file. Open it below; nothing is sent to the AI until the review starts.</p>
              <Link className="btn small" href="#text">
                Read the contract
              </Link>
            </div>
          </aside>
          <pre id="text" className="doc" style={{ gridColumn: "1 / -1" }}>
            {contract.text}
          </pre>
        </div>
      ) : (
        <>
          <div className="stub">
            <p>{data.assignment ? `This contract is assigned to ${data.assignment.reviewer}; they start its review.` : "Not reviewed yet."}</p>
          </div>
          <pre className="doc">{contract.text}</pre>
        </>
      )}
    </section>
  );
}
