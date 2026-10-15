// A printable brief for counsel or a meeting: the summary, Serious items with their verbatim quotes, the rest by
// title, and the counsel questions. Read-only; it copies nothing into the contract.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getReport } from "@/lib/data/report";
import { counselQuestionsList } from "@/lib/data/handoff";
import { formatDate } from "@/lib/checks/dates";
import { clauseLabel, displayTitle, docLabel } from "@/lib/display";
import { money } from "@/lib/format";
import { PrintButton } from "@/components/handoff/PrintButton";

export const metadata: Metadata = { title: "Brief" };
export const dynamic = "force-dynamic";

export default async function BriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [data, questions] = await Promise.all([getReport(id), counselQuestionsList({ contractId: id })]);
  if (!data || data.review?.status !== "done") notFound();
  const { contract, deal, review } = data;
  const t = displayTitle(contract);
  const open = data.findings.filter((f) => !f.dismissed);
  const by = (s: string) => open.filter((f) => f.severity === s);
  const serious = by("serious");

  return (
    <section className="wrap page" style={{ maxWidth: 820 }}>
      <div className="dismiss-row no-print" style={{ justifyContent: "space-between" }}>
        <Link className="btn quiet small" href={`/contracts/${id}`}>
          Back to the report
        </Link>
        <PrintButton />
      </div>
      <p className="eyebrow">Brief · prepared {formatDate(new Date().toISOString().slice(0, 10))} from AtliQ Review</p>
      <h1 className="display">
        {t.primary} · {docLabel(contract.docType)} v{contract.version}
      </h1>
      <div className="rep-meta">
        <span>
          Risk <b>{review!.band}</b> · {review!.score}/100
        </span>
        {deal ? (
          <span>
            Deal value <b>{money(deal.valueUsd, deal.currency)}</b>
          </span>
        ) : null}
        {deal?.clientDeadline ? (
          <span>
            Client deadline <b>{formatDate(deal.clientDeadline)}</b>
          </span>
        ) : null}
        <span>
          Owner <b>{deal?.owner ?? contract.owner ?? "—"}</b>
        </span>
      </div>
      <p className="hint">
        {review!.coverageLine} · {data.registerLine}
      </p>

      <h2>In three lines</h2>
      <ol>
        {(review!.summary ?? []).map((s, i) => (
          <li key={i} style={{ marginBottom: 6 }}>
            {s.text}
          </li>
        ))}
      </ol>

      <h2>Serious · {serious.length}</h2>
      {serious.length ? (
        serious.map((f) => (
          <article key={f.id} style={{ breakInside: "avoid", borderTop: "1px solid var(--rule)", padding: "12px 0" }}>
            <h3 style={{ margin: "0 0 6px" }}>
              {f.title} <span className="hint">· {clauseLabel(f.clause) || "whole document"}</span>
            </h3>
            {f.quote ? <p className="quote">{f.quote}</p> : <p className="hint">Not found after reading every clause.</p>}
            {f.whatItMeans ? (
              <p style={{ margin: "6px 0" }}>
                <b>What it means:</b> {f.whatItMeans}
              </p>
            ) : null}
            {f.whatItCouldCost ? (
              <p style={{ margin: "6px 0" }}>
                <b>What it could cost:</b> {f.whatItCouldCost}
              </p>
            ) : null}
            {f.howToSoften ? (
              <p style={{ margin: "6px 0" }}>
                <b>How to soften it:</b> {f.howToSoften}
              </p>
            ) : null}
            {f.accepted ? <p className="hint">Accepted by Karandeep: {f.acceptNote}</p> : null}
          </article>
        ))
      ) : (
        <p>None.</p>
      )}

      {(["negotiable", "not_sure"] as const).map((s) =>
        by(s).length ? (
          <section key={s}>
            <h2>
              {s === "negotiable" ? "Negotiable" : "Not sure"} · {by(s).length}
            </h2>
            <ul>
              {by(s).map((f) => (
                <li key={f.id}>
                  {f.title} <span className="hint">· {clauseLabel(f.clause) || "whole document"}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null,
      )}

      {questions.length ? (
        <>
          <h2>Questions for counsel</h2>
          <ol>
            {questions.map((q) => (
              <li key={q.id} style={{ marginBottom: 8 }}>
                {q.question}
                {q.answerBy ? <span className="hint"> · answer by {formatDate(q.answerBy)}</span> : null}
                {q.answer ? (
                  <p className="answerbox" style={{ margin: "6px 0 0" }}>
                    <b>{q.answeredBy}:</b> {q.answer}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </>
      ) : null}
      <p className="hint">Contains client names, unmasked. Share only with counsel. AtliQ Review informs; Karandeep decides.</p>
    </section>
  );
}
