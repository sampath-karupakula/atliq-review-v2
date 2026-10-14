import Link from "next/link";
import { RowLink } from "./RowLink";
import { SeverityChip, Tag } from "@/components/ui";
import { formatDate } from "@/lib/checks/dates";
import { daysLeft, deadlineWords, type QueueRow } from "@/lib/queue";
import { docLabel } from "@/lib/display";
import { companyKey } from "@/lib/companies";

const STATE_LABEL: Record<QueueRow["reviewState"], string> = {
  not_reviewed: "Not reviewed",
  queued: "Queued",
  running: "Reviewing…",
  done: "Reviewed",
  failed: "Review failed",
};

function RiskCell({ r }: { r: QueueRow }) {
  if (r.reviewState !== "done" || !r.band) return <SeverityChip sev="neutral">{STATE_LABEL[r.reviewState]}</SeverityChip>;
  return (
    <div className="risk">
      <SeverityChip sev={r.band.toLowerCase() as "high" | "medium" | "low"}>{r.band}</SeverityChip>
      <span className="num muted" style={{ fontSize: 13 }}>
        {r.score}
      </span>
      {r.liveClash ? <Tag kind="clash">Clash</Tag> : null}
    </div>
  );
}

export function QueueTable({ rows, today, empty }: { rows: QueueRow[]; today: string; empty?: React.ReactNode }) {
  if (!rows.length)
    return (
      empty ?? (
        <div className="stub">
          <p>No contracts match this filter.</p>
          <Link className="btn small" href="/contracts?view=open">
            Show all
          </Link>
        </div>
      )
    );
  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            <th>Contract</th>
            <th>Client deadline</th>
            <th>Risk</th>
            <th>Top issue</th>
            <th>First review</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const d = daysLeft(r, today);
            const late = r.reviewDeadline ? r.reviewDeadline < today : false;
            return (
              <RowLink key={r.id} href={`/contracts/${r.id}`}>
                <td className="co">
                  <Link href={`/contracts/${r.id}`} style={{ textDecoration: "none" }}>
                    {r.companyName ?? r.counterparty}
                  </Link>
                  <small>
                    {docLabel(r.docType)}
                    {/* A freelancer or agency document filed under the client names its own counterparty. */}
                    {r.companyName && companyKey(r.companyName) !== companyKey(r.counterparty) ? ` with ${r.counterparty}` : ""}
                    {r.direction === "atliq_buyer" ? " · AtliQ is the buyer" : ""}
                    {r.owner ? ` · ${r.owner}` : ""}
                  </small>
                </td>
                <td className={`dl${d !== null && d <= 3 ? " soon" : ""}`}>
                  <b className="num">{formatDate(r.deadline)}</b>
                  <small title={r.deadlineNote ?? undefined}>{deadlineWords(d)}</small>
                </td>
                <td>
                  <RiskCell r={r} />
                </td>
                <td style={{ maxWidth: 280, color: "var(--ink-2)" }}>{r.topIssue ?? <span className="muted">{r.reviewState === "done" ? "Nothing open" : "Not reviewed yet"}</span>}</td>
                <td className="who">
                  {r.reviewer ? (
                    <>
                      {r.reviewer}
                      <small className="hint" style={{ display: "block", color: late ? "var(--nego)" : undefined }}>
                        {late ? "Overdue · was " : "by "}
                        {formatDate(r.reviewDeadline)}
                      </small>
                    </>
                  ) : (
                    <span className="muted">None</span>
                  )}
                </td>
              </RowLink>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
